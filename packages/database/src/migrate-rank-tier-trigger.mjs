/**
 * PLAY WIN — MIGRACIÓN: RANK_TIER SIEMPRE DERIVADO DEL SKILL_RATING
 * ==============================================================================
 * Problema que resuelve (BUG-019, segunda parte):
 *
 *   El `rank_tier` lo calculaba el código de aplicación al CREAR el pasaporte,
 *   pero nada lo recalculaba después. Como el `skill_rating` SÍ cambia (en cada
 *   duelo y en el cierre semanal), ambos valores derivaban: un jugador podía
 *   tener 2000 de MMR y seguir etiquetado como BRONZE.
 *
 * Consecuencia: el sharding por división se corrompe con el tiempo. Se detectó
 * un pasaporte incoherente en la verificación tras unas pocas partidas.
 *
 * Solución: un TRIGGER que recalcula `rank_tier` a partir de `skill_rating` en
 * cada INSERT y UPDATE. Así la coherencia deja de depender de que cada ruta se
 * acuerde de hacerlo: es una garantía de la base de datos.
 *
 * Los umbrales viven en `constants.js` (única fuente de verdad) y se inyectan
 * aquí en el SQL generado.
 *
 * Es IDEMPOTENTE.
 *
 * Uso: node --env-file=.env.test packages/database/src/migrate-rank-tier-trigger.mjs
 * ==============================================================================
 */

import pg from 'pg';
import { RANK_TIER_THRESHOLDS } from './constants.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Carga el entorno con --env-file=.env.test');
  process.exit(1);
}

/** Expresión SQL que traduce un rating a división, desde los umbrales oficiales. */
function tierCase(column) {
  const whens = RANK_TIER_THRESHOLDS
    .filter((t) => t.min > 0)
    .sort((a, b) => b.min - a.min)
    .map((t) => `WHEN ${column} >= ${t.min} THEN '${t.tier}'`)
    .join(' ');
  const fallback = RANK_TIER_THRESHOLDS.find((t) => t.min === 0)?.tier || 'BRONZE';
  return `CASE ${whens} ELSE '${fallback}' END`;
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const client = await pool.connect();

try {
  console.log('🔧 [Migración] rank_tier derivado de skill_rating\n');

  console.log('1️⃣  Creando función que deriva la división desde el MMR...');
  await client.query(`
    CREATE OR REPLACE FUNCTION playwin_sync_rank_tier()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.rank_tier := ${tierCase('NEW.skill_rating')};
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('   ✅ Función playwin_sync_rank_tier creada\n');

  console.log('2️⃣  Instalando trigger en game_passports (INSERT y UPDATE)...');
  await client.query(`DROP TRIGGER IF EXISTS trg_sync_rank_tier ON game_passports;`);
  await client.query(`
    CREATE TRIGGER trg_sync_rank_tier
    BEFORE INSERT OR UPDATE OF skill_rating, rank_tier ON game_passports
    FOR EACH ROW EXECUTE FUNCTION playwin_sync_rank_tier();
  `);
  console.log('   ✅ Trigger trg_sync_rank_tier instalado\n');

  console.log('3️⃣  Backfill: corrigiendo pasaportes incoherentes...');
  const antes = await client.query(`
    SELECT COUNT(*)::int AS n FROM game_passports
    WHERE rank_tier IS DISTINCT FROM ${tierCase('skill_rating')};
  `);
  const fix = await client.query(`
    UPDATE game_passports
    SET rank_tier = ${tierCase('skill_rating')}
    WHERE rank_tier IS DISTINCT FROM ${tierCase('skill_rating')};
  `);
  console.log(`   Incoherentes antes: ${antes.rows[0].n} · corregidos: ${fix.rowCount}\n`);

  // ── Verificación ───────────────────────────────────────────────────────────
  console.log('🔍 Verificación:');

  const incoherentes = await client.query(`
    SELECT COUNT(*)::int AS n FROM game_passports
    WHERE rank_tier IS DISTINCT FROM ${tierCase('skill_rating')};
  `);

  const dist = await client.query(
    'SELECT rank_tier, COUNT(*)::int AS n FROM game_passports GROUP BY rank_tier ORDER BY n DESC;'
  );

  // Prueba viva: se fuerza un MMR alto y se comprueba que la división lo sigue.
  let pruebaTrigger = 'no ejecutada';
  const victima = await client.query('SELECT id, user_id, game_id, skill_rating, rank_tier FROM game_passports LIMIT 1;');
  if (victima.rows.length > 0) {
    const p = victima.rows[0];
    await client.query('UPDATE game_passports SET skill_rating = 2500 WHERE id = $1;', [p.id]);
    const tras = await client.query('SELECT rank_tier FROM game_passports WHERE id = $1;', [p.id]);
    pruebaTrigger = `MMR 2500 → ${tras.rows[0].rank_tier} ${tras.rows[0].rank_tier === 'ELITE' ? '✅' : '❌'}`;
    // Restaura el valor original
    await client.query('UPDATE game_passports SET skill_rating = $2 WHERE id = $1;', [p.id, p.skill_rating]);
    const restaurado = await client.query('SELECT rank_tier FROM game_passports WHERE id = $1;', [p.id]);
    pruebaTrigger += ` · restaurado MMR ${p.skill_rating} → ${restaurado.rows[0].rank_tier}`;
  }

  console.log(`   Pasaportes incoherentes: ${incoherentes.rows[0].n} ${incoherentes.rows[0].n === 0 ? '✅' : '❌'}`);
  console.log(`   Distribución por división: ${JSON.stringify(dist.rows)}`);
  console.log(`   Prueba viva del trigger: ${pruebaTrigger}`);

  const ok = incoherentes.rows[0].n === 0 && pruebaTrigger.includes('✅');
  console.log(`\n${ok ? '🎉 rank_tier AHORA ES DERIVADO Y COHERENTE' : '⚠️  La migración aplicó pero la verificación no pasó'}`);
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error('❌ Error en la migración:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
