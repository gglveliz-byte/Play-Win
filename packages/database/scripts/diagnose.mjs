/**
 * Diagnóstico de partidas y colas.
 *
 * Responde de un vistazo a: ¿hay alguien esperando?, ¿hay partidas vivas?,
 * ¿se están registrando resultados en la base de datos?
 *
 * Uso: node --env-file=.env.test packages/database/scripts/diagnose.mjs
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// ── 1. Servidor de duelos ────────────────────────────────────────────────────
console.log('\n═══ SERVIDOR DE DUELOS (ws://localhost:3001) ═══');
try {
  const r = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(6000) });
  const h = await r.json();
  console.log(`  Estado        : EN LÍNEA · uptime ${Math.round(h.uptimeSeconds / 60)} min`);
  console.log(`  Bots activos  : ${h.config?.ghostBotsEnabled ?? '(servidor viejo, sin este dato)'}`);
  console.log(`  Partidas vivas: ${h.duels.activeRoomCount} (${h.duels.humanMatchCount} humanas · ${h.duels.ghostMatchCount} contra bot)`);
  console.log(`  En cola       : ${h.duels.waitingPlayersTotal} ${JSON.stringify(h.duels.waitingInQueue)}`);
  for (const room of h.duels.rooms) {
    console.log(`    · ${room.roomId} ${room.gameId} [${room.status}] ${room.playerA} ${room.scoreA} vs ${room.playerB ?? room.rival} ${room.scoreB}`);
  }
} catch (err) {
  console.log(`  ❌ SIN RESPUESTA: ${err.message}`);
  console.log('     → El servidor de duelos NO está corriendo. Arranca: npm run dev:realtime');
}

// ── 2. Hub ───────────────────────────────────────────────────────────────────
console.log('\n═══ HUB (http://localhost:3000) ═══');
try {
  const r = await fetch('http://localhost:3000/api/auth/me', { signal: AbortSignal.timeout(6000) });
  console.log(`  Estado        : EN LÍNEA (HTTP ${r.status})`);
} catch (err) {
  console.log(`  ❌ SIN RESPUESTA: ${err.message}`);
}

// ── 3. Partidas registradas ──────────────────────────────────────────────────
console.log('\n═══ ÚLTIMAS PARTIDAS REGISTRADAS ═══');
const partidas = await pool.query(`
  SELECT m.game_id, m.p1_score, m.p2_score, m.finish_reason, m.duration_ms, m.created_at,
         u1.username AS p1, u2.username AS p2, w.username AS ganador
  FROM match_records m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN users w ON w.id = m.winner_id
  ORDER BY m.created_at DESC LIMIT 5;
`);
if (partidas.rows.length === 0) {
  console.log('  (ninguna)');
} else {
  for (const m of partidas.rows) {
    const dur = Math.round(m.duration_ms / 1000);
    console.log(
      `  ${String(m.created_at).slice(11, 19)} ${m.game_id.padEnd(12)} ${String(m.p1).padEnd(16)} ${String(m.p1_score).padStart(5)} vs ${String(m.p2_score).padStart(5)} ${String(m.p2).padEnd(16)} → ${m.ganador} (${m.finish_reason}, ${dur}s)`
    );
  }
}

const total = await pool.query('SELECT COUNT(*)::int AS n FROM match_records;');
const hoy = await pool.query("SELECT COUNT(*)::int AS n FROM match_records WHERE created_at > NOW() - INTERVAL '1 hour';");
console.log(`\n  Total histórico: ${total.rows[0].n} · Última hora: ${hoy.rows[0].n}`);

await pool.end();
console.log('');
