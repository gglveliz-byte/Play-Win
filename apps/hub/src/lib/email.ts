import nodemailer from 'nodemailer';

/**
 * ==============================================================================
 * PLAY WIN TRANSACTIONAL EMAIL SERVICE (email.ts)
 * Integración con Google Gmail SMTP (App Passwords)
 * Gobernado por AGENTS.md y playwin-code-governance (< 350 líneas)
 * ==============================================================================
 */

const GMAIL_USER = process.env.GMAIL_USER || process.env.SMTP_USER || '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
const FROM_EMAIL = process.env.SMTP_FROM || `"Play Win eSports" <${GMAIL_USER || 'soporte@playwin.gg'}>`;

// Configurar transporte de nodemailer para Gmail
function getTransporter() {
  if (!GMAIL_USER || !GMAIL_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS,
    },
  });
}

// Estructura base de plantilla HTML Warm Editorial Tangerine
function wrapEmailTemplate(title: string, badge: string, contentHtml: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 30px 10px; background-color: #dcdcdb; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #0c0c0e;">
      <div style="max-width: 580px; margin: 0 auto; background-color: #f2f1ee; border-radius: 24px; border: 1px solid #dad6ce; overflow: hidden; box-shadow: 0 16px 40px rgba(12,12,14,0.08);">
        
        <!-- Header -->
        <div style="background-color: #0c0c0e; padding: 24px 32px; text-align: left;">
          <div style="display: inline-block; background-color: rgba(210,105,26,0.2); color: #d2691a; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">
            ${badge}
          </div>
          <h1 style="color: #ffffff; font-size: 22px; font-weight: 900; margin: 12px 0 0 0; letter-spacing: -0.5px;">
            PLAY WIN eSPORTS
          </h1>
        </div>

        <!-- Contenido -->
        <div style="padding: 32px;">
          ${contentHtml}
        </div>

        <!-- Footer -->
        <div style="background-color: #edecea; padding: 20px 32px; text-align: center; border-top: 1px solid #dad6ce; font-size: 12px; color: #8a8780;">
          <p style="margin: 0 0 6px 0;">Play Win eSports Platform • Micro-Ligas Semanales 1v1</p>
          <p style="margin: 0;">Este es un mensaje seguro generado automáticamente por el sistema.</p>
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * 1. Correo de Bienvenida a Play Win
 */
export async function sendWelcomeEmail({ to, username }: { to: string; username: string }) {
  const title = `¡Bienvenido a Play Win eSports, ${username}!`;
  const html = wrapEmailTemplate(
    title,
    'PASAPORTE eSPORTS ACTIVADO',
    `
      <h2 style="font-size: 20px; font-weight: 800; color: #0c0c0e; margin: 0 0 14px 0;">
        ¡Hola, ${username}! 🎮
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #2a2a2d; margin-bottom: 20px;">
        Tu registro en la plataforma oficial de eSports <strong>Play Win</strong> ha sido completado con éxito. Ahora tienes acceso a:
      </p>

      <div style="background-color: #edecea; border-radius: 16px; padding: 16px 20px; margin-bottom: 24px; border: 1px solid #dad6ce;">
        <div style="font-size: 13px; font-weight: 700; color: #0c0c0e; margin-bottom: 8px;">⚡ Lo que puedes hacer ahora:</div>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #2a2a2d; line-height: 1.6;">
          <li>Competir en duelos 1v1 en tiempo real en los 4 videojuegos oficiales.</li>
          <li>Sumar Season Points en tu <strong>Micro-Liga de 10 jugadores</strong>.</li>
          <li>Disputar la bolsa semanal de <strong>$25 USD en efectivo</strong> ($15 al 1º, $7 al 2º, $3 al 3º).</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${APP_URL}" style="display: inline-block; background: linear-gradient(135deg, #d2691a 0%, #bb570f 100%); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 14px 32px; border-radius: 999px; box-shadow: 0 6px 18px rgba(210,105,26,0.35);">
          ENTRAR A LA ARENA Y JUGAR ➔
        </a>
      </div>
    `
  );

  return sendEmailInternal({ to, subject: title, html, logType: 'BIENVENIDA' });
}

/**
 * 2. Correo de Verificación de Cuenta
 */
export async function sendVerificationEmail({ to, username, token }: { to: string; username: string; token: string }) {
  const title = 'Verifica tu cuenta en Play Win eSports';
  const verifyUrl = `${APP_URL}/verificar-cuenta?token=${encodeURIComponent(token)}`;

  const html = wrapEmailTemplate(
    title,
    'VERIFICACIÓN DE SEGURIDAD',
    `
      <h2 style="font-size: 20px; font-weight: 800; color: #0c0c0e; margin: 0 0 14px 0;">
        Confirma tu correo electrónico 🛡️
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #2a2a2d; margin-bottom: 20px;">
        Hola <strong>${username}</strong>, para verificar tu cuenta y garantizar la seguridad de tus premios semanales y retiros por PayPal, por favor confirma tu dirección de correo:
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #d2691a 0%, #bb570f 100%); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 14px 32px; border-radius: 999px; box-shadow: 0 6px 18px rgba(210,105,26,0.35);">
          VERIFICAR MI CUENTA AHORA ➔
        </a>
      </div>

      <div style="background-color: #edecea; border-radius: 12px; padding: 12px; text-align: center; font-size: 12px; color: #8a8780;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
        <a href="${verifyUrl}" style="color: #d2691a; word-break: break-all;">${verifyUrl}</a>
      </div>
    `
  );

  return sendEmailInternal({ to, subject: title, html, logType: 'VERIFICACIÓN', actionUrl: verifyUrl });
}

/**
 * 3. Correo de Recuperación de Cuenta / Contraseña
 */
export async function sendPasswordResetEmail({ to, username, token }: { to: string; username: string; token: string }) {
  const title = 'Recuperación de Contraseña — Play Win eSports';
  const resetUrl = `${APP_URL}/restablecer-password?token=${encodeURIComponent(token)}`;

  const html = wrapEmailTemplate(
    title,
    'RECUPERACIÓN DE CONTRASEÑA',
    `
      <h2 style="font-size: 20px; font-weight: 800; color: #0c0c0e; margin: 0 0 14px 0;">
        Restablece tu contraseña 🔐
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #2a2a2d; margin-bottom: 16px;">
        Hola <strong>${username}</strong>, hemos recibido una solicitud para cambiar la contraseña de tu cuenta de jugador en <strong>Play Win</strong>.
      </p>
      <p style="font-size: 13px; color: #8a8780; margin-bottom: 24px;">
        Este enlace es válido durante los próximos <strong>60 minutos</strong> por protección de seguridad.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #0c0c0e; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 14px 32px; border-radius: 999px; box-shadow: 0 4px 14px rgba(12,12,14,0.3);">
          CAMBIAR MI CONTRASEÑA ➔
        </a>
      </div>

      <p style="font-size: 12px; color: #8a8780; line-height: 1.5;">
        Si no realizaste esta solicitud, puedes ignorar este correo. Tu contraseña actual permanecerá intacta y nadie podrá acceder a tu cuenta sin tu confirmación.
      </p>
    `
  );

  return sendEmailInternal({ to, subject: title, html, logType: 'RECUPERACIÓN', actionUrl: resetUrl });
}

// Emisor unificado con soporte para Gmail real y fallback simulado para desarrollo
async function sendEmailInternal({
  to,
  subject,
  html,
  logType,
  actionUrl,
}: {
  to: string;
  subject: string;
  html: string;
  logType: string;
  actionUrl?: string;
}) {
  const transporter = getTransporter();

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      });
      console.log(`📧 [Gmail SMTP] Correo (${logType}) enviado exitosamente a ${to}. MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId, mode: 'GMAIL_SMTP' };
    } catch (err: any) {
      console.error(`❌ [Gmail SMTP Error] No se pudo enviar correo (${logType}) a ${to}:`, err.message);
      // Fallback para no bloquear la aplicación si la cuota de Gmail falla
      return { success: false, error: err.message, actionUrl };
    }
  } else {
    console.log(`📧 [PlayWin Email Simulation - ${logType}]`);
    console.log(`   ➔ Para: ${to}`);
    console.log(`   ➔ Asunto: ${subject}`);
    if (actionUrl) console.log(`   ➔ Enlace de Acción: ${actionUrl}`);
    console.log(`   💡 Tip: Configura GMAIL_USER y GMAIL_APP_PASSWORD en tu .env para envíos reales por Google SMTP.`);
    return { success: true, simulated: true, actionUrl };
  }
}
