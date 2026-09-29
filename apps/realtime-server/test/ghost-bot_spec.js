/**
 * Verifica que los rivales de división (bots) respetan el nivel del jugador.
 *
 * Antes la lista era incoherente: un bot DIAMANTE con 2050 de MMR podía
 * aparecer contra un jugador de ORO de 1820, justo lo contrario de lo que
 * promete el sharding por habilidad.
 */
import assert from 'node:assert';
import { DIVISION_RIVALS, getDivisionRival } from '../src/ghost-bot.js';
import { resolveRankTier, RANK_TIERS } from '@playwin/database/constants';

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

console.log('🧪 [Ghost Bots] Verificando coherencia de división y MMR...\n');

// 1. Cada bot debe tener el rango que le corresponde por su MMR
console.log('--- 1. Coherencia interna de cada bot ---');
for (const bot of DIVISION_RIVALS) {
  check(`${bot.username.padEnd(16)} MMR ${String(bot.skillRating).padStart(4)} → ${bot.rank}`, () => {
    const esperado = resolveRankTier(bot.skillRating);
    assert.strictEqual(
      bot.rank,
      esperado,
      `dice ${bot.rank} pero su MMR ${bot.skillRating} corresponde a ${esperado}`
    );
  });
}

// 2. Debe haber bots en todas las divisiones (nadie se queda sin rival de su nivel)
console.log('\n--- 2. Cobertura de todas las divisiones ---');
for (const tier of RANK_TIERS) {
  check(`Existen bots en ${tier}`, () => {
    const n = DIVISION_RIVALS.filter((b) => b.rank === tier).length;
    assert.ok(n >= 2, `solo hay ${n} bot(s) en ${tier}: se notaría la repetición`);
  });
}

// 3. El rival elegido debe ser SIEMPRE de la división del jugador
console.log('\n--- 3. El rival respeta la división del jugador ---');
for (const tier of RANK_TIERS) {
  check(`Un jugador de ${tier} recibe un rival de ${tier}`, () => {
    for (let i = 0; i < 30; i++) {
      const rival = getDivisionRival('progamer2026', tier);
      assert.strictEqual(rival.rank, tier, `se eligió a ${rival.username} (${rival.rank})`);
    }
  });
}

// 4. Nunca debe elegirse a sí mismo
console.log('\n--- 4. Nunca se empareja consigo mismo ---');
check('El jugador no es su propio rival', () => {
  for (let i = 0; i < 50; i++) {
    const rival = getDivisionRival('titan_speed', 'DIAMOND');
    assert.notStrictEqual(rival.username, 'titan_speed');
  }
});

// 5. Sin división conocida, cae a la lista completa (no deja al jugador colgado)
console.log('\n--- 5. Comportamiento sin división conocida ---');
check('Sin división devuelve un rival de la lista completa', () => {
  const rival = getDivisionRival('progamer2026');
  assert.ok(rival && rival.username, 'debería devolver algún rival antes que dejar esperando');
  assert.ok(RANK_TIERS.includes(rival.rank));
});

console.log(`\n${fallos === 0 ? '🎉 RIVALES DE DIVISIÓN COHERENTES AL 100%' : `❌ ${fallos} comprobaciones fallaron`}`);
process.exit(fallos === 0 ? 0 : 1);
