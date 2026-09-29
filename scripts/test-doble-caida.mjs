/**
 * Prueba la REGLA DE VICTORIA de los juegos de supervivencia.
 *
 * Regla confirmada por el usuario: «el que gana es el que no cae al abismo».
 * El caso delicado es que caigan los DOS, que en Sky Runner es habitual porque
 * el circuito es determinista y los dos jugadores van al mismo ritmo.
 *
 * Lo que se comprueba:
 *   1. Si cae uno, gana el otro.
 *   2. Si caen los dos, gana quien aguantó MÁS TIEMPO.
 *   3. Si aguantan exactamente lo mismo, es EMPATE (no se inventa un ganador).
 *
 * Uso: node scripts/test-doble-caida.mjs
 */
import { resolverDobleCaida } from '../apps/realtime-server/src/match-clock.js';

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

console.log('\n═══ REGLA DE VICTORIA · CAÍDAS EN SUPERVIVENCIA ═══\n');

const CASOS = [
  { a: ['progamer2026', 97], b: ['carlos_pro', 46], esperaGanador: 'progamer2026', empate: false, nota: 'uno aguantó mucho más' },
  { a: ['progamer2026', 46], b: ['carlos_pro', 97], esperaGanador: 'carlos_pro', empate: false, nota: 'el otro aguantó más' },
  { a: ['progamer2026', 60], b: ['carlos_pro', 61], esperaGanador: 'carlos_pro', empate: false, nota: 'diferencia de un segundo' },
  { a: ['progamer2026', 50], b: ['carlos_pro', 50], esperaGanador: null, empate: true, nota: 'mismo tiempo: EMPATE' },
  { a: ['progamer2026', 0], b: ['carlos_pro', 5], esperaGanador: 'carlos_pro', empate: false, nota: 'cayeron casi al empezar' },
];

for (const caso of CASOS) {
  const r = resolverDobleCaida(caso.a[0], caso.a[1], caso.b[0], caso.b[1]);
  const ganadorOk = caso.empate ? r.empate === true : r.ganador === caso.esperaGanador && !r.empate;
  comprobar(
    `${caso.a[1]}s vs ${caso.b[1]}s (${caso.nota})`,
    ganadorOk,
    r.empate ? 'EMPATE declarado' : `gana ${r.ganador}`
  );
}

// ── El ganador nunca puede ser el que cayó antes ────────────────────────────
console.log('\n  Coherencia: nunca gana el que cayó antes');
let incoherentes = 0;
for (let tA = 0; tA <= 30; tA += 3) {
  for (let tB = 0; tB <= 30; tB += 3) {
    const r = resolverDobleCaida('A', tA, 'B', tB);
    if (r.empate) continue;
    const tiempoGanador = r.ganador === 'A' ? tA : tB;
    const tiempoPerdedor = r.ganador === 'A' ? tB : tA;
    if (tiempoGanador < tiempoPerdedor) incoherentes++;
  }
}
comprobar('en 121 combinaciones, el ganador siempre aguantó más', incoherentes === 0, `${incoherentes} incoherentes`);

// ── El resumen explica qué pasó ─────────────────────────────────────────────
console.log('\n  El resumen es informativo:');
const conDiferencia = resolverDobleCaida('ana', 40, 'luis', 12);
comprobar('menciona al que cayó antes y los tiempos', /luis/.test(conDiferencia.resumen) && /12/.test(conDiferencia.resumen) && /40/.test(conDiferencia.resumen), conDiferencia.resumen);
const empate = resolverDobleCaida('ana', 33, 'luis', 33);
comprobar('en empate lo dice claramente', /empate/i.test(empate.resumen), empate.resumen);

console.log(`\n${fallos === 0 ? '🎉 REGLA DE CAÍDAS CORRECTA' : `❌ ${fallos} comprobación(es) fallaron`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
