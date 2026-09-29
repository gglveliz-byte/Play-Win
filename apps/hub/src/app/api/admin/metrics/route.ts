import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { authLib } from '@/lib/auth';
import { unauthorized, forbidden, serverError } from '@/lib/api-response';

/**
 * Métricas de auditoría para el panel de administración.
 *
 * SEGURIDAD: requiere sesión válida Y ser administrador. Antes no exigía nada:
 * cualquiera con la URL obtenía usuarios, partidas, semillas PRNG y movimientos
 * contables (BUG-004).
 *
 * Nombres de columna REALES (no inventar): `wallet_ledger.type` y
 * `league_groups.rank_tier`. La versión anterior consultaba `entry_type` y
 * `tier`, que no existen, por lo que el endpoint devolvía 500 siempre.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('playwin_session')?.value;
    const payload = token ? authLib.verifyToken(token) : null;

    if (!payload?.userId) {
      return unauthorized('Debes iniciar sesión para ver las métricas.');
    }

    const adminRes = await query('SELECT is_admin FROM users WHERE id = $1;', [payload.userId]);
    if (adminRes.rows.length === 0 || adminRes.rows[0].is_admin !== true) {
      return forbidden('Se requieren permisos de administrador.');
    }

    // 1. Partidas recientes con telemetría del árbitro
    const matchesRes = await query(`
      SELECT
        m.id, m.room_id, m.game_id, m.winner_id, m.p1_score, m.p2_score,
        m.seed, m.finish_reason, m.duration_ms, m.created_at,
        u1.username AS player1_username,
        u2.username AS player2_username,
        w.username AS winner_username
      FROM match_records m
      JOIN users u1 ON u1.id = m.player1_id
      JOIN users u2 ON u2.id = m.player2_id
      LEFT JOIN users w ON w.id = m.winner_id
      ORDER BY m.created_at DESC
      LIMIT 15;
    `);

    // 2. Resumen contable. La columna es `type`, NO `entry_type`.
    const ledgerRes = await query(`
      SELECT
        type,
        provider,
        COUNT(*)::int AS count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM wallet_ledger
      GROUP BY type, provider
      ORDER BY type, provider;
    `);

    // 3. Micro-Ligas activas. La columna es `rank_tier`, NO `tier`.
    const leaguesRes = await query(`
      SELECT
        g.id, g.game_id, g.season_number, g.rank_tier, g.is_locked, g.prize_pool, g.ends_at,
        (SELECT COUNT(*)::int FROM league_members WHERE league_id = g.id) AS member_count
      FROM league_groups g
      WHERE g.is_locked = FALSE
      ORDER BY g.created_at DESC;
    `);

    // 4. Estadísticas globales
    const usersCountRes = await query(`SELECT COUNT(*)::int AS total FROM users;`);
    const matchesCountRes = await query(`SELECT COUNT(*)::int AS total FROM match_records;`);
    const adminsCountRes = await query(`SELECT COUNT(*)::int AS total FROM users WHERE is_admin = TRUE;`);

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: usersCountRes.rows[0]?.total || 0,
        totalMatches: matchesCountRes.rows[0]?.total || 0,
        totalAdmins: adminsCountRes.rows[0]?.total || 0,
      },
      recentMatches: matchesRes.rows,
      ledgerSummary: ledgerRes.rows,
      activeLeagues: leaguesRes.rows,
    });
  } catch (err) {
    return serverError(err, 'GET /api/admin/metrics');
  }
}
