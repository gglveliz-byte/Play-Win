import { query, withTransaction } from './index';
import type pg from 'pg';
import { resolveRankTier, INITIAL_SKILL_RATING } from '@playwin/database';

/** Capacidad máxima de una micro-liga de 10 jugadores. */
const LEAGUE_CAPACITY = 10;

/**
 * Resuelve la división real del jugador en un juego a partir de su pasaporte.
 *
 * Antes todo el mundo entraba como 'BRONZE' porque ningún llamador calculaba
 * la división desde el skill_rating (BUG-019). Aquí se lee del pasaporte y se
 * traduce con `resolveRankTier()`.
 */
async function resolvePlayerTier(client: pg.PoolClient, userId: string, gameId: string): Promise<string> {
  const res = await client.query(
    'SELECT skill_rating FROM game_passports WHERE user_id = $1 AND game_id = $2;',
    [userId, gameId]
  );
  const rating = res.rows[0]?.skill_rating;
  return resolveRankTier(rating ?? INITIAL_SKILL_RATING);
}

/**
 * Busca una liga abierta con capacidad en la división indicada, o crea una.
 * Opera sobre el cliente de la transacción y bloquea las candidatas con
 * FOR UPDATE para serializar asignaciones concurrentes (BUG-020).
 */
async function findOrCreateOpenLeague(client: pg.PoolClient, gameId: string, rankTier: string) {
  const candidates = await client.query(
    `SELECT g.id, g.season_number, g.game_id, g.rank_tier, g.prize_pool, g.starts_at, g.ends_at,
            (SELECT COUNT(*)::int FROM league_members WHERE league_id = g.id) AS current_members
     FROM league_groups g
     WHERE g.game_id = $1 AND g.rank_tier = $2 AND g.is_locked = FALSE
     ORDER BY g.created_at ASC
     FOR UPDATE;`,
    [gameId, rankTier]
  );

  const open = candidates.rows.find((row) => row.current_members < LEAGUE_CAPACITY);
  if (open) return open;

  const now = new Date();
  const created = await client.query(
    `INSERT INTO league_groups (season_number, game_id, rank_tier, prize_pool, starts_at, ends_at)
     VALUES (1, $1, $2, 25.00, $3, $4)
     RETURNING id, season_number, game_id, rank_tier, prize_pool, starts_at, ends_at, 0 AS current_members;`,
    [gameId, rankTier, now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)]
  );
  return created.rows[0];
}

/**
 * Sella la liga si alcanzó la capacidad.
 * El diseño exige que entre el jugador #10 el grupo quede cerrado; antes
 * `is_locked` solo se activaba al cerrar la temporada (BUG-020).
 */
async function sealLeagueIfFull(client: pg.PoolClient, leagueId: string) {
  await client.query(
    `UPDATE league_groups
     SET is_locked = TRUE
     WHERE id = $1
       AND (SELECT COUNT(*) FROM league_members WHERE league_id = $1) >= $2;`,
    [leagueId, LEAGUE_CAPACITY]
  );
}

export const leagueService = {
  /**
   * Devuelve una liga abierta con capacidad en la división indicada.
   * Si no se especifica `rankTier`, se resuelve desde el pasaporte del jugador.
   */
  async getOrCreateOpenLeague(gameId: string, rankTier?: string, userId?: string) {
    return await withTransaction(async (client) => {
      let tier = rankTier;
      if (!tier && userId) {
        tier = await resolvePlayerTier(client, userId, gameId);
      }
      return await findOrCreateOpenLeague(client, gameId, tier || 'BRONZE');
    });
  },

  /**
   * Asigna al jugador a una liga abierta de SU división real.
   *
   * Idempotente: si el jugador ya está en una liga abierta de ese juego,
   * devuelve esa y no hace nada más (inmutabilidad de grupo).
   */
  async assignPlayerToLeague(userId: string, gameId: string, rankTier?: string) {
    return await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT m.league_id, m.season_points, m.position
         FROM league_members m
         JOIN league_groups g ON g.id = m.league_id
         WHERE m.user_id = $1 AND g.game_id = $2 AND g.is_locked = FALSE;`,
        [userId, gameId]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      // La división sale del pasaporte salvo que el llamador imponga una.
      const tier = rankTier || (await resolvePlayerTier(client, userId, gameId));
      const league = await findOrCreateOpenLeague(client, gameId, tier);

      const joinRes = await client.query(
        `INSERT INTO league_members (league_id, user_id, season_points, position)
         VALUES ($1, $2, 0, $3)
         ON CONFLICT (league_id, user_id) DO NOTHING
         RETURNING league_id, user_id, season_points, position;`,
        [league.id, userId, LEAGUE_CAPACITY]
      );

      await sealLeagueIfFull(client, league.id);

      return joinRes.rows[0] || { league_id: league.id, user_id: userId };
    });
  },

  async getLeagueStandings(leagueId: string) {
    const text = `
      SELECT 
        m.league_id, m.user_id, m.season_points,
        ROW_NUMBER() OVER (ORDER BY m.season_points DESC, u.created_at ASC) AS current_rank,
        u.username, u.avatar_url, u.has_premium
      FROM league_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.league_id = $1
      ORDER BY current_rank ASC;
    `;
    const res = await query(text, [leagueId]);
    return res.rows;
  },

  async getUserLeague(userId: string, gameId: string) {
    const leagueSql = `
      SELECT g.id, g.season_number, g.game_id, g.rank_tier, g.prize_pool, g.ends_at
      FROM league_members m
      JOIN league_groups g ON g.id = m.league_id
      WHERE m.user_id = $1 AND g.game_id = $2 AND g.is_locked = FALSE
      LIMIT 1;
    `;
    const res = await query(leagueSql, [userId, gameId]);
    if (res.rows.length === 0) return null;

    const league = res.rows[0];
    const standings = await this.getLeagueStandings(league.id);
    return {
      ...league,
      standings,
    };
  }
};
