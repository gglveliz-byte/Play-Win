/**
 * RE-EXPORTACIÓN: los pasaportes competitivos viven en `@playwin/database`.
 *
 * Antes era una copia de `packages/database/src/services/passports.js` (BUG-003).
 * Aquí solo se re-exporta y se tipan las firmas que consume el Hub.
 */
import { passportService as sharedPassportService } from '@playwin/database';

export interface Passport {
  id: string;
  user_id: string;
  game_id: string;
  rank_tier: string;
  skill_rating: number;
  season_points: number;
  total_matches: number;
  wins: number;
  losses: number;
  best_score: number;
}

/** Jugador del ranking de un juego (vista pública). */
export interface LeaderboardRow {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  rank_tier: string;
  skill_rating: number;
  season_points: number;
  wins: number;
  losses: number;
  best_score: number;
}

export const passportService = sharedPassportService as unknown as {
  getOrCreatePassport(userId: string, gameId: string): Promise<Passport>;
  getUserPassports(userId: string): Promise<Passport[]>;
  getGameLeaderboard(gameId: string, limit?: number): Promise<LeaderboardRow[]>;
  updatePassportStats(
    client: unknown,
    userId: string,
    gameId: string,
    args: { isWin: boolean; pointsDelta: number; score?: number }
  ): Promise<Passport>;
};
