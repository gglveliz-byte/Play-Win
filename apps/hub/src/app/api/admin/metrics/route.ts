import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // 1. Partidas recientes con detalles de telemetría y árbitro
    const matchesRes = await query(`
      SELECT 
        m.id, m.room_id, m.game_id, m.winner_id, m.p1_score, m.p2_score,
        m.seed, m.finish_reason, m.duration_ms, m.created_at,
        u1.username AS player1_username,
        u2.username AS player2_username,
        w.username AS winner_username
      FROM match_records m
      JOIN users u1 ON u1.id = m.player1_id
      JOIN users u2 ON u2.id = m.player2_id
      LEFT JOIN users w ON w.id = m.winner_id
      ORDER BY m.created_at DESC
      LIMIT 15;
    `);

    // 2. Resumen contable de la Tesorería (Ledger)
    const ledgerRes = await query(`
      SELECT 
        entry_type,
        COUNT(*)::int AS count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM wallet_ledger
      GROUP BY entry_type;
    `);

    // 3. Micro-Ligas de 10 activas
    const leaguesRes = await query(`
      SELECT 
        g.id, g.game_id, g.season_number, g.tier, g.is_locked, g.ends_at,
        (SELECT COUNT(*)::int FROM league_members WHERE league_id = g.id) AS member_count
      FROM league_groups g
      WHERE g.is_locked = FALSE
      ORDER BY g.created_at DESC;
    `);

    // 4. Estadísticas globales
    const usersCountRes = await query(`SELECT COUNT(*)::int AS total FROM users;`);
    const matchesCountRes = await query(`SELECT COUNT(*)::int AS total FROM match_records;`);

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: usersCountRes.rows[0]?.total || 0,
        totalMatches: matchesCountRes.rows[0]?.total || 0,
      },
      recentMatches: matchesRes.rows,
      ledgerSummary: ledgerRes.rows,
      activeLeagues: leaguesRes.rows,
    });
  } catch (err: any) {
    console.error('[Admin Metrics Error]', err);
    return NextResponse.json(
      { error: 'Error obteniendo métricas administrativas.', details: err.message },
      { status: 500 }
    );
  }
}
