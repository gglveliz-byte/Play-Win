import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { leagueService } from '@/lib/db';
import { authLib } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId') || 'flapy-flapy';

    const cookieStore = await cookies();
    const token = cookieStore.get('playwin_session')?.value;
    const payload = token ? authLib.verifyToken(token) : null;

    if (payload?.userId) {
      // Obtener o asegurar asignación a la liga de este juego
      let userLeague = await leagueService.getUserLeague(payload.userId, gameId);
      if (!userLeague) {
        await leagueService.assignPlayerToLeague(payload.userId, gameId, 'BRONZE');
        userLeague = await leagueService.getUserLeague(payload.userId, gameId);
      }
      return NextResponse.json({ success: true, league: userLeague });
    }

    // Si es invitado, mostrar tabla del grupo abierto actual
    const openLeague = await leagueService.getOrCreateOpenLeague(gameId, 'BRONZE');
    const standings = await leagueService.getLeagueStandings(openLeague.id);

    return NextResponse.json({
      success: true,
      league: {
        ...openLeague,
        standings,
      },
    });
  } catch (err: any) {
    console.error('[API /leagues Error]', err);
    return NextResponse.json(
      { error: 'Error al consultar ligas.' },
      { status: 500 }
    );
  }
}
