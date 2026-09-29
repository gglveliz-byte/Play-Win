import { NextResponse } from 'next/server';
import { query, ledgerService } from '@/lib/db';
import { extractWebhookHeaders, verifyWebhookSignature } from '@/lib/paypal';

/**
 * Webhook de PayPal.
 *
 * SEGURIDAD (BUG-001 de la auditoría): este endpoint acredita saldo real, así
 * que TODO evento debe superar la verificación criptográfica de PayPal antes de
 * tocar la base de datos. No existe ningún camino que acredite sin verificar:
 *   - Sin credenciales configuradas → 503 (no se puede validar autenticidad).
 *   - Sin cabeceras de firma        → 401.
 *   - Firma no confirmada por PayPal → 401.
 */
export async function POST(req: Request) {
  try {
    // 1. El cuerpo debe leerse CRUDO: PayPal exige reenviar el evento sin
    //    reformatear. Parsear y re-serializar rompe la verificación.
    const rawBody = await req.text();

    // 2. Cabeceras de verificación obligatorias
    const headers = extractWebhookHeaders(req.headers);
    if (!headers) {
      return NextResponse.json(
        { error: 'Faltan las cabeceras de verificación de PayPal.' },
        { status: 401 }
      );
    }

    // 3. Verificación criptográfica contra la API de PayPal
    const verification = await verifyWebhookSignature(rawBody, headers);

    if (verification.notConfigured) {
      console.error('[PayPal Webhook] No configurado:', verification.reason);
      return NextResponse.json(
        { error: 'Webhook no configurado en el servidor.' },
        { status: 503 }
      );
    }

    if (!verification.verified) {
      console.warn('[PayPal Webhook] Firma rechazada:', verification.reason);
      return NextResponse.json({ error: 'Firma del webhook inválida.' }, { status: 401 });
    }

    // 4. A partir de aquí el evento está autenticado criptográficamente.
    const event = JSON.parse(rawBody);
    const eventType = event.event_type;
    const resource = event.resource;
    const txId = resource?.id || `pp_${Date.now()}`;

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const email = resource?.payer?.email_address?.toLowerCase();
      const amount = parseFloat(resource?.amount?.value || '0');

      if (email && amount > 0) {
        const uRes = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1);', [email]);
        if (uRes.rows.length > 0) {
          const userId = uRes.rows[0].id;
          await ledgerService.recordTransaction({
            userId,
            amount,
            currency: resource?.amount?.currency_code || 'USD',
            type: 'DEPOSIT',
            status: 'COMPLETED',
            provider: 'PAYPAL',
            providerTxId: `pp_dep_${txId}`,
            metadata: { eventType, captureId: resource.id },
          });
        }
      }
    } else if (eventType === 'PAYMENT.PAYOUTSBATCH.SUCCESS') {
      console.log('[PayPal Webhook] Lote de Payouts completado:', resource?.batch_header?.payout_batch_id);
    }

    return NextResponse.json({ received: true, eventType });
  } catch (err: any) {
    console.error('[PayPal Webhook Error]', err);
    return NextResponse.json({ error: 'Error procesando webhook de PayPal.' }, { status: 500 });
  }
}
