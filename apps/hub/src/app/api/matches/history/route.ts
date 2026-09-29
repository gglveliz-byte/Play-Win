import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { matchService, userService } from '@/lib/db';
import { authLib } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    let token = cookieStore.get('playwin_session')?.value;

    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Inicia sesión para consultar tu historial.' },
        { status: 401 }
      );
    }

    const payload = authLib.verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Sesión expirada o inválida.' },
        { status: 401 }
      );
    }

    const user = await userService.getUserById(payload.userId);
    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado.' },
        { status: 404 }
      );
    }

    const rawMatches = await matchService.getMatchHistory(user.id, 30);

    const formattedMatches = rawMatches.map((m: any) => {
      const isP1 = m.player1_id === user.id;
      const isWinner = m.winner_id === user.id;
      const opponentUsername = isP1 ? m.player2_username : m.player1_username;
      const opponentAvatar = isP1 ? m.player2_avatar : m.player1_avatar;
      const myScore = isP1 ? (m.p1_score || 0) : (m.p2_score || 0);
      const opponentScore = isP1 ? (m.p2_score || 0) : (m.p1_score || 0);

      return {
        id: m.id,
        roomId: m.room_id,
        gameId: m.game_id,
        isWinner,
        myScore,
        opponentScore,
        opponent: {
          username: opponentUsername || 'Piloto Rival',
          avatar: opponentAvatar || '👤',
        },
        pointsDelta: isWinner ? 100 : 20,
        finishReason: m.finish_reason || 'OPPONENT_CRASH',
        durationSeconds: Math.max(1, Math.round((m.duration_ms || 0) / 1000)),
        seed: m.seed,
        createdAt: m.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      matches: formattedMatches,
    });
  } catch (err: any) {
    console.error('[API /api/matches/history Error]', err);
    return NextResponse.json(
      { error: 'Error al consultar historial de partidas.' },
      { status: 500 }
    );
  }
}
