/**
 * PLAY WIN — CONFIGURACIÓN DE ENTORNO CENTRALIZADA (config.ts)
 * ==============================================================================
 * Única fuente de verdad para las variables de entorno del servidor.
 *
 * REGLA INVIOLABLE: aquí NO existen valores por defecto para secretos.
 * Si falta una variable obligatoria, el proceso falla de forma ruidosa con un
 * mensaje accionable. Un fallback silencioso a un secreto quemado en el código
 * es exactamente lo que causó el BUG-002 / BUG-021 de la auditoría.
 *
 * ⚠️ SOLO SERVIDOR: este módulo lee secretos. Nunca lo importes desde un
 *    componente marcado con 'use client'.
 * ==============================================================================
 */

/** Error de configuración con instrucciones de arreglo. */
export class ConfigError extends Error {
  constructor(variable: string, dondeConfigurarla: string) {
    super(
      `[PlayWin Config] Falta la variable de entorno obligatoria "${variable}".\n` +
        `  → Configúrala en: ${dondeConfigurarla}\n` +
        `  → Plantilla de referencia: apps/hub/.env.example`
    );
    this.name = 'ConfigError';
  }
}

/**
 * Lee una variable obligatoria. Lanza ConfigError si no existe o está vacía.
 * Se evalúa en cada llamada (no en el import) para que el error aparezca
 * en la petición que realmente necesita el valor, con un mensaje claro.
 */
export function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new ConfigError(name, 'apps/hub/.env.local');
  }
  return value;
}

/**
 * Lee una variable opcional. Devuelve null si no está configurada.
 * Úsala cuando la ausencia de la variable deba desactivar una función,
 * nunca para sustituirla por un valor por defecto inseguro.
 */
export function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : null;
}

export const serverConfig = {
  /** Cadena de conexión a Neon PostgreSQL. */
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },

  /** Secreto de firma de sesiones y MatchTickets (HMAC SHA-256). */
  get jwtSecret(): string {
    return required('JWT_SECRET');
  },

  /** Secreto que protege /api/cron/settle-leagues. */
  get cronSecret(): string {
    return required('CRON_SECRET');
  },

  /** Secreto HMAC de los webhooks de Whop. Null si no está configurado. */
  get whopWebhookSecret(): string | null {
    return optional('WHOP_WEBHOOK_SECRET');
  },

  /** Modo de PayPal: 'live' para producción, cualquier otro valor usa sandbox. */
  get paypalMode(): string {
    return optional('PAYPAL_MODE') || 'sandbox';
  },

  /** Credenciales de la API de PayPal (OAuth client_credentials). */
  get paypalClientId(): string | null {
    return optional('PAYPAL_CLIENT_ID');
  },
  get paypalClientSecret(): string | null {
    return optional('PAYPAL_SECRET');
  },

  /** ID del webhook registrado en PayPal. Obligatorio para verificar firmas. */
  get paypalWebhookId(): string | null {
    return optional('PAYPAL_WEBHOOK_ID');
  },

  /** Credenciales SMTP de Google para correo transaccional. */
  get gmailUser(): string | null {
    return optional('GMAIL_USER');
  },
  get gmailAppPassword(): string | null {
    return optional('GMAIL_APP_PASSWORD');
  },

  /** Entorno de ejecución. */
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
};
