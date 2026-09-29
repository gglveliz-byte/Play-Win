/**
 * PLAY WIN — CLIENTE DE PAYPAL (paypal.ts)
 * ==============================================================================
 * Verificación de autenticidad de webhooks y obtención de tokens OAuth.
 *
 * Usa el MÉTODO POSTBACK documentado por PayPal: se reenvía el evento tal cual
 * se recibió a /v1/notifications/verify-webhook-signature y PayPal responde si
 * la firma es válida. Se eligió este método porque no requiere dependencias
 * externas (funciona con fetch nativo) a diferencia de la verificación propia,
 * que necesita buffer-crc32 y descarga de certificados.
 *
 * ⚠️ SOLO SERVIDOR: maneja credenciales. Nunca lo importes desde 'use client'.
 * ==============================================================================
 */

import { serverConfig } from './config';

export interface PayPalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

export interface PayPalVerificationResult {
  /** true solo si PayPal confirmó criptográficamente la firma. */
  verified: boolean;
  /** Motivo legible cuando no se pudo verificar. */
  reason?: string;
  /** Indica si faltan credenciales (para responder 503 en lugar de 401). */
  notConfigured?: boolean;
}

/** Base de la API según el modo configurado. */
function apiBase(): string {
  return serverConfig.paypalMode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

/** Extrae las cabeceras de verificación de una petición entrante. */
export function extractWebhookHeaders(headers: Headers): PayPalWebhookHeaders | null {
  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionTime = headers.get('paypal-transmission-time');
  const transmissionSig = headers.get('paypal-transmission-sig');
  const certUrl = headers.get('paypal-cert-url');
  const authAlgo = headers.get('paypal-auth-algo');

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return null;
  }
  return { transmissionId, transmissionTime, transmissionSig, certUrl, authAlgo };
}

/** Obtiene un token OAuth de PayPal (client_credentials). */
async function getAccessToken(): Promise<string> {
  const clientId = serverConfig.paypalClientId;
  const clientSecret = serverConfig.paypalClientSecret;
  if (!clientId || !clientSecret) {
    throw new Error('Credenciales de PayPal no configuradas.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`PayPal OAuth falló con HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('PayPal OAuth no devolvió access_token.');
  }
  return data.access_token;
}

/**
 * Verifica la firma de un webhook contra la API de PayPal.
 *
 * @param rawBody CUERPO CRUDO tal cual se recibió. Nunca re-serialices el JSON:
 *                PayPal exige que el evento se reenvíe sin ninguna alteración
 *                de formato.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  headers: PayPalWebhookHeaders
): Promise<PayPalVerificationResult> {
  const webhookId = serverConfig.paypalWebhookId;
  if (!webhookId) {
    return {
      verified: false,
      notConfigured: true,
      reason: 'Falta PAYPAL_WEBHOOK_ID: no es posible validar la autenticidad.',
    };
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err: any) {
    return { verified: false, notConfigured: true, reason: err.message };
  }

  try {
    const res = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transmission_id: headers.transmissionId,
        transmission_time: headers.transmissionTime,
        cert_url: headers.certUrl,
        auth_algo: headers.authAlgo,
        transmission_sig: headers.transmissionSig,
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    });

    if (!res.ok) {
      return { verified: false, reason: `PayPal respondió HTTP ${res.status} al verificar.` };
    }

    const data = (await res.json()) as { verification_status?: string };
    if (data.verification_status === 'SUCCESS') {
      return { verified: true };
    }
    return { verified: false, reason: `verification_status=${data.verification_status}` };
  } catch (err: any) {
    return { verified: false, reason: `Error de red al verificar: ${err.message}` };
  }
}
