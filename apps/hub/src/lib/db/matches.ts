/**
 * RE-EXPORTACIÓN: el historial de partidas vive en `@playwin/database`.
 *
 * Era una copia de `packages/database/src/services/matches.js` (BUG-003).
 * Aquí solo se re-exporta lo que consume el Hub.
 *
 * NOTA: `recordMatch` NO se usa en el Hub. Quien persiste las partidas es el
 * servidor de duelos, que ya consume el paquete directamente.
 */
import { matchService as sharedMatchService } from '@playwin/database';

/** Registro de partida tal como lo devuelve el historial. */
export interface MatchRecord {
  id: string;
  room_id: string;
  game_id: string;
  winner_id: string | null;
  p1_score: number;
  p2_score: number;
  seed: string | number;
  finish_reason: string;
  duration_ms: number;
  created_at: string;
  player1_id?: string;
  player2_id?: string;
  opponent_username?: string;
  opponent_avatar?: string;
  is_win?: boolean;
}

export const matchService = sharedMatchService as unknown as {
  getMatchHistory(userId: string, limit?: number): Promise<MatchRecord[]>;
  getRecentMatchesByGame(gameId: string, limit?: number): Promise<MatchRecord[]>;
  recordMatch(args: Record<string, unknown>): Promise<unknown>;
};
