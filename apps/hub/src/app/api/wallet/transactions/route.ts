import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ledgerService } from '@/lib/db';
import { authLib } from '@/lib/auth';
import { unauthorized, serverError } from '@/lib/api-response';

/**
 * Extracto contable del jugador.
 *
 * Devuelve 401 si falta sesión, IGUAL que /api/matches/history. Antes devolvía
 * 200 con una lista vacía, así que el cliente no podía distinguir "sin
 * movimientos" de "sin sesión" (BUG-012).
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('playwin_session')?.value;
    const payload = token ? authLib.verifyToken(token) : null;

    if (!payload?.userId) {
      return unauthorized('Debes iniciar sesión para consultar tus movimientos.');
    }

    const transactions = await ledgerService.getUserTransactions(payload.userId, 30);
    return NextResponse.json({ success: true, transactions });
  } catch (err) {
    return serverError(err, 'GET /api/wallet/transactions');
  }
}
