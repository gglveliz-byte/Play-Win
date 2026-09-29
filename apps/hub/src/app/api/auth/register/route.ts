import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import type pg from 'pg';
import { withTransaction } from '@/lib/db';
import { authLib } from '@/lib/auth';
import { sendWelcomeEmail, sendVerificationEmail } from '@/lib/email';
import { GAME_IDS, INITIAL_SKILL_RATING, resolveRankTier } from '@playwin/database';
import { badRequest, conflict, tooManyRequests, serverError } from '@/lib/api-response';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

/**
 * Límite de registros por IP: frena la creación masiva de cuentas.
 * Se mantiene holgado para no bloquear desarrollo ni suites de prueba (que
 * crean varios usuarios por ejecución); sigue siendo un techo eficaz contra
 * el alta automatizada de cuentas.
 */
const REGISTER_LIMIT = 20;
const REGISTER_WINDOW_MS = 60 * 60_000;

/** Capacidad máxima de una micro-liga. */
const LEAGUE_CAPACITY = 10;

/**
 * Asigna al jugador a una liga abierta de su división, o crea una nueva.
 *
 * Opera SIEMPRE sobre el cliente de la transacción y bloquea las ligas
 * candidatas con FOR UPDATE para que dos registros concurrentes no puedan
 * leer la misma liga con 9 miembros e insertarse ambos (creando una liga de 11).
 */
async function assignLeagueWithinTransaction(client: pg.PoolClient, userId: string, gameId: string, rankTier: string) {
  const existing = await client.query(
    `SELECT m.league_id
     FROM league_members m
     JOIN league_groups g ON g.id = m.league_id
     WHERE m.user_id = $1 AND g.game_id = $2 AND g.is_locked = FALSE;`,
    [userId, gameId]
  );
  if (existing.rows.length > 0) return;

  // Bloquea las ligas candidatas para serializar asignaciones concurrentes.
  const candidates = await client.query(
    `SELECT g.id,
            (SELECT COUNT(*)::int FROM league_members WHERE league_id = g.id) AS member_count
     FROM league_groups g
     WHERE g.game_id = $1 AND g.rank_tier = $2 AND g.is_locked = FALSE
     ORDER BY g.created_at ASC
     FOR UPDATE;`,
    [gameId, rankTier]
  );

  let leagueId: string | null = null;
  for (const row of candidates.rows) {
    if (row.member_count < LEAGUE_CAPACITY) {
      leagueId = row.id;
      break;
    }
  }

  if (!leagueId) {
    const now = new Date();
    const created = await client.query(
      `INSERT INTO league_groups (season_number, game_id, rank_tier, prize_pool, starts_at, ends_at)
       VALUES (1, $1, $2, 25.00, $3, $4)
       RETURNING id;`,
      [gameId, rankTier, now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)]
    );
    leagueId = created.rows[0].id;
  }

  await client.query(
    `INSERT INTO league_members (league_id, user_id, season_points, position)
     VALUES ($1, $2, 0, 10)
     ON CONFLICT (league_id, user_id) DO NOTHING;`,
    [leagueId, userId]
  );

  // Sella la liga si alcanzó la capacidad: el jugador #10 cierra el grupo.
  await client.query(
    `UPDATE league_groups SET is_locked = TRUE
     WHERE id = $1
       AND (SELECT COUNT(*) FROM league_members WHERE league_id = $1) >= $2;`,
    [leagueId, LEAGUE_CAPACITY]
  );
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFrom(req);
    const limit = checkRateLimit({
      name: 'auth:register',
      key: ip,
      limit: REGISTER_LIMIT,
      windowMs: REGISTER_WINDOW_MS,
    });
    if (!limit.allowed) {
      return tooManyRequests(
        `Demasiados registros desde esta conexión. Espera ${limit.retryAfterSeconds} segundos.`,
        limit.retryAfterSeconds
      );
    }

    const body = await req.json();
    const { username, email, password, avatarUrl } = body;

    if (!username || !email || !password) {
      return badRequest('Todos los campos son obligatorios.');
    }

    if (username.length < 3 || username.length > 20) {
      return badRequest('El nombre de usuario debe tener entre 3 y 20 caracteres.');
    }

    if (password.length < 6) {
      return badRequest('La contraseña debe contener al menos 6 caracteres.');
    }

    const passwordHash = await authLib.hashPassword(password);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    // Un jugador nuevo parte con el MMR inicial, así que su división es la que
    // corresponda a ese MMR (no un 'BRONZE' fijo hardcodeado).
    const initialRankTier = resolveRankTier(INITIAL_SKILL_RATING);

    /**
     * TODO el alta ocurre en UNA transacción: usuario + 4 pasaportes + 4 ligas.
     * Antes cada paso iba por su cuenta, así que un fallo intermedio dejaba
     * usuarios sin pasaporte o sin liga, en silencio (BUG-013).
     */
    const user = await withTransaction(async (client) => {
      const existingUser = await client.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1);',
        [username.trim()]
      );
      if (existingUser.rows.length > 0) throw new DuplicateError('username');

      const existingEmail = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1);',
        [email.trim()]
      );
      if (existingEmail.rows.length > 0) throw new DuplicateError('email');

      const userRes = await client.query(
        `INSERT INTO users (username, email, password_hash, avatar_url, verification_token, is_verified)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING id, username, email, avatar_url, global_level, has_premium, wallet_balance, is_verified, created_at;`,
        [username.trim().toLowerCase(), email.trim().toLowerCase(), passwordHash, avatarUrl || '🎮', verificationToken]
      );
      const created = userRes.rows[0];

      for (const gameId of GAME_IDS) {
        await client.query(
          `INSERT INTO game_passports (user_id, game_id, rank_tier, skill_rating, season_points, total_matches, wins, losses, best_score)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
           ON CONFLICT (user_id, game_id) DO NOTHING;`,
          [created.id, gameId, initialRankTier, INITIAL_SKILL_RATING]
        );
        await assignLeagueWithinTransaction(client, created.id, gameId, initialRankTier);
      }

      return created;
    });

    // Los correos se envían DESPUÉS del commit: un fallo de SMTP no debe
    // deshacer un registro ya válido, y tampoco debe silenciarse.
    try {
      await sendWelcomeEmail({ to: user.email, username: user.username });
      await sendVerificationEmail({ to: user.email, username: user.username, token: verificationToken });
    } catch (emailErr) {
      console.error('[Register] Fallo al enviar correos de bienvenida/verificación:', emailErr);
    }

    const token = authLib.signUserToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const response = NextResponse.json({ success: true, user }, { status: 201 });
    response.cookies.set('playwin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return response;
  } catch (err) {
    if (err instanceof DuplicateError) {
      return conflict(
        err.field === 'username'
          ? 'El nombre de usuario ya está registrado.'
          : 'El correo electrónico ya está en uso.'
      );
    }
    return serverError(err, 'POST /api/auth/register');
  }
}

/** Conflicto de unicidad detectado dentro de la transacción. */
class DuplicateError extends Error {
  constructor(public readonly field: 'username' | 'email') {
    super(`Valor duplicado: ${field}`);
    this.name = 'DuplicateError';
  }
}
