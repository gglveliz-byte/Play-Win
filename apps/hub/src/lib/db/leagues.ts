import { query, withTransaction } from './index';

export const leagueService = {
  async getOrCreateOpenLeague(gameId: string, rankTier = 'BRONZE') {
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

    const now = new Date();
    const startsAt = now;
    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const createSql = `
      INSERT INTO league_groups (season_number, game_id, rank_tier, prize_pool, starts_at, ends_at)
      VALUES (1, $1, $2, 25.00, $3, $4)
      RETURNING id, season_number, game_id, rank_tier, prize_pool, starts_at, ends_at, 0 AS current_members;
    `;
    const createRes = await query(createSql, [gameId, rankTier, startsAt, endsAt]);
    return createRes.rows[0];
  },

  async assignPlayerToLeague(userId: string, gameId: string, rankTier = 'BRONZE') {
    return await withTransaction(async (client) => {
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

      const league = await this.getOrCreateOpenLeague(gameId, rankTier);

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
