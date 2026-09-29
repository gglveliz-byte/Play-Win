import { query, withTransaction } from '../index.js';

/**
 * Servicio de producción para el motor de Micro-Ligas de 10 Jugadores
 */
export const leagueService = {
  /**
   * Obtiene la liga activa actual o crea un nuevo grupo cerrado de 10
   */
  async getOrCreateOpenLeague(gameId, rankTier = 'BRONZE') {
    // 1. Buscar grupo con menos de 10 jugadores
    const findSql = `
      SELECT g.id, g.season_number, g.game_id, g.rank_tier, g.prize_pool, g.starts_at, g.ends_at,
             COUNT(m.user_id) AS current_members
      FROM league_groups g
      LEFT JOIN league_members m ON m.league_id = g.id
      WHERE g.game_id = $1 AND g.rank_tier = $2 AND g.is_locked = FALSE
      GROUP BY g.id
      HAVING COUNT(m.user_id) < 10
      ORDER BY g.created_at ASC
      LIMIT 1;
    `;
    const res = await query(findSql, [gameId, rankTier]);
    if (res.rows.length > 0) {
      return res.rows[0];
    }

    // 2. Si no hay grupo con cupo, crear nuevo grupo de 10
    const now = new Date();
    const startsAt = now;
    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 días de duración

    const createSql = `
      INSERT INTO league_groups (season_number, game_id, rank_tier, prize_pool, starts_at, ends_at)
      VALUES (1, $1, $2, 25.00, $3, $4)
      RETURNING id, season_number, game_id, rank_tier, prize_pool, starts_at, ends_at, 0 AS current_members;
    `;
    const createRes = await query(createSql, [gameId, rankTier, startsAt, endsAt]);
    return createRes.rows[0];
  },

  /**
   * Asigna un jugador a una micro-liga de 10
   */
  async assignPlayerToLeague(userId, gameId, rankTier = 'BRONZE') {
    return await withTransaction(async (client) => {
      // Verificar si ya pertenece a una liga abierta de este juego
      const checkSql = `
        SELECT m.league_id, m.season_points, m.position
        FROM league_members m
        JOIN league_groups g ON g.id = m.league_id
        WHERE m.user_id = $1 AND g.game_id = $2 AND g.is_locked = FALSE;
      `;
      const checkRes = await client.query(checkSql, [userId, gameId]);
      if (checkRes.rows.length > 0) {
        return checkRes.rows[0];
      }

      // Obtener o crear grupo disponible
      const league = await this.getOrCreateOpenLeague(gameId, rankTier);

      // Insertar en la liga
      const joinSql = `
        INSERT INTO league_members (league_id, user_id, season_points, position)
        VALUES ($1, $2, 0, 10)
        ON CONFLICT (league_id, user_id) DO NOTHING
        RETURNING league_id, user_id, season_points, position;
      `;
      const joinRes = await client.query(joinSql, [league.id, userId]);
      return joinRes.rows[0] || { league_id: league.id, user_id: userId };
    });
  },

  /**
   * Obtiene la tabla de posiciones de una micro-liga de 10
   */
  async getLeagueStandings(leagueId) {
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

  /**
   * Obtiene la liga activa de un usuario con los 10 competidores
   */
  async getUserLeague(userId, gameId) {
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
