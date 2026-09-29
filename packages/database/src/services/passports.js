import { query } from '../index.js';

/**
 * Servicio de producción para el Pasaporte Competitivo eSports
 */
export const passportService = {
  /**
   * Obtiene o inicializa el pasaporte de un jugador para un juego específico
   */
  async getOrCreatePassport(userId, gameId) {
    const findText = `
      SELECT id, user_id, game_id, rank_tier, skill_rating, season_points, total_matches, wins, losses, best_score, updated_at
      FROM game_passports
      WHERE user_id = $1 AND game_id = $2;
    `;
    const existing = await query(findText, [userId, gameId]);
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const insertText = `
      INSERT INTO game_passports (user_id, game_id, rank_tier, skill_rating, season_points, total_matches, wins, losses, best_score)
      VALUES ($1, $2, 'BRONZE', 1200, 0, 0, 0, 0, 0)
      ON CONFLICT (user_id, game_id) DO UPDATE
      SET updated_at = NOW()
      RETURNING id, user_id, game_id, rank_tier, skill_rating, season_points, total_matches, wins, losses, best_score;
    `;
    const inserted = await query(insertText, [userId, gameId]);
    return inserted.rows[0];
  },

  /**
   * Obtiene todos los pasaportes de un jugador (multijuego)
   */
  async getUserPassports(userId) {
    const text = `
      SELECT id, game_id, rank_tier, skill_rating, season_points, total_matches, wins, losses, best_score, updated_at
      FROM game_passports
      WHERE user_id = $1
      ORDER BY season_points DESC;
    `;
    const res = await query(text, [userId]);
    return res.rows;
  },

  /**
   * Obtiene el ranking global de un juego
   */
  async getGameLeaderboard(gameId, limit = 50) {
    const text = `
      SELECT p.id, p.user_id, u.username, u.avatar_url, p.rank_tier, p.skill_rating, p.season_points, p.wins, p.losses, p.best_score
      FROM game_passports p
      JOIN users u ON u.id = p.user_id
      WHERE p.game_id = $1
      ORDER BY p.season_points DESC, p.wins DESC
      LIMIT $2;
    `;
    const res = await query(text, [gameId, limit]);
    return res.rows;
  },

  /**
   * Actualiza estadísticas competitivas de un jugador (usado dentro de transacciones de partidas)
   */
  async updatePassportStats(client, userId, gameId, { isWin, pointsDelta, score = 0 }) {
    const winIncrement = isWin ? 1 : 0;
    const lossIncrement = isWin ? 0 : 1;
    const ratingDelta = isWin ? 25 : -15;

    const text = `
      INSERT INTO game_passports (user_id, game_id, rank_tier, skill_rating, season_points, total_matches, wins, losses, best_score)
      VALUES ($1, $2, 'BRONZE', GREATEST(800, 1200 + $3), GREATEST(0, $4), 1, $5, $6, $7)
      ON CONFLICT (user_id, game_id) DO UPDATE
      SET 
        skill_rating = GREATEST(800, game_passports.skill_rating + $3),
        season_points = GREATEST(0, game_passports.season_points + $4),
        total_matches = game_passports.total_matches + 1,
        wins = game_passports.wins + $5,
        losses = game_passports.losses + $6,
        best_score = GREATEST(game_passports.best_score, $7),
        updated_at = NOW()
      RETURNING id, user_id, game_id, rank_tier, skill_rating, season_points, total_matches, wins, losses, best_score;
    `;

    const res = await client.query(text, [
      userId,
      gameId,
      ratingDelta,
      pointsDelta,
      winIncrement,
      lossIncrement,
      score,
    ]);
    return res.rows[0];
  }
};
