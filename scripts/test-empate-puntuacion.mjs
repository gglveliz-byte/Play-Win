/**
 * Comprueba que TODAS las vías de cierre respetan el empate.
 *
 * Bug que cubre: `_resolveScoreWinner` comparaba con `p1 >= p2`, así que cuando
 * los dos jugadores acababan con la MISMA puntuación elegía ganador a `playerA`
 * por posición, mientras el resumen decía «Empate a N». El ganador cobraba 100
 * puntos y el otro 20. Es el mismo fallo que ya se corrigió en la doble caída,
 * pero seguía vivo en la vía de tiempo agotado y en la de abandono.
 *
 * Uso: node scripts/test-empate-puntuacion.mjs
 */
import { resolverDobleCaida } from '../apps/realtime-server/src/match-clock.js';
import fs from 'node:fs';

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

console.log('\n═══ EL EMPATE EN TODAS LAS VÍAS DE CIERRE ═══\n');

// ── 1. Doble caída (ya cubierto por test:caidas, se repite como control) ────
console.log('  Doble caída:');
const mismaCaida = resolverDobleCaida('alfa', 50, 'beta', 50);
comprobar('con el mismo tiempo es EMPATE', mismaCaida.empate === true, `empate=${mismaCaida.empate}`);
const distintaCaida = resolverDobleCaida('alfa', 97, 'beta', 46);
comprobar('con tiempos distintos NO es empate', distintaCaida.empate !== true, `gana ${distintaCaida.ganador}`);

// ── 2. Victoria por puntuación: se revisa el CÓDIGO REAL ───────────────────
//
// No se puede instanciar RoomManager sin base de datos, así que se comprueba la
// lógica fuente: que la comparación sea estricta y que exista la rama de empate.
console.log('\n  Victoria por puntuación (revisión del código real):');
const rooms = fs.readFileSync('apps/realtime-server/src/rooms.js', 'utf8');

comprobar(
  'existe la rama de empate por puntuaciones iguales',
  /if \(p1 === p2\) \{[\s\S]{0,200}_finalizarEmpate/.test(rooms),
  'busca `if (p1 === p2)` seguido de _finalizarEmpate'
);
comprobar(
  'ya NO se elige ganador con `p1 >= p2`',
  !/p1 >= p2/.test(rooms),
  'la comparación no estricta era la causa del ganador por posición'
);
comprobar(
  'el ganador se decide con comparación ESTRICTA',
  /p1 > p2 \? room\.playerA : room\.playerB/.test(rooms),
  'p1 > p2'
);
comprobar(
  'el empate cierra SIN ganador (cerrarEnEmpate)',
  /cerrarEnEmpate/.test(rooms),
  'la vía de empate existe'
);

// ── 3. El módulo de cierre reparte los mismos puntos en empate ─────────────
console.log('\n  Reparto de puntos en empate:');
const matchEnd = fs.readFileSync('apps/realtime-server/src/match-end.js', 'utf8');
comprobar('el empate da los MISMOS puntos a los dos', /payout: \{ winnerSeasonPoints: PUNTOS_EMPATE, loserSeasonPoints: PUNTOS_EMPATE \}/.test(matchEnd));
comprobar('el empate se marca con isDraw', /isDraw: true/.test(matchEnd));
comprobar('el empate NO declara ganador', /winnerId: null,/.test(matchEnd));

// ── 4. El SDK sabe mostrar un empate ───────────────────────────────────────
console.log('\n  El SDK sabe mostrarlo:');
const bridge = fs.readFileSync('packages/game-sdk/playwin-bridge.js', 'utf8');
comprobar('detecta isDraw', /const isDraw = msg\.isDraw === true/.test(bridge));
comprobar('muestra EMPATE en el cartel', /isDraw \? 'EMPATE'/.test(bridge));
comprobar('no cuenta como victoria', /const isWin = !isDraw && msg\.winnerId === currentPlayer\.id/.test(bridge));

console.log(`\n${fallos === 0 ? '🎉 EL EMPATE SE RESPETA EN TODAS LAS VÍAS' : `❌ ${fallos} problema(s)`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
