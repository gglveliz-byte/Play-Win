import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { userService } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';
import { badRequest, tooManyRequests, serverError } from '@/lib/api-response';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

/**
 * Recuperación de contraseña.
 * Límite estricto porque cada solicitud ENVÍA UN CORREO REAL (coste económico)
 * y podría usarse para inundar el buzón de una víctima.
 */
const FORGOT_LIMIT = 10;
const FORGOT_WINDOW_MS = 15 * 60_000;

export async function POST(req: Request) {
  try {
    const ip = clientIpFrom(req);
    const limit = checkRateLimit({
      name: 'auth:forgot-password',
      key: ip,
      limit: FORGOT_LIMIT,
      windowMs: FORGOT_WINDOW_MS,
    });
    if (!limit.allowed) {
      return tooManyRequests(
        `Demasiadas solicitudes de recuperación. Espera ${limit.retryAfterSeconds} segundos.`,
        limit.retryAfterSeconds
      );
    }

    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return badRequest('Ingresa un correo electrónico válido.');
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
  } catch (err) {
    return serverError(err, 'POST /api/auth/forgot-password');
  }
}
