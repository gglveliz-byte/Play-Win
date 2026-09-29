import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { userService, passportService } from '@/lib/db';
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
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    const payload = authLib.verifyToken(token);
    if (!payload) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    const user = await userService.getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    // Obtener todos los pasaportes de juegos del jugador
    const passports = await passportService.getUserPassports(user.id);

    return NextResponse.json({
      authenticated: true,
      user,
      passports,
    });
  } catch (err: any) {
    console.error('[API /auth/me Error]', err);
    return NextResponse.json(
      { error: 'Error al verificar sesión.' },
      { status: 500 }
    );
  }
}

export async function POST() {
  // Logout
  const response = NextResponse.json({ success: true, message: 'Sesión cerrada.' });
  response.cookies.delete('playwin_session');
  return response;
}
