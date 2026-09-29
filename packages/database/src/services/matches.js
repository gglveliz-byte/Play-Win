import { query, withTransaction } from '../index.js';
import { passportService } from './passports.js';

/**
 * Servicio de producción para el registro y auditoría de Partidas 1v1
 */
export const matchService = {
  /**
   * Registra una partida completada de forma atómica en el ledger competitivo
   */
  async recordMatch({
    roomId,
    gameId,
    player1Id,
    player2Id,
    winnerId,
    p1Score = 0,
    p2Score = 0,
    seed,
    finishReason = 'OPPONENT_CRASH',
    durationMs = 0,
    p1PointsDelta = 100,
    p2PointsDelta = 20,
  }) {
    return await withTransaction(async (client) => {
      // 1. Insertar el registro inmutable en match_records
      const insertMatchSql = `
        INSERT INTO match_records (
          room_id, game_id, player1_id, player2_id, winner_id,
          p1_score, p2_score, seed, finish_reason, duration_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, room_id, game_id, winner_id, created_at;
      `;
      const matchRes = await client.query(insertMatchSql, [
        roomId,
        gameId,
        player1Id,
        player2Id,
        winnerId,
        p1Score,
        p2Score,
        seed,
        finishReason,
        durationMs,
      ]);
      const matchRecord = matchRes.rows[0];

      // 2. Actualizar Pasaporte del Jugador 1
      const isP1Winner = winnerId === player1Id;
      await passportService.updatePassportStats(client, player1Id, gameId, {
        isWin: isP1Winner,
        pointsDelta: isP1Winner ? p1PointsDelta : p2PointsDelta,
        score: p1Score,
      });

      // 3. Actualizar Pasaporte del Jugador 2
      const isP2Winner = winnerId === player2Id;
      await passportService.updatePassportStats(client, player2Id, gameId, {
        isWin: isP2Winner,
        pointsDelta: isP2Winner ? p1PointsDelta : p2PointsDelta,
        score: p2Score,
      });

      // 4. Si los jugadores están en una micro-liga activa de 10, sumar sus Season Points en league_members
      const updateLeaguePointsSql = `
        UPDATE league_members
        SET season_points = season_points + $2
        WHERE user_id = $1 AND league_id IN (
          SELECT id FROM league_groups WHERE game_id = $3 AND is_locked = FALSE
        );
      `;
      await client.query(updateLeaguePointsSql, [player1Id, isP1Winner ? p1PointsDelta : p2PointsDelta, gameId]);
      await client.query(updateLeaguePointsSql, [player2Id, isP2Winner ? p1PointsDelta : p2PointsDelta, gameId]);

      return matchRecord;
    });
  },

  /**
   * Obtiene el historial de partidas de un usuario con los perfiles del oponente
   */
  async getMatchHistory(userId, limit = 20) {
    const text = `
      SELECT 
        m.id, m.room_id, m.game_id, m.player1_id, m.player2_id, m.winner_id,
        m.p1_score, m.p2_score, m.seed, m.finish_reason, m.duration_ms, m.created_at,
        u1.username AS player1_username, u1.avatar_url AS player1_avatar,
        u2.username AS player2_username, u2.avatar_url AS player2_avatar
      FROM match_records m
      JOIN users u1 ON u1.id = m.player1_id
      JOIN users u2 ON u2.id = m.player2_id
      WHERE m.player1_id = $1 OR m.player2_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2;
    `;
    const res = await query(text, [userId, limit]);
    return res.rows;
  },

  /**
   * Obtiene las partidas recientes de un juego en vivo
   */
  async getRecentMatchesByGame(gameId, limit = 15) {
    const text = `
      SELECT 
        m.id, m.room_id, m.game_id, m.winner_id, m.p1_score, m.p2_score,
        m.finish_reason, m.duration_ms, m.created_at,
        u1.username AS player1_username,
        u2.username AS player2_username,
        w.username AS winner_username
      FROM match_records m
      JOIN users u1 ON u1.id = m.player1_id
      JOIN users u2 ON u2.id = m.player2_id
      LEFT JOIN users w ON w.id = m.winner_id
      WHERE m.game_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2;
    `;
    const res = await query(text, [gameId, limit]);
    return res.rows;
  }
};
