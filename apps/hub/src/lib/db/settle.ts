import { query, withTransaction } from './index';
import { ledgerService } from './ledger';

export interface SettleResult {
  settledLeaguesCount: number;
  totalPrizesDisbursed: number;
  details: Array<{
    leagueId: string;
    gameId: string;
    seasonNumber: number;
    winners: Array<{ userId: string; rank: number; prize: number; mmrDelta: number }>;
  }>;
}

export const settleEngine = {
  /**
   * Ejecuta el cierre semanal atómico de todas las micro-ligas de 10 expiradas
   */
  async settleExpiredLeagues(): Promise<SettleResult> {
    const expiredSql = `
      SELECT id, season_number, game_id, rank_tier, prize_pool, ends_at
      FROM league_groups
      WHERE ends_at <= NOW() AND is_locked = FALSE
      ORDER BY ends_at ASC;
    `;
    const expiredRes = await query(expiredSql);
    const expiredLeagues = expiredRes.rows;

    let totalPrizes = 0;
    const details = [];

    for (const league of expiredLeagues) {
      const leagueResult = await withTransaction(async (client) => {
        // 1. Obtener miembros clasificados por Season Points
        const membersSql = `
          SELECT m.user_id, m.season_points, u.username, u.email
          FROM league_members m
          JOIN users u ON u.id = m.user_id
          WHERE m.league_id = $1
          ORDER BY m.season_points DESC, m.joined_at ASC;
        `;
        const membersRes = await client.query(membersSql, [league.id]);
        const members = membersRes.rows;

        const winners = [];

        // 2. Distribuir Premios y recalcular MMR
        for (let idx = 0; idx < members.length; idx++) {
          const member = members[idx];
          const rank = idx + 1;
          let prizeAmount = 0;
          let mmrDelta = 0;

          if (rank === 1) {
            prizeAmount = 15.00;
            mmrDelta = 60;
          } else if (rank === 2) {
            prizeAmount = 7.00;
            mmrDelta = 35;
          } else if (rank === 3) {
            prizeAmount = 3.00;
            mmrDelta = 20;
          } else if (rank <= 7) {
            mmrDelta = 0;
          } else if (rank <= 9) {
            mmrDelta = -25;
          } else {
            mmrDelta = -50;
          }

          // Si ganó premio, registrar en doble libro contable (Ledger)
          if (prizeAmount > 0) {
            const txId = `prize_${league.id}_${member.user_id}`;
            const insertLedgerSql = `
              INSERT INTO wallet_ledger (
                user_id, amount, currency, type, status, provider, provider_tx_id, metadata
              )
              VALUES ($1, $2, 'USD', 'PRIZE_WIN', 'COMPLETED', 'SYSTEM', $3, $4)
              ON CONFLICT (provider_tx_id) DO NOTHING;
            `;
            await client.query(insertLedgerSql, [
              member.user_id,
              prizeAmount,
              txId,
              JSON.stringify({ leagueId: league.id, rank, season: league.season_number }),
            ]);

            // Actualizar balance de billetera del usuario
            const updateBalSql = `
              UPDATE users
              SET wallet_balance = wallet_balance + $2, updated_at = NOW()
              WHERE id = $1;
            `;
            await client.query(updateBalSql, [member.user_id, prizeAmount]);
            totalPrizes += prizeAmount;
          }

          // Actualizar MMR persistente en game_passports
          const updateMmrSql = `
            UPDATE game_passports
            SET 
              skill_rating = GREATEST(800, skill_rating + $2),
              season_points = 0, -- Reinicio semanal para nueva temporada
              updated_at = NOW()
            WHERE user_id = $1 AND game_id = $3;
          `;
          await client.query(updateMmrSql, [member.user_id, mmrDelta, league.game_id]);

          // Guardar posición final en league_members
          await client.query(
            `UPDATE league_members SET position = $2 WHERE league_id = $1 AND user_id = $3;`,
            [league.id, rank, member.user_id]
          );

          winners.push({
            userId: member.user_id,
            rank,
            prize: prizeAmount,
            mmrDelta,
          });
        }

        // 3. Sellar liga finalizada
        await client.query(`UPDATE league_groups SET is_locked = TRUE WHERE id = $1;`, [league.id]);

        // 4. Crear grupo para la siguiente temporada
        const nextSeason = league.season_number + 1;
        const now = new Date();
        const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO league_groups (season_number, game_id, rank_tier, prize_pool, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [nextSeason, league.game_id, league.rank_tier, league.prize_pool, now, endsAt]
        );

        return {
          leagueId: league.id,
          gameId: league.game_id,
          seasonNumber: league.season_number,
          winners,
        };
      });

      details.push(leagueResult);
    }

    return {
      settledLeaguesCount: expiredLeagues.length,
      totalPrizesDisbursed: totalPrizes,
      details,
    };
  },
};
