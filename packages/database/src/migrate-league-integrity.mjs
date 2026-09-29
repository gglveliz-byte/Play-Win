/**
 * PLAY WIN — MIGRACIÓN: SELLADO DE LIGAS Y SHARDING POR MMR
 * ==============================================================================
 * Aplica los cambios de esquema necesarios para BUG-019 y BUG-020:
 *
 *  1. Trigger que RECHAZA el miembro #11 de una liga, como defensa en
 *     profundidad a nivel de base de datos. No basta con confiar en el código
 *     de aplicación: una carrera entre dos peticiones concurrentes podría
 *     crear una liga de 11 y repartir mal los $25.
 *
 *  2. Backfill del `rank_tier` de los pasaportes existentes, derivándolo del
 *     `skill_rating` con los umbrales oficiales. Antes TODOS eran 'BRONZE'
 *     porque ningún llamador calculaba la división.
 *
 *  3. Sellado de las ligas que ya tienen 10 miembros y siguen abiertas.
 *
 * Es IDEMPOTENTE: ejecutarlo varias veces no cambia nada.
 *
 * Uso (desde la raíz del repositorio):
 *   node --env-file=.env.test packages/database/src/migrate-league-integrity.mjs
 * ==============================================================================
 */

import pg from 'pg';
import { RANK_TIER_THRESHOLDS, LEAGUE_PRIZE_POOL } from './constants.js';

const LEAGUE_CAPACITY = 10;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Carga el entorno con --env-file=.env.test');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

/** Construye la expresión SQL que traduce skill_rating → rank_tier. */
function tierCaseExpression(column) {
  const whens = RANK_TIER_THRESHOLDS
    .filter((t) => t.min > 0)
    .sort((a, b) => b.min - a.min)
    .map((t) => `WHEN ${column} >= ${t.min} THEN '${t.tier}'`)
    .join(' ');
  const fallback = RANK_TIER_THRESHOLDS.find((t) => t.min === 0)?.tier || 'BRONZE';
  return `CASE ${whens} ELSE '${fallback}' END`;
}

const client = await pool.connect();
try {
  console.log('🔧 [Migración] Integridad de ligas y sharding por MMR\n');

  // ── 1. Trigger anti-liga-de-11 ─────────────────────────────────────────────
  console.log('1️⃣  Trigger que rechaza el miembro #' + (LEAGUE_CAPACITY + 1) + '...');
  await client.query(`
    CREATE OR REPLACE FUNCTION playwin_enforce_league_capacity()
    RETURNS TRIGGER AS $$
    DECLARE
      current_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO current_count
      FROM league_members
      WHERE league_id = NEW.league_id;

      IF current_count >= ${LEAGUE_CAPACITY} THEN
        RAISE EXCEPTION 'La liga % ya alcanzó su capacidad máxima de ${LEAGUE_CAPACITY} jugadores',
          NEW.league_id
          USING ERRCODE = 'check_violation';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.query(`DROP TRIGGER IF EXISTS trg_league_capacity ON league_members;`);
  await client.query(`
    CREATE TRIGGER trg_league_capacity
    BEFORE INSERT ON league_members
    FOR EACH ROW EXECUTE FUNCTION playwin_enforce_league_capacity();
  `);
  console.log('   ✅ Trigger trg_league_capacity creado\n');

  // ── 1b. Sellado automático de la base de datos ─────────────────────────────
  // El código de aplicación ya sella la liga, pero una inserción directa en SQL
  // (un script, una migración, otra ruta) la dejaría llena y abierta. Este
  // trigger convierte el invariante en una GARANTÍA de la base de datos.
  console.log('1️⃣b Trigger que sella la liga automáticamente al llenarse...');
  await client.query(`
    CREATE OR REPLACE FUNCTION playwin_seal_full_league()
    RETURNS TRIGGER AS $$
    DECLARE
      current_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO current_count
      FROM league_members
      WHERE league_id = NEW.league_id;

      IF current_count >= ${LEAGUE_CAPACITY} THEN
        UPDATE league_groups
        SET is_locked = TRUE
        WHERE id = NEW.league_id AND is_locked = FALSE;
      END IF;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.query(`DROP TRIGGER IF EXISTS trg_league_autoseal ON league_members;`);
  await client.query(`
    CREATE TRIGGER trg_league_autoseal
    AFTER INSERT ON league_members
    FOR EACH ROW EXECUTE FUNCTION playwin_seal_full_league();
  `);
  console.log('   ✅ Trigger trg_league_autoseal creado\n');

  // ── 2. Backfill del rank_tier ──────────────────────────────────────────────
  console.log('2️⃣  Backfill de rank_tier según skill_rating...');
  const antes = await client.query(
    'SELECT rank_tier, COUNT(*)::int AS n FROM game_passports GROUP BY rank_tier ORDER BY n DESC;'
  );
  console.log(`   Antes: ${JSON.stringify(antes.rows)}`);

  const updateRes = await client.query(`
    UPDATE game_passports
    SET rank_tier = ${tierCaseExpression('skill_rating')}, updated_at = NOW()
    WHERE rank_tier IS DISTINCT FROM ${tierCaseExpression('skill_rating')};
  `);
  console.log(`   Pasaportes actualizados: ${updateRes.rowCount}`);

  const despues = await client.query(
    'SELECT rank_tier, COUNT(*)::int AS n FROM game_passports GROUP BY rank_tier ORDER BY n DESC;'
  );
  console.log(`   Después: ${JSON.stringify(despues.rows)}\n`);

  // ── 3. Sellado de ligas llenas ─────────────────────────────────────────────
  console.log('3️⃣  Sellando ligas que ya tienen ' + LEAGUE_CAPACITY + ' miembros...');
  const sealRes = await client.query(`
    UPDATE league_groups g
    SET is_locked = TRUE
    WHERE g.is_locked = FALSE
      AND (SELECT COUNT(*) FROM league_members WHERE league_id = g.id) >= ${LEAGUE_CAPACITY};
  `);
  console.log(`   Ligas selladas: ${sealRes.rowCount}\n`);

  // ── Verificación ───────────────────────────────────────────────────────────
  console.log('🔍 Verificación:');
  const invalidas = await client.query(`
    SELECT g.id, COUNT(m.user_id)::int AS miembros
    FROM league_groups g
    JOIN league_members m ON m.league_id = g.id
    GROUP BY g.id
    HAVING COUNT(m.user_id) >= ${LEAGUE_CAPACITY} AND g.is_locked = FALSE;
  `);
  const divisiones = await client.query(
    'SELECT COUNT(DISTINCT rank_tier)::int AS divisiones FROM game_passports;'
  );
  const sobrecapacidad = await client.query(`
    SELECT g.id, COUNT(m.user_id)::int AS miembros
    FROM league_groups g JOIN league_members m ON m.league_id = g.id
    GROUP BY g.id HAVING COUNT(m.user_id) > ${LEAGUE_CAPACITY};
  `);

  console.log(`   Ligas llenas sin sellar : ${invalidas.rows.length} ${invalidas.rows.length === 0 ? '✅' : '❌'}`);
  console.log(`   Ligas con más de ${LEAGUE_CAPACITY}     : ${sobrecapacidad.rows.length} ${sobrecapacidad.rows.length === 0 ? '✅' : '❌'}`);
  console.log(`   Divisiones distintas    : ${divisiones.rows[0].divisiones} ${divisiones.rows[0].divisiones > 1 ? '✅' : '❌ (sigue todo en una sola)'}`);
  console.log(`   Bolsa por liga          : $${LEAGUE_PRIZE_POOL.toFixed(2)}`);

  const ok = invalidas.rows.length === 0 && sobrecapacidad.rows.length === 0 && divisiones.rows[0].divisiones > 1;
  console.log(`\n${ok ? '🎉 MIGRACIÓN COMPLETADA Y VERIFICADA' : '⚠️  Migración aplicada pero la verificación no pasó del todo'}`);
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error('❌ Error en la migración:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
