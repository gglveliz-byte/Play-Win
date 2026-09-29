import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { userService } from '@/lib/db';
import { authLib } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { gameId } = body;

    const cookieStore = await cookies();
    const token = cookieStore.get('playwin_session')?.value;
    const payload = token ? authLib.verifyToken(token) : null;

    let user = null;
    if (payload?.userId) {
      user = await userService.getUserById(payload.userId);
    }

    // SIN INICIAR SESIÓN NO SE PUEDE JUGAR
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Debes iniciar sesión en Play Win para competir en duelos 1v1 oficiales.',
          requireLogin: true,
        },
        { status: 401 }
      );
    }

    const ticket = authLib.signMatchTicket({
      id: user.id,
      username: user.username,
      avatar: user.avatar_url || '🎮',
      gameId: gameId || 'carreras',
    });

    return NextResponse.json({
      success: true,
      ticket,
      token: ticket,
      playerId: user.id,
      username: user.username,
      avatar: user.avatar_url || '🎮',
      player: {
        id: user.id,
        username: user.username,
        avatar: user.avatar_url || '🎮',
      },
    });
  } catch (err: any) {
    console.error('[API /games/ticket Error]', err);
    return NextResponse.json(
      { error: 'Error al emitir ticket de juego.' },
      { status: 500 }
    );
  }
}
