/**
 * Simula la física de Sky Runner 3D para responder a una pregunta de DISEÑO:
 * dos jugadores que juegan igual, ¿terminan alguna vez el duelo?
 *
 * Es la comprobación del reporte «nadie gana, ambos tienen la misma distancia».
 *
 * Uso: node scripts/test-sky-race-logic.mjs
 */
import { TrackManager } from '../apps/hub/public/games/sky/js/prng.js';
import { cameraInFront } from '../apps/hub/public/games/sky/js/renderer.js';

// Parámetros del motor (game.js)
const FIXED_STEP = 1 / 60; // segundos por paso
const GRAVEDAD = 0.006;
const IMPULSO_SALTO = 0.12;
const CARRILES = 7;
const LIMITE_X = CARRILES / 2 - 0.1;
const RADIO_BOLA = 0.35;

const carrilDe = (x) => Math.min(CARRILES - 1, Math.max(0, Math.floor(x + CARRILES / 2)));

/**
 * Corre una partida con un jugador EXPERTO.
 *
 * El jugador mira 6 filas por delante, elige el carril que le deja más margen y
 * salta en el último momento seguro para cruzar el hueco. Si NI ASÍ se puede
 * sobrevivir, la pista es imposible y el juego no tiene competitividad posible.
 *
 * @returns {{z:number, pasos:number, cayo:boolean, motivo:string}}
 */
function correrPartidaExperta(seed, limitePasos = 60 * 600) {
  const pista = new TrackManager(seed);
  let x = 0;
  let y = 0;
  let vy = 0;
  let z = 0;
  let enElAire = false;

  for (let paso = 0; paso < limitePasos; paso++) {
    z += Math.min(0.5, 0.2 + z / 5000);
    const filaActual = (z + cameraInFront) | 0;

    // ---- Decide el carril: busca el que siga siendo sólido más adelante ----
    let mejorCarril = carrilDe(x);
    let mejorMargen = -1;
    for (let c = 0; c < CARRILES; c++) {
      let margen = 0;
      while (margen < 8 && pista.getRow(filaActual + margen)?.[c]) margen++;
      if (margen > mejorMargen) {
        mejorMargen = margen;
        mejorCarril = c;
      }
    }
    // Se mueve hacia el carril elegido (el motor mueve 0.11 por paso)
    const objetivoX = mejorCarril - CARRILES / 2 + 0.5;
    if (Math.abs(objetivoX - x) > 0.11) x += Math.sign(objetivoX - x) * 0.11;
    else x = objetivoX;
    x = Math.max(-LIMITE_X, Math.min(LIMITE_X, x));

    const col = carrilDe(x);
    const sobrePista = pista.getRow(filaActual)?.[col];

    // ---- Salta en el último momento seguro ----
    if (!enElAire && sobrePista) {
      // ¿Cuántas filas sólidas quedan por delante en este carril?
      let solidas = 0;
      while (solidas < 6 && pista.getRow(filaActual + solidas + 1)?.[col]) solidas++;
      // Si el hueco empieza justo después, salta ahora.
      if (solidas === 0) {
        y = 0.06;
        vy = IMPULSO_SALTO;
        enElAire = true;
      }
    }

    if (!enElAire && y <= 0.05 && y >= -0.35 && sobrePista) {
      y = 0;
      vy = 0;
    } else {
      y += (vy -= GRAVEDAD);
      if (y <= 0 && sobrePista && vy < 0) {
        // Aterriza si vuelve a haber pista bajo los pies
        y = 0;
        vy = 0;
        enElAire = false;
      }
    }

    if (y <= -4) {
      return { z, pasos: paso, cayo: true, motivo: 'cayó al abismo' };
    }
  }

  return { z, pasos: limitePasos, cayo: false, motivo: 'sobrevivió los 10 min simulados' };
}

console.log('\n═══ LÓGICA DE CARRERA · SKY RUNNER 3D ═══\n');

// ── 1. ¿Un jugador perfecto termina alguna vez? ─────────────────────────────
console.log('  Un jugador que NUNCA falla un salto:');
const SEEDS = [4926714, 123456, 9999999, 777777, 31337];
for (const seed of SEEDS) {
  const r = correrPartidaExperta(seed);
  const segundos = (r.pasos * FIXED_STEP).toFixed(1);
  console.log(
    `    semilla ${String(seed).padStart(8)} · distancia ${String(Math.floor(r.z)).padStart(4)} · ${segundos.padStart(6)} s · ${r.motivo}`
  );
}

// ── 2. Dos jugadores idénticos: ¿alguien gana? ──────────────────────────────
console.log('\n  Dos jugadores con la MISMA semilla y la misma habilidad:');
const seed = 4926714;
const a = correrPartidaExperta(seed);
const b = correrPartidaExperta(seed);
console.log(`    jugador A -> distancia ${Math.floor(a.z)} · ${a.motivo}`);
console.log(`    jugador B -> distancia ${Math.floor(b.z)} · ${b.motivo}`);
console.log(`    diferencia: ${Math.abs(Math.floor(a.z) - Math.floor(b.z))} m`);

// ── 3. ¿El rival fantasma es visible? ───────────────────────────────────────
console.log('\n  Visibilidad del rival fantasma (regla del renderer: 0.4 < dz < 44):');
const dz = (rivalZ, playerZ) => (rivalZ - playerZ) + cameraInFront;
const casos = [
  ['rival 20 m DETRÁS', 41, 61],
  ['rival 20 m DELANTE', 61, 41],
  ['empate exacto', 50, 50],
  ['rival 2 m detrás', 48, 50],
  ['rival 60 m delante', 110, 50],
];
for (const [etiqueta, rz, pz] of casos) {
  const d = dz(rz, pz);
  const visible = d > 0.4 && d < 44;
  console.log(`    ${etiqueta.padEnd(20)} dz=${String(d.toFixed(1)).padStart(7)}  ${visible ? '✅ visible' : '❌ NO SE DIBUJA'}`);
}

console.log('');
