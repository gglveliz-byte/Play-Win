import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { leagueService } from '@/lib/db';
import { authLib } from '@/lib/auth';
import { serverError } from '@/lib/api-response';

/**
 * Consulta la micro-liga del jugador (o una liga abierta si es invitado).
 *
 * La división se resuelve desde el pasaporte del jugador con
 * `leagueService.assignPlayerToLeague`, que usa `resolveRankTier()`.
 * Antes esta ruta forzaba 'BRONZE' en ambas llamadas, así que TODO jugador
 * acababa en la división más baja sin importar su Skill Rating (BUG-019).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId') || 'flapy-flapy';

    const cookieStore = await cookies();
    const token = cookieStore.get('playwin_session')?.value;
    const payload = token ? authLib.verifyToken(token) : null;

    if (payload?.userId) {
      let userLeague = await leagueService.getUserLeague(payload.userId, gameId);
      if (!userLeague) {
        // Sin tercer argumento: la división se deriva del skill_rating real.
        await leagueService.assignPlayerToLeague(payload.userId, gameId);
        userLeague = await leagueService.getUserLeague(payload.userId, gameId);
      }
      return NextResponse.json({ success: true, league: userLeague });
    }

    // Invitado: se le muestra la tabla de una liga abierta del juego.
    const openLeague = await leagueService.getOrCreateOpenLeague(gameId);
    const standings = await leagueService.getLeagueStandings(openLeague.id);

    return NextResponse.json({
      success: true,
      league: {
        ...openLeague,
        standings,
      },
    });
  } catch (err) {
    return serverError(err, 'GET /api/leagues');
  }
}
