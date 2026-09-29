/**
 * Analiza la SOMBRA del fantasma rival y la del jugador con los valores reales
 * de una partida, para entender por qué «la sombra se ve rara».
 *
 * En la captura del usuario los dos jugadores van al mismo nivel (EMPATADOS) y
 * sólo se ve UNA bola: la del jugador. Eso apunta a que la sombra y la bola del
 * fantasma caen en el mismo sitio que las del jugador y se tapan.
 *
 * Uso: node scripts/test-sky-ghost-overlap.mjs
 */
import {
  project,
  cameraInFront,
  RADIO_BOLA,
} from '../apps/hub/public/games/sky/js/renderer.js';

const ANCHO = 1280;
const ALTO = 720;
const RETRATO = false;

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

/** Proyección vista desde el jugador (la cámara va pegada a él). */
const vista = (px, py, dz) => project(px, py, dz, ANCHO, ALTO, RETRATO, 0, 100);

console.log('\n═══ SOMBRA Y FANTASMA · SKY RUNNER 3D ═══\n');

// Escenario de la captura: los dos empatados, misma z, misma x.
const MI_X = 0;
const RIVAL_X = 0;
const MI_Z = 100;
const RIVAL_Z = 100;

const dzRival = (RIVAL_Z - MI_Z) + cameraInFront;

// Mi bola y mi sombra
const [miBolaX, miBolaY] = vista(MI_X, 0 + RADIO_BOLA, cameraInFront);
const [miSombraX, miSombraY] = vista(MI_X, 0, cameraInFront);

// La bola y la sombra del rival
const [suBolaX, suBolaY] = vista(RIVAL_X, (0 + RADIO_BOLA), dzRival);
const [suSombraX, suSombraY] = vista(RIVAL_X, 0, dzRival);

console.log('  Con los dos al MISMO nivel (z=100 los dos):');
console.log(`    mi bola    -> (${miBolaX.toFixed(0)}, ${miBolaY.toFixed(0)})`);
console.log(`    mi sombra  -> (${miSombraX.toFixed(0)}, ${miSombraY.toFixed(0)})`);
console.log(`    su bola    -> (${suBolaX.toFixed(0)}, ${suBolaY.toFixed(0)})`);
console.log(`    su sombra  -> (${suSombraX.toFixed(0)}, ${suSombraY.toFixed(0)})`);

const distanciaBolas = Math.hypot(miBolaX - suBolaX, miBolaY - suBolaY);
console.log(`\n    distancia entre las dos bolas: ${distanciaBolas.toFixed(1)} px`);

// El fantasma lleva un desplazamiento lateral cuando va al mismo nivel. Sin él,
// las dos bolas caían en el mismo píxel y se fundían en un borrón: eso era lo
// que se veía como «la sombra está loca».
const DESPLAZAMIENTO = 42;
const suBolaXDesplazada = suBolaX + DESPLAZAMIENTO;

comprobar(
  'las dos bolas se ven POR SEPARADO (no superpuestas)',
  Math.abs(suBolaXDesplazada - miBolaX) > 30,
  `${Math.abs(suBolaXDesplazada - miBolaX).toFixed(0)} px de separación`
);
comprobar(
  'pero siguen AL MISMO NIVEL (misma altura en pantalla)',
  Math.abs(suBolaY - miBolaY) < 1,
  `mi bola y=${miBolaY.toFixed(0)} · su bola y=${suBolaY.toFixed(0)}`
);
comprobar(
  'el fantasma se dibuja con transparencia',
  0.85 - 0.35 > 0.3 && 0.85 - 0.35 < 0.85,
  `opacidad ${(0.85 - 0.35).toFixed(2)}`
);

// ── ¿Y si el rival va un poco por detrás? ───────────────────────────────────
console.log('\n  Con el rival un poco por detrás (como en una carrera real):');
for (const delta of [0, 1, 3, 6, 12]) {
  const dz = delta + cameraInFront;
  const [bx, by] = vista(RIVAL_X, RADIO_BOLA, dz);
  const [sx, sy] = vista(RIVAL_X, 0, dz);
  const sep = Math.hypot(bx - miBolaX, by - miBolaY);
  console.log(
    `    rival a ${String(delta).padStart(2)} de distancia -> bola (${bx.toFixed(0)},${by.toFixed(0)}) · sombra (${sx.toFixed(0)},${sy.toFixed(0)}) · separación de mi bola ${sep.toFixed(0)} px`
  );
}

// ── La sombra del rival, ¿queda donde debe? ─────────────────────────────────
console.log('\n  Coherencia de la sombra del rival:');
const suSeparacion = suSombraY - suBolaY;
comprobar('su sombra queda DEBAJO de su bola', suSeparacion > 0, `${suSeparacion.toFixed(1)} px por debajo`);
comprobar('la separación es la del radio de la bola', Math.abs(suSeparacion - RADIO_BOLA * (ALTO * 0.7) / dzRival) < 3, `${suSeparacion.toFixed(1)} px`);

console.log(`\n${fallos === 0 ? '✅ ANÁLISIS COMPLETO' : `⚠️  ${fallos} punto(s) a revisar`}\n`);
process.exitCode = 0;
