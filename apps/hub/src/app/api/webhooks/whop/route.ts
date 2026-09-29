import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { query, ledgerService } from '@/lib/db';
import { serverConfig } from '@/lib/config';

/**
 * Comparación de firmas en tiempo constante.
 * Evita ataques de temporización y no filtra la longitud del secreto.
 */
function signatureMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    // 1. El secreto es OBLIGATORIO: sin él no se puede validar la autenticidad
    //    del webhook, así que se rechaza en lugar de aceptar a ciegas.
    const webhookSecret = serverConfig.whopWebhookSecret;
    if (!webhookSecret) {
      console.error('[Whop Webhook] WHOP_WEBHOOK_SECRET no configurado. Webhook rechazado.');
      return NextResponse.json(
        { error: 'Webhook no configurado en el servidor.' },
        { status: 503 }
      );
    }

    const rawBody = await req.text();

    // 2. La firma es OBLIGATORIA. No existe camino que la omita.
    const signature = req.headers.get('whop-signature') || req.headers.get('x-whop-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Falta la cabecera de firma.' }, { status: 401 });
    }

    const expectedDigest = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    // Whop puede enviar la firma como "sha256=<hex>" o como <hex> en crudo.
    const normalizedSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    if (!signatureMatches(normalizedSignature, expectedDigest)) {
      return NextResponse.json({ error: 'Firma HMAC inválida.' }, { status: 401 });
    }

    // 3. A partir de aquí el evento está autenticado criptográficamente.
    const payload = JSON.parse(rawBody);
    const { action, data } = payload;
    const email = (data?.user?.email || data?.email || '').trim().toLowerCase();
    const txId = data?.id || data?.payment_id || `whop_${Date.now()}`;

    // Buscar al usuario por correo
    let userId: string | null = null;
    if (email) {
      const uRes = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1);', [email]);
      if (uRes.rows.length > 0) {
        userId = uRes.rows[0].id;
      }
    }

    if (!userId) {
      console.warn(`[Whop Webhook] Usuario con correo ${email} no encontrado.`);
      return NextResponse.json({ received: true, note: 'User not found in DB' }, { status: 200 });
    }

    // Procesar eventos
    if (action === 'membership.went_valid') {
      await query('UPDATE users SET has_premium = TRUE, updated_at = NOW() WHERE id = $1;', [userId]);
      await ledgerService.recordTransaction({
        userId,
        amount: 0,
        currency: 'USD',
        type: 'WHOP_MEMBERSHIP_ACTIVATED',
        status: 'COMPLETED',
        provider: 'WHOP',
        providerTxId: `whop_sub_${txId}`,
        metadata: { action, plan: data?.plan_id },
      });
    } else if (action === 'membership.went_invalid') {
      await query('UPDATE users SET has_premium = FALSE, updated_at = NOW() WHERE id = $1;', [userId]);
    } else if (action === 'payment.succeeded') {
      const amount = parseFloat(data?.final_amount || data?.amount || '0') / 100; // Whop envía en centavos
      await ledgerService.recordTransaction({
        userId,
        amount,
        currency: 'USD',
        type: 'DEPOSIT',
        status: 'COMPLETED',
        provider: 'WHOP',
        providerTxId: `whop_pay_${txId}`,
        metadata: { action, currency: data?.currency },
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (err: any) {
    console.error('[Whop Webhook Error]', err);
    return NextResponse.json({ error: 'Error procesando webhook Whop.' }, { status: 500 });
  }
}
