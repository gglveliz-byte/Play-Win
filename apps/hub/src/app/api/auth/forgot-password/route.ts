import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { userService } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Ingresa un correo electrónico válido.' }, { status: 400 });
    }

    const user = await userService.getUserByEmail(email);

    // Por seguridad, si el correo no existe respondemos con éxito genérico para evitar enumeración de usuarios
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'Si el correo está registrado en Play Win, recibirás las instrucciones en breve.',
      });
    }

    // Generar token criptográfico único con expiración en 60 minutos
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await userService.setPasswordResetToken(email, resetToken, expiresAt);

    // Enviar correo de recuperación con Gmail SMTP
    await sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      token: resetToken,
    });

    return NextResponse.json({
      success: true,
      message: 'Se ha enviado un enlace de recuperación a tu correo electrónico.',
    });
  } catch (err: any) {
    console.error('[API Forgot Password Error]', err);
    return NextResponse.json({ error: 'Error del servidor al procesar la solicitud.' }, { status: 500 });
  }
}
