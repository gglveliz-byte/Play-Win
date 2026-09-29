import { NextResponse } from 'next/server';
import { userService } from '@/lib/db';
import { authLib } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token de recuperación no válido o ausente.' }, { status: 400 });
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    // Hashear la nueva contraseña
    const newPasswordHash = await authLib.hashPassword(newPassword);

    // Actualizar en Neon PostgreSQL invalidando el token utilizado
    const updatedUser = await userService.resetPasswordWithToken(token, newPasswordHash);

    if (!updatedUser) {
      return NextResponse.json(
        { error: 'El enlace de recuperación es inválido o ha expirado (límite de 60 min).' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '¡Tu contraseña ha sido actualizada con éxito! Ya puedes iniciar sesión.',
    });
  } catch (err: any) {
    console.error('[API Reset Password Error]', err);
    return NextResponse.json({ error: 'Error del servidor al restablecer contraseña.' }, { status: 500 });
  }
}
