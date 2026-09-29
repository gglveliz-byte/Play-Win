import { NextResponse } from 'next/server';
import { userService } from '@/lib/db';
import { authLib } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { identifier, password } = body; // identifier puede ser username o email

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Usuario y contraseña requeridos.' },
        { status: 400 }
      );
    }

    const trimmed = identifier.trim();
    let user = await userService.getUserByUsername(trimmed);
    if (!user) {
      user = await userService.getUserByEmail(trimmed);
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciales inválidas. Revisa tu usuario y contraseña.' },
        { status: 401 }
      );
    }

    const isValid = await authLib.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Credenciales inválidas. Revisa tu usuario y contraseña.' },
        { status: 401 }
      );
    }

    // Generar Token JWT
    const token = authLib.signUserToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      global_level: user.global_level,
      has_premium: user.has_premium,
      wallet_balance: user.wallet_balance,
      created_at: user.created_at,
    };

    const response = NextResponse.json(
      { success: true, user: safeUser },
      { status: 200 }
    );

    response.cookies.set('playwin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[API Login Error]', err);
    return NextResponse.json(
      { error: 'Error del servidor al iniciar sesión.' },
      { status: 500 }
    );
  }
}
