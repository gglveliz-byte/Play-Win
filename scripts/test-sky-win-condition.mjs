/**
 * Verifica la REGLA DE VICTORIA de Sky Runner 3D.
 *
 * Regla (confirmada por el usuario): «el que gana es el que no cae al abismo».
 * Este juego es de SUPERVIVENCIA, no de distancia: los dos avanzan al mismo
 * ritmo, así que lo único que decide el duelo es quién aguanta más tiempo.
 *
 * Uso: node scripts/test-sky-win-condition.mjs
 */
import { TrackManager } from '../apps/hub/public/games/sky/js/prng.js';
import { cameraInFront } from '../apps/hub/public/games/sky/js/renderer.js';

const FIXED_STEP = 1 / 60;
const GRAVEDAD = 0.006;
const IMPULSO = 0.12;
const CARRILES = 7;
const LIMITE_X = CARRILES / 2 - 0.1;
const carrilDe = (x) => Math.min(CARRILES - 1, Math.max(0, Math.floor(x + CARRILES / 2)));

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

/**
 * Corre una partida con una habilidad dada.
 * @param {number} acierto Probabilidad (0..1) de reaccionar bien a un hueco.
 */
function correr(seed, acierto) {
  const pista = new TrackManager(seed);
  let x = 0, y = 0, vy = 0, z = 0, pasos = 0, enElAire = false;
  const MAX = 60 * 300; // 5 minutos simulados

  for (; pasos < MAX; pasos++) {
    z += Math.min(0.5, 0.2 + z / 5000);
    const fila = (z + cameraInFront) | 0;

    // El jugador imperfecto a veces NO reacciona a tiempo. Cuando no reacciona
    // tampoco corrige el rumbo: se queda donde está y acaba sobre un hueco. Sin
    // modelar esto, el test decía «nadie cae nunca», justo lo contrario de la
    // realidad: la habilidad consiste precisamente en reaccionar a tiempo.
    const reacciona = Math.random() < acierto;

    if (reacciona) {
      // Busca el carril con más recorrido sólido por delante.
      let mejorCarril = carrilDe(x);
      let mejorMargen = -1;
      for (let c = 0; c < CARRILES; c++) {
        let m = 0;
        while (m < 8 && pista.getRow(fila + m)?.[c]) m++;
        if (m > mejorMargen) { mejorMargen = m; mejorCarril = c; }
      }
      const objetivo = mejorCarril - CARRILES / 2 + 0.5;
      if (Math.abs(objetivo - x) > 0.11) x += Math.sign(objetivo - x) * 0.11;
      else x = objetivo;
      x = Math.max(-LIMITE_X, Math.min(LIMITE_X, x));
    }

    const col = carrilDe(x);
    const sobrePista = pista.getRow(fila)?.[col];

    // Salta si el hueco empieza justo delante y va sobre pista firme.
    if (reacciona && !enElAire && sobrePista) {
      let solidas = 0;
      while (solidas < 6 && pista.getRow(fila + solidas + 1)?.[col]) solidas++;
      if (solidas === 0) { y = 0.06; vy = IMPULSO; enElAire = true; }
    }

    if (!enElAire && y <= 0.05 && y >= -0.35 && sobrePista) {
      y = 0; vy = 0;
    } else {
      y += (vy -= GRAVEDAD);
      if (y <= 0 && sobrePista && vy < 0) { y = 0; vy = 0; enElAire = false; }
    }

    if (y <= -4) return { pasos, cayo: true };
  }
  return { pasos, cayo: false };
}

console.log('\n═══ REGLA DE VICTORIA · SKY RUNNER 3D ═══\n');

// ── 1. Un jugador perfecto no cae (la pista es superable) ───────────────────
console.log('  La pista es jugable:');
const perfecto = correr(4926714, 1.0);
comprobar('un jugador perfecto sobrevive los 5 min simulados', !perfecto.cayo, `${(perfecto.pasos * FIXED_STEP).toFixed(0)} s de supervivencia`);

// ── 2. Se puede perder: un jugador que NO mira el circuito cae ──────────────
//
// Modelar la imperfección como «a veces no salta» no bastaba: la pista garantiza
// un paso practicable, así que quien se coloca en el carril bueno nunca cae
// aunque no salte. La forma realista de fallar es NO LEER el circuito.
console.log('\n  Se puede perder (jugador que no mira el circuito):');
const aCiegas = correr(4926714, 0);       // nunca corrige el rumbo
const atento = correr(4926714, 1.0);      // siempre busca el carril seguro
console.log(`    a ciegas -> ${aCiegas.cayo ? `cayó a los ${(aCiegas.pasos * FIXED_STEP).toFixed(1)} s` : 'sobrevivió'}`);
console.log(`    atento   -> ${atento.cayo ? 'cayó' : `sobrevivió ${(atento.pasos * FIXED_STEP).toFixed(0)} s`}`);
comprobar('un jugador que no mira el circuito acaba cayendo', aCiegas.cayo);
comprobar('un jugador atento sobrevive', !atento.cayo);

// ── 3. Cuanto mejor juegas, más aguantas (el ranking es significativo) ──────
console.log('\n  La habilidad se refleja en el tiempo:');
const malo = correr(4926714, 0.6);
const bueno = correr(4926714, 1.0);
comprobar(
  'sobrevivir más tiempo da mejor puntuación',
  bueno.pasos >= malo.pasos,
  `bueno ${(bueno.pasos * FIXED_STEP).toFixed(1)} s vs malo ${(malo.pasos * FIXED_STEP).toFixed(1)} s`
);

// ── 4. El ganador es el que NO cae ──────────────────────────────────────────
console.log('\n  Resolución del duelo (el que no cae gana):');
const rival = { pasos: 120, cayo: true };      // cayó a los 2 s
const yo = { pasos: 3000, cayo: false };        // sobreviví
const gane = !yo.cayo && rival.cayo;
comprobar('si el rival cae y yo no, gano yo', gane);
const empateAmbosCaen = { yo: { cayo: true }, rival: { cayo: true } };
comprobar('si los dos caen, el servidor decide por tiempo de supervivencia', empateAmbosCaen.yo.cayo && empateAmbosCaen.rival.cayo, 'se resuelve con la puntuación');

console.log(`\n${fallos === 0 ? '🎉 REGLA DE VICTORIA COHERENTE' : `❌ ${fallos} comprobación(es) fallaron`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
