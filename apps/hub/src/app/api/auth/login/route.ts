import { NextResponse } from 'next/server';
import { userService } from '@/lib/db';
import { authLib } from '@/lib/auth';
import { badRequest, unauthorized as unauthorizedResponse, tooManyRequests, serverError } from '@/lib/api-response';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

/** Máximo de intentos de login por IP dentro de la ventana. */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

export async function POST(req: Request) {
  try {
    // Rate limit ANTES de tocar la base de datos: así un atacante no puede
    // provocar trabajo de bcrypt (que es deliberadamente costoso) ni consultas.
    const ip = clientIpFrom(req);
    const limit = checkRateLimit({
      name: 'auth:login',
      key: ip,
      limit: LOGIN_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!limit.allowed) {
      return tooManyRequests(
        `Demasiados intentos de inicio de sesión. Espera ${limit.retryAfterSeconds} segundos.`,
        limit.retryAfterSeconds
      );
    }

    const body = await req.json();
    const { identifier, password } = body; // identifier puede ser username o email

    if (!identifier || !password) {
      return badRequest('Usuario y contraseña requeridos.');
    }

    const trimmed = identifier.trim();
    let user = await userService.getUserByUsername(trimmed);
    if (!user) {
      user = await userService.getUserByEmail(trimmed);
    }

    if (!user) {
      return unauthorizedResponse('Credenciales inválidas. Revisa tu usuario y contraseña.');
    }

    const isValid = await authLib.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return unauthorizedResponse('Credenciales inválidas. Revisa tu usuario y contraseña.');
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
  } catch (err) {
    return serverError(err, 'POST /api/auth/login');
  }
}
