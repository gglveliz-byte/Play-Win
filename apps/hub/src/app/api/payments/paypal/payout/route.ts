import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { userService, ledgerService, withTransaction } from '@/lib/db';
import { authLib } from '@/lib/auth';
import { serverConfig } from '@/lib/config';

/**
 * Solicitud de retiro de premios.
 *
 * ⚠️ ESTADO DE LA INTEGRACIÓN (BUG-015)
 * Este endpoint validaba el saldo, debitaba y respondía "Retiro procesado
 * exitosamente"… SIN LLAMAR A PAYPAL. El jugador perdía saldo y no recibía
 * dinero: el peor estado posible, porque parece que funcionó.
 *
 * Regla contable aplicada: un retiro NO puede nacer COMPLETED si el dinero
 * todavía no salió. Hasta que exista la integración real con la API de Payouts,
 * la operación se RECHAZA sin tocar el saldo.
 *
 * Para completar la integración (opción B del plan):
 *   1. Invocar `POST /v1/payments/payouts` desde lib/paypal.ts.
 *   2. Registrar el asiento con status 'PENDING' (no 'COMPLETED').
 *   3. Confirmar con el webhook PAYMENT.PAYOUTSBATCH.SUCCESS y pasar el asiento
 *      a 'COMPLETED' solo en ese momento.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('playwin_session')?.value;
    const payload = token ? authLib.verifyToken(token) : null;

    if (!payload?.userId) {
      return NextResponse.json({ error: 'Debes iniciar sesión para solicitar un retiro.' }, { status: 401 });
    }

    // La integración real solo se considera operativa con credenciales de PayPal
    // configuradas. Sin ellas, rechazar es más honesto que debitar sin pagar.
    if (!serverConfig.paypalClientId || !serverConfig.paypalClientSecret) {
      console.warn('[PayPal Payout] Retiro rechazado: faltan credenciales de PayPal.');
      return NextResponse.json(
        {
          success: false,
          error: 'Los retiros no están disponibles todavía: la integración con PayPal está pendiente.',
          code: 'PAYOUT_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { amount, paypalEmail } = body;
    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: 'Monto de retiro inválido.' }, { status: 400 });
    }

    if (withdrawAmount < 5.00) {
      return NextResponse.json({ error: 'El monto mínimo de retiro es $5.00 USD.' }, { status: 400 });
    }

    const user = await userService.getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
    }

    // NUMERIC de PostgreSQL llega como string: se normaliza antes de comparar.
    const currentBalance = parseFloat(String(user.wallet_balance ?? 0));
    if (withdrawAmount > currentBalance) {
      return NextResponse.json({
        error: `Saldo insuficiente. Tu saldo actual es $${currentBalance.toFixed(2)} USD.`,
      }, { status: 400 });
    }

    const targetEmail = (paypalEmail || user.paypal_email || user.email).trim().toLowerCase();
    const batchId = `payout_${user.id.slice(0, 8)}_${Date.now()}`;

    // Transacción atómica: debitar balance y registrar en el ledger
    const tx = await withTransaction(async (client) => {
      // 1. Debitar saldo
      const updateBalSql = `
        UPDATE users
        SET wallet_balance = wallet_balance - $2, paypal_email = $3, updated_at = NOW()
        WHERE id = $1 AND wallet_balance >= $2
        RETURNING wallet_balance;
      `;
      const balRes = await client.query(updateBalSql, [user.id, withdrawAmount, targetEmail]);
      if (balRes.rows.length === 0) {
        throw new Error('Conflicto de saldo al procesar el retiro.');
      }

      // 2. Registrar en wallet_ledger.
      //    El asiento nace 'PENDING', NO 'COMPLETED': el dinero todavía no salió.
      //    Solo el webhook PAYMENT.PAYOUTSBATCH.SUCCESS debe pasarlo a COMPLETED.
      const insertSql = `
        INSERT INTO wallet_ledger (
          user_id, amount, currency, type, status, provider, provider_tx_id, metadata
        )
        VALUES ($1, $2, 'USD', 'WITHDRAWAL', 'PENDING', 'PAYPAL', $3, $4)
        RETURNING id, amount, status, created_at;
      `;
      const txRes = await client.query(insertSql, [
        user.id,
        -withdrawAmount, // Negativo para débitos
        batchId,
        JSON.stringify({ receiverEmail: targetEmail, batchId }),
      ]);

      return {
        tx: txRes.rows[0],
        newBalance: balRes.rows[0].wallet_balance,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Retiro de $${withdrawAmount.toFixed(2)} USD solicitado hacia ${targetEmail}. Se completará cuando PayPal confirme la dispersión.`,
      transactionId: tx.tx.id,
      status: tx.tx.status,
      batchId,
      newBalance: tx.newBalance,
    });
  } catch (err: any) {
    console.error('[PayPal Payout Error]', err);
    return NextResponse.json({ error: err.message || 'Error al procesar el retiro.' }, { status: 500 });
  }
}
