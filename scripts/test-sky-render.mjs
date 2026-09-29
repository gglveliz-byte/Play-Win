/**
 * Ejecuta la CADENA DE RENDER de Sky Runner 3D con un canvas falso y comprueba
 * que se pinta algo. Un canvas en negro significa que alguna función lanza una
 * excepción o que no se dibuja nada, y en el navegador eso se ve como "murió".
 *
 * Uso: node scripts/test-sky-render.mjs
 */
import {
  initStars,
  drawSkyAndStars,
  drawTrack,
  drawPlayerBall,
  drawRivalGhost,
  cameraInFront,
} from '../apps/hub/public/games/sky/js/renderer.js';
import { TrackManager } from '../apps/hub/public/games/sky/js/prng.js';

const ANCHO = 1280;
const ALTO = 720;

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

/**
 * Canvas falso que REGISTRA todo lo que se dibuja. Así se puede afirmar si el
 * resultado sería una imagen o un rectángulo vacío.
 */
function crearCanvasFalso() {
  const registro = { rects: 0, paths: 0, gradientes: 0, textos: 0, colores: new Set() };
  const ctx = {
    canvas: { width: ANCHO, height: ALTO },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalAlpha: 1,
    save() {}, restore() {}, translate() {}, scale() {},
    beginPath() { registro.paths++; },
    closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    rect() { registro.rects++; },
    fill() {}, stroke() {},
    fillRect() { registro.rects++; },
    strokeRect() {},
    fillText() { registro.textos++; },
    measureText: () => ({ width: 40 }),
    createLinearGradient: () => {
      registro.gradientes++;
      return { addColorStop() {} };
    },
    createRadialGradient: () => {
      registro.gradientes++;
      return { addColorStop() {} };
    },
    set fillStyle$(v) { registro.colores.add(v); },
  };
  return { ctx, registro };
}

console.log('\n═══ CADENA DE RENDER · SKY RUNNER 3D ═══\n');

const stars = initStars(70);
const pista = new TrackManager(4926714);
const rival = { connected: true, username: 'rival', x: 0, z: 0, isAlive: true };

// ── 1. Estado ANTES de la partida (IDLE): el caso de la imagen negra ────────
console.log('  Antes de la partida (IDLE) — el caso reportado:');
{
  const { ctx, registro } = crearCanvasFalso();
  const x = 0, y = 0, z = 0;
  const vistaPrevia = 0.6;
  const camaraX = x + vistaPrevia;

  let error = null;
  try {
    drawSkyAndStars(ctx, stars, ANCHO, ALTO, z);
    drawTrack(ctx, pista, camaraX, z, ANCHO, ALTO, false);
    const row = pista.getRow((z + cameraInFront) | 0);
    const sobrePista = row && row[3];
    drawPlayerBall(ctx, x, y, z, ANCHO, ALTO, false, sobrePista);
  } catch (e) {
    error = e;
  }

  comprobar('el render no lanza excepciones', error === null, error ? error.message : '');
  comprobar('se dibuja el cielo', registro.gradientes > 0, `${registro.gradientes} gradientes`);
  comprobar('se dibuja la pista', registro.rects > 0, `${registro.rects} rectángulos/carreteras`);
  console.log(`      detalle: ${registro.rects} rects · ${registro.paths} trazos · ${registro.gradientes} gradientes · ${registro.textos} textos`);
}

// ── 2. Estado DURANTE la partida ────────────────────────────────────────────
console.log('\n  Durante la partida (PLAYING):');
{
  const { ctx, registro } = crearCanvasFalso();
  const x = 0, y = 0, z = 40;
  let error = null;
  try {
    drawSkyAndStars(ctx, stars, ANCHO, ALTO, z);
    drawTrack(ctx, pista, x, z, ANCHO, ALTO, false);
    const row = pista.getRow((z + cameraInFront) | 0);
    const sobrePista = row && row[3];
    drawPlayerBall(ctx, x, y, z, ANCHO, ALTO, false, sobrePista);
    drawRivalGhost(ctx, rival, x, z, ANCHO, ALTO, false);
  } catch (e) {
    error = e;
  }
  comprobar('el render no lanza excepciones', error === null, error ? error.message : '');
  comprobar('se dibuja la pista', registro.rects > 0, `${registro.rects} rectángulos`);
  console.log(`      detalle: ${registro.rects} rects · ${registro.paths} trazos · ${registro.gradientes} gradientes`);
}

// ── 3. ¿La pista se genera para la fila que se dibuja? ─────────────────────
console.log('\n  La pista llega hasta donde se dibuja:');
for (const z of [0, 40, 300, 3000]) {
  const fila = (z + cameraInFront) | 0;
  const surafar = pista.getRow(fila + 40);
  comprobar(`  con z=${String(z).padStart(4)}, hay pista en la fila ${fila + 40}`, Array.isArray(surafar), surafar ? `${surafar.filter(Boolean).length}/7 carriles` : 'undefined');
}

console.log(`\n${fallos === 0 ? '🎉 EL RENDER PINTA CORRECTAMENTE' : `❌ ${fallos} comprobación(es) fallaron`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
