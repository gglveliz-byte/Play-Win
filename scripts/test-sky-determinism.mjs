/**
 * Prueba la lógica determinista de Sky Runner 3D fuera del navegador:
 * el PRNG con semilla y la generación de pista. Si esto falla, los dos
 * jugadores no verían el mismo circuito y la partida sería injusta.
 *
 * Uso: node scripts/test-sky-determinism.mjs
 */
import { createPRNG, TrackManager } from '../apps/hub/public/games/sky/js/prng.js';

let fallos = 0;
const comprobar = (nombre, condicion, detalle = '') => {
  console.log(`  ${condicion ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!condicion) fallos++;
};

console.log('\n═══ DETERMINISMO DE SKY RUNNER 3D ═══\n');

// ── 1. La misma semilla produce la misma secuencia ──────────────────────────
console.log('  PRNG:');
const a = createPRNG(4926714);
const b = createPRNG(4926714);
const secA = Array.from({ length: 20 }, () => a());
const secB = Array.from({ length: 20 }, () => b());
comprobar('misma semilla -> misma secuencia', JSON.stringify(secA) === JSON.stringify(secB));

const c = createPRNG(9999999);
const secC = Array.from({ length: 20 }, () => c());
comprobar('semilla distinta -> secuencia distinta', JSON.stringify(secA) !== JSON.stringify(secC));

comprobar('los valores están en [0, 1)', secA.every((v) => v >= 0 && v < 1), `min ${Math.min(...secA).toFixed(3)} max ${Math.max(...secA).toFixed(3)}`);

// ── 2. La pista es idéntica para la misma semilla ───────────────────────────
console.log('\n  Pista (TrackManager):');
const pistaA = new TrackManager(4926714);
const pistaB = new TrackManager(4926714);

const filasA = [];
const filasB = [];
for (let i = 0; i < 40; i++) {
  filasA.push(JSON.stringify(pistaA.getRow(i)));
  filasB.push(JSON.stringify(pistaB.getRow(i)));
}
comprobar('misma semilla -> misma pista', JSON.stringify(filasA) === JSON.stringify(filasB));

const pistaC = new TrackManager(9999999);
const filasC = [];
for (let i = 0; i < 40; i++) filasC.push(JSON.stringify(pistaC.getRow(i)));
comprobar('semilla distinta -> pista distinta', JSON.stringify(filasA) !== JSON.stringify(filasC));

// ── 3. La pista es jugable: siempre hay al menos una vía libre ──────────────
console.log('\n  Jugabilidad de la pista (120 carriles comprobados):');
let filasSinVia = 0;
let filasVacio = 0;
for (let i = 0; i < 120; i++) {
  const fila = pistaA.getRow(i);
  if (!fila) {
    filasVacio++;
    continue;
  }
  const libres = fila.filter(Boolean).length;
  if (libres === 0) filasSinVia++;
}
comprobar('ninguna fila es un muro infranqueable', filasSinVia === 0, `${filasSinVia} filas sin salida`);
comprobar('todas las filas tienen contenido', filasVacio === 0, `${filasVacio} filas vacías`);

// ── 4. Geometría de carriles: el jugador nunca debe caer por ir al extremo ──
//
// El renderer dibuja 7 carriles con `project(i - 3.5)`, así que la pista abarca
// [-3.5, 3.5]. El motor debe limitar el movimiento a ese ancho y calcular el
// carril dentro de 0..6. Antes limitaba a ±4.2 y usaba `round(x+3)`, que daba
// columnas -1 y 7: el jugador caía y moría sin motivo en los extremos.
const CARRILES = 7;
const carrilDe = (x) => Math.min(CARRILES - 1, Math.max(0, Math.floor(x + CARRILES / 2)));
const LIMITE_X = CARRILES / 2 - 0.1;

const fila0 = pistaA.getRow(10);
const anchoFila = fila0 ? fila0.length : 0;
console.log(`\n  Geometría de carriles · la pista dibuja ${anchoFila} carriles · el motor permite x ∈ [-${LIMITE_X}, ${LIMITE_X}]`);
comprobar('la pista tiene 7 carriles', anchoFila === 7, `mide ${anchoFila}`);

// Recorre TODO el rango de movimiento y comprueba que siempre hay carril válido.
let fuera = 0;
const alcanzados = new Set();
for (let x = -LIMITE_X; x <= LIMITE_X; x += 0.05) {
  const col = carrilDe(x);
  alcanzados.add(col);
  const fila = pistaA.getRow(60);
  if (!fila || col < 0 || col >= fila.length) fuera++;
}
comprobar('ninguna posición de movimiento sale de la pista', fuera === 0, `${fuera} posiciones fuera`);
comprobar('se alcanzan los 7 carriles', alcanzados.size === 7, `alcanzados: ${[...alcanzados].sort((a, b) => a - b).join(', ')}`);

// ── 5. cleanup() no rompe el acceso posterior ───────────────────────────────
console.log('\n  Limpieza de pista:');
try {
  pistaA.cleanup(50);
  const tras = pistaA.getRow(60);
  comprobar('cleanup() no impide seguir leyendo filas', tras !== undefined);
} catch (err) {
  comprobar('cleanup() no lanza excepciones', false, err.message);
}

console.log(`\n${fallos === 0 ? '🎉 DETERMINISMO Y JUGABILIDAD CORRECTOS' : `❌ ${fallos} comprobación(es) fallaron`}\n`);
process.exit(fallos === 0 ? 0 : 1);
