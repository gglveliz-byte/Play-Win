import { NextResponse } from 'next/server';
import { userService } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token de verificación no proporcionado.' }, { status: 400 });
    }

    const verifiedUser = await userService.verifyUserEmail(token);
    if (!verifiedUser) {
      return NextResponse.json(
        { error: 'El token de verificación es inválido o la cuenta ya ha sido verificada.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '¡Tu cuenta y correo han sido verificados exitosamente!',
      user: verifiedUser,
    });
  } catch (err: any) {
    console.error('[API Verify Email Error]', err);
    return NextResponse.json({ error: 'Error del servidor al verificar correo.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token requerido.' }, { status: 400 });
    }

    const verifiedUser = await userService.verifyUserEmail(token);
    if (!verifiedUser) {
      return NextResponse.json(
        { error: 'Token inválido o expirado.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cuenta verificada correctamente.',
      user: verifiedUser,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
