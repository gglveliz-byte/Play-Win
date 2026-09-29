import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ledgerService } from '@/lib/db';
import { authLib } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('playwin_session')?.value;
    const payload = token ? authLib.verifyToken(token) : null;

    if (!payload?.userId) {
      return NextResponse.json({ success: true, transactions: [] });
    }

    const transactions = await ledgerService.getUserTransactions(payload.userId, 30);
    return NextResponse.json({ success: true, transactions });
  } catch (err: any) {
    console.error('[API /wallet/transactions Error]', err);
    return NextResponse.json(
      { error: 'Error al consultar transacciones.' },
      { status: 500 }
    );
  }
}
