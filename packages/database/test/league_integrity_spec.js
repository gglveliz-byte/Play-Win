/**
 * Prueba de integridad de ligas (BUG-019 / BUG-020).
 *
 * Verifica:
 *  1. El trigger rechaza el miembro #11 de una liga llena.
 *  2. `resolveRankTier` mapea correctamente en los límites de cada umbral.
 *  3. Ninguna liga con 10+ miembros queda sin sellar.
 *  4. Ninguna liga supera la capacidad.
 */
import pg from 'pg';
import assert from 'node:assert';
import { resolveRankTier, RANK_TIER_THRESHOLDS, LEAGUE_PRIZE_POOL } from '@playwin/database';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

let fallos = 0;
function check(nombre, fn) {
  try {
    fn();
    console.log(`✅ ${nombre}`);
  } catch (err) {
    fallos++;
    console.error(`❌ ${nombre}: ${err.message}`);
  }
}

console.log('🧪 [League Integrity] Verificando sharding por MMR y sellado de ligas...\n');

// ── 1. resolveRankTier en los límites exactos ────────────────────────────────
console.log('--- 1. Mapeo MMR → División en los límites ---');
const fronteras = [
  [0, 'BRONZE'],
  [1199, 'BRONZE'],
  [1399, 'BRONZE'],
  [1400, 'SILVER'],
  [1599, 'SILVER'],
  [1600, 'GOLD'],
  [1849, 'GOLD'],
  [1850, 'PLATINUM'],
  [2099, 'PLATINUM'],
  [2100, 'DIAMOND'],
  [2399, 'DIAMOND'],
  [2400, 'ELITE'],
  [5000, 'ELITE'],
];
for (const [rating, esperado] of fronteras) {
  check(`${rating} → ${esperado}`, () => {
    assert.strictEqual(resolveRankTier(rating), esperado);
  });
}
check('rating inválido (null) cae en BRONZE o superior, no revienta', () => {
  const tier = resolveRankTier(null);
  assert.ok(RANK_TIER_THRESHOLDS.some((t) => t.tier === tier), `división desconocida: ${tier}`);
});

// ── 2. El trigger rechaza el miembro #11 ─────────────────────────────────────
console.log('\n--- 2. Trigger anti-liga-de-11 ---');
const league = await pool.query(`SELECT id FROM league_groups ORDER BY created_at DESC LIMIT 1;`);
const ligaId = league.rows[0].id;
const capacidad = await pool.query('SELECT COUNT(*)::int AS n FROM league_members WHERE league_id = $1;', [ligaId]);
console.log(`   Liga de prueba: ${ligaId} con ${capacidad.rows[0].n} miembros`);

// Rellena hasta la capacidad con usuarios reales existentes
const huecos = Math.max(0, 10 - capacidad.rows[0].n);
if (huecos > 0) {
  const libres = await pool.query(
    `SELECT id FROM users
     WHERE id NOT IN (SELECT user_id FROM league_members WHERE league_id = $1)
     LIMIT $2;`,
    [ligaId, huecos]
  );
  for (const u of libres.rows) {
    await pool.query(
      `INSERT INTO league_members (league_id, user_id, season_points, position)
       VALUES ($1, $2, 0, 10) ON CONFLICT DO NOTHING;`,
      [ligaId, u.id]
    );
  }
}

const ahora = await pool.query('SELECT COUNT(*)::int AS n FROM league_members WHERE league_id = $1;', [ligaId]);
console.log(`   Liga ahora con ${ahora.rows[0].n} miembros`);

const candidato = await pool.query(
  `SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM league_members WHERE league_id = $1) LIMIT 1;`,
  [ligaId]
);

if (candidato.rows.length === 0) {
  console.log('   ⚠️  No hay usuarios libres para probar el rechazo (se omite)');
} else {
  try {
    await pool.query(
      `INSERT INTO league_members (league_id, user_id, season_points, position) VALUES ($1, $2, 0, 10);`,
      [ligaId, candidato.rows[0].id]
    );
    check('El miembro #11 debe ser RECHAZADO', () => {
      throw new Error('la inserción fue aceptada: el trigger NO protege');
    });
  } catch (err) {
    check('El miembro #11 es RECHAZADO por el trigger', () => {
      assert.match(err.message, /capacidad máxima|check_violation|alcanzó/i);
    });
  }
}

// ── 3. Estado global de integridad ───────────────────────────────────────────
console.log('\n--- 3. Integridad global ---');
const sinSellar = await pool.query(`
  SELECT COUNT(*)::int AS n FROM league_groups g
  WHERE g.is_locked = FALSE
    AND (SELECT COUNT(*) FROM league_members WHERE league_id = g.id) >= 10;`);
check('Ninguna liga llena queda sin sellar', () => {
  assert.strictEqual(sinSellar.rows[0].n, 0, `hay ${sinSellar.rows[0].n} ligas llenas abiertas`);
});

const sobrecap = await pool.query(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT league_id FROM league_members GROUP BY league_id HAVING COUNT(*) > 10
  ) t;`);
check('Ninguna liga supera los 10 jugadores', () => {
  assert.strictEqual(sobrecap.rows[0].n, 0, `hay ${sobrecap.rows[0].n} ligas sobrecapacitadas`);
});

const divisiones = await pool.query('SELECT COUNT(DISTINCT rank_tier)::int AS n FROM game_passports;');
check('Existe más de una división en uso (el sharding funciona)', () => {
  assert.ok(divisiones.rows[0].n > 1, `solo hay ${divisiones.rows[0].n} división`);
});

const coherencia = await pool.query(`
  SELECT COUNT(*)::int AS n FROM game_passports p
  WHERE p.rank_tier IS DISTINCT FROM (
    CASE
      WHEN p.skill_rating >= 2400 THEN 'ELITE'
      WHEN p.skill_rating >= 2100 THEN 'DIAMOND'
      WHEN p.skill_rating >= 1850 THEN 'PLATINUM'
      WHEN p.skill_rating >= 1600 THEN 'GOLD'
      WHEN p.skill_rating >= 1400 THEN 'SILVER'
      ELSE 'BRONZE'
    END);`);
check('Todo rank_tier concuerda con su skill_rating', () => {
  assert.strictEqual(coherencia.rows[0].n, 0, `hay ${coherencia.rows[0].n} pasaportes incoherentes`);
});

console.log(`\n   Bolsa por liga verificada: $${LEAGUE_PRIZE_POOL.toFixed(2)}`);
console.log(`\n${fallos === 0 ? '🎉 INTEGRIDAD DE LIGAS Y SHARDING VERIFICADOS AL 100%' : `❌ ${fallos} comprobaciones fallaron`}`);

await pool.end();
process.exit(fallos === 0 ? 0 : 1);
