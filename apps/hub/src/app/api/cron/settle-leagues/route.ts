import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { settleEngine } from '@/lib/db';
import { serverConfig } from '@/lib/config';

/**
 * Comparación en tiempo constante para evitar ataques de temporización
 * sobre el secreto del cron (mismo patrón que se aplica a los webhooks).
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const customHeader = req.headers.get('x-cron-secret');
    const token = authHeader?.replace('Bearer ', '') || customHeader;

    if (!secretMatches(token, serverConfig.cronSecret)) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere CRON_SECRET válido.' },
        { status: 401 }
      );
    }

    const result = await settleEngine.settleExpiredLeagues();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (err: any) {
    console.error('[CRON Settle Leagues Error]', err);
    return NextResponse.json(
      { error: 'Error durante el cierre semanal de ligas.' },
      { status: 500 }
    );
  }
}

// También permitir GET para testing seguro con token en query (?secret=...)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  if (!secretMatches(secret, serverConfig.cronSecret)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const result = await settleEngine.settleExpiredLeagues();
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    result,
  });
}
