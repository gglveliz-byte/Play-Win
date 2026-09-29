import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { userService, passportService, leagueService } from '@/lib/db';
import { authLib } from '@/lib/auth';
import { sendWelcomeEmail, sendVerificationEmail } from '@/lib/email';

const GAMES = ['flapy-flapy', 'carreras', 'space', 'sky'];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, email, password, avatarUrl } = body;

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'Todos los campos son obligatorios.' },
        { status: 400 }
      );
    }

    if (username.length < 3 || username.length > 20) {
      return NextResponse.json(
        { error: 'El nombre de usuario debe tener entre 3 y 20 caracteres.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe contener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    // Comprobar si ya existe
    const existingUser = await userService.getUserByUsername(username);
    if (existingUser) {
      return NextResponse.json(
        { error: 'El nombre de usuario ya está registrado.' },
        { status: 409 }
      );
    }

    const existingEmail = await userService.getUserByEmail(email);
    if (existingEmail) {
      return NextResponse.json(
        { error: 'El correo electrónico ya está en uso.' },
        { status: 409 }
      );
    }

    // Hash seguro de contraseña
    const passwordHash = await authLib.hashPassword(password);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Crear usuario en Neon PostgreSQL
    const user = await userService.createUser({
      username,
      email,
      passwordHash,
      avatarUrl: avatarUrl || '🎮',
      verificationToken,
    });

    // Enviar Correos Transaccionales (Bienvenida y Verificación)
    try {
      await sendWelcomeEmail({ to: user.email, username: user.username });
      await sendVerificationEmail({ to: user.email, username: user.username, token: verificationToken });
    } catch (emailErr) {
      console.error('[Register Email Notification Error]', emailErr);
    }

    // Inicializar pasaportes competitivos y ligas en los 4 juegos
    for (const gameId of GAMES) {
      await passportService.getOrCreatePassport(user.id, gameId);
      await leagueService.assignPlayerToLeague(user.id, gameId, 'BRONZE');
    }

    // Generar Token JWT
    const token = authLib.signUserToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const response = NextResponse.json(
      { success: true, user },
      { status: 201 }
    );

    // Inyectar Cookie segura de sesión
    response.cookies.set('playwin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[API Register Error]', err);
    return NextResponse.json(
      { error: 'Error del servidor al registrar usuario.' },
      { status: 500 }
    );
  }
}
