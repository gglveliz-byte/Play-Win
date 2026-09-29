// ==================================================================
// PLAY WIN: SKY RUNNER 3D — MAIN GAME CONTROLLER
// Bucle físico determinista 60Hz, Ghost Rival e integración PlayWin SDK (< 260 líneas)
// ==================================================================

import { audioSys } from './audio.js';
import { TrackManager } from './prng.js';
import {
  initStars,
  drawSkyAndStars,
  drawTrack,
  drawPlayerBall,
  drawRivalGhost,
  cameraInFront,
} from './renderer.js';
import { pasoDeFisica } from './physics.js';

// ==================================================================
// GEOMETRÍA DE LA PISTA (una sola fuente de verdad)
// ------------------------------------------------------------------
// El renderer dibuja 7 carriles con `project(i - 3.5, ...)`, así que el carril
// `i` ocupa la banda [i-3.5, i-2.5] y la pista completa abarca [-3.5, 3.5].
//
// Antes, el motor limitaba el movimiento a [-4.2, 4.2] (más ancho que la pista)
// y calculaba el carril con `Math.round(x + 3)`, que devuelve valores de -1 a 7.
// Los carriles válidos son 0..6, así que en los extremos la consulta
// `row[columna]` daba `undefined`, el jugador se consideraba fuera de la pista y
// CAÍA Y MORÍA sin haber hecho nada malo. Le pasaba en 2 de cada 9 posiciones.
// ==================================================================
const CARRILES = 7;

/** Centro del carril ocupado por la posición `x`, siempre dentro de 0..6. */
function carrilDe(x) {
  const col = Math.floor(x + CARRILES / 2);
  return Math.min(CARRILES - 1, Math.max(0, col));
}

/** Límite de movimiento: mantiene al jugador sobre la pista, nunca al borde. */
const LIMITE_X = CARRILES / 2 - 0.1;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false });

let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;
let isPortrait = canvasHeight > canvasWidth;

function handleResize() {
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  isPortrait = canvasHeight > canvasWidth;
}
handleResize();
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 150));

const Clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const Lerp = (p, a, b) => a + Clamp(p, 0, 1) * (b - a);

// Semilla de la partida en curso: la fija el servidor en `onMatchReady` y se
// conserva para poder reiniciar el escenario al terminar el duelo.
let semillaActual = 123456;
// Tiempo de supervivencia: es lo que se puntúa (no la distancia, que es igual para los dos).
let pasosVivo = 0;
let puntuacion = 0;

const STATE_IDLE = 'IDLE';
const STATE_READY = 'READY';
const STATE_PLAYING = 'PLAYING';
const STATE_CRASHED = 'CRASHED';
let gameState = STATE_IDLE;

let x = 0, y = 0, z = 0, vy = 0;
let steerInput = 0;
let jumpHeld = false;
let jumpBufferTimer = 0;
let touchDriving = false;
let touchSteer = 0;
let keyLeft = false;
let keyRight = false;
// Desplazamiento suave del encuadre antes de la partida: da vida a la vista
// previa sin simular que el jugador avanza por el circuito.
let vistaPrevia = 0;

const stars = initStars(70);
const trackManager = new TrackManager(123456);

const rival = {
  connected: false,
  username: 'Rival',
  x: 0,
  z: 0,
  isAlive: true,
};

function resetGame(seed = 123456) {
  semillaActual = seed;
  x = 0;
  y = 0;
  z = 0;
  vy = 0;
  steerInput = 0;
  jumpHeld = false;
  jumpBufferTimer = 0;
  trackManager.reset(seed);
  rival.x = 0;
  rival.z = 0;
  rival.isAlive = true;
}

function startGame() {
  pasosVivo = 0;
  puntuacion = 0;
  audioSys.resume();
  audioSys.playStart();
  gameState = STATE_PLAYING;
}

function triggerJump() {
  audioSys.resume();
  jumpHeld = true;
  jumpBufferTimer = 12;

  const currentRowIdx = (z + cameraInFront) | 0;
  const currentColIdx = carrilDe(x);
  const row = trackManager.getRow(currentRowIdx);
  const isOverTrack = row && row[currentColIdx];

  if (y >= -0.35 && y <= 0.25 && isOverTrack) {
    y = 0.06;
    vy = 0.12;
    jumpBufferTimer = 0;
    audioSys.playJump();
  }
}

function releaseJump() {
  jumpHeld = false;
}

function setupControls() {
  window.addEventListener('keydown', (e) => {
    audioSys.resume();
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keyLeft = true;
    if (k === 'arrowright' || k === 'd') keyRight = true;
    if (k === ' ' || k === 'arrowup' || k === 'w') {
      e.preventDefault();
      triggerJump();
    }
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keyLeft = false;
    if (k === 'arrowright' || k === 'd') keyRight = false;
    if (k === ' ' || k === 'arrowup' || k === 'w') releaseJump();
  });

  const bind = (btn, onDown, onUp) => {
    if (!btn) return;
    const press = (e) => { if (e?.cancelable) e.preventDefault(); onDown(); };
    const rel = (e) => { if (e?.cancelable) e.preventDefault(); onUp(); };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', rel, { passive: false });
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', rel);
  };

  bind(document.getElementById('btn-touch-left'), () => { keyLeft = true; }, () => { keyLeft = false; });
  bind(document.getElementById('btn-touch-right'), () => { keyRight = true; }, () => { keyRight = false; });
  bind(document.getElementById('btn-touch-jump'), triggerJump, releaseJump);

  window.addEventListener('touchstart', (e) => {
    if (e.target?.closest('button')) return;
    audioSys.resume();
    touchDriving = true;
    if (e.touches.length >= 2) triggerJump();
    const t = e.touches[0];
    touchSteer = Clamp(((t.clientX / canvasWidth) * 2 - 1) * 1.5, -1, 1);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (e.target?.closest('button')) return;
    if (e.cancelable) e.preventDefault();
    if (e.touches.length >= 2) triggerJump();
    const t = e.touches[0];
    touchSteer = Clamp(((t.clientX / canvasWidth) * 2 - 1) * 1.5, -1, 1);
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) releaseJump();
    if (e.touches.length === 0) { touchDriving = false; touchSteer = 0; }
  });
}

/**
 * Avanza la simulación un paso.
 *
 * El cálculo vive en `physics.js`: aquí sólo se le pasa el estado y se recogen
 * los cambios. Mantener las variables de módulo evita reescribir todo el archivo
 * y el coste es copiar unos números 60 veces por segundo: despreciable.
 */
function updatePhysics() {
  const estado = {
    gameState, x, y, z, vy, steerInput, jumpHeld, jumpBufferTimer,
    touchDriving, touchSteer, keyLeft, keyRight, vistaPrevia, pasosVivo, puntuacion,
    Clamp, Lerp,
  };

  pasoDeFisica(estado, {
    limiteX: LIMITE_X,
    carrilDe,
    trackManager,
    audio: audioSys,
    alCaer: () => window.PlayWin?.notifyCrash(),
  });

  // Devuelve los valores al módulo.
  ({ x, y, z, vy, steerInput, jumpHeld, jumpBufferTimer, touchDriving,
     touchSteer, keyLeft, keyRight, vistaPrevia, pasosVivo, puntuacion, gameState } = estado);
}
}

/**
 * Deja el escenario listo para la siguiente partida.
 *
 * Se llama al terminar el duelo. Antes `onMatchEnd` sólo volvía a IDLE, y el
 * rival fantasma seguía "conectado" dibujándose con datos ya muertos.
 */
function endMatch() {
  gameState = STATE_IDLE;
  rival.connected = false;
  rival.isAlive = true;
  rival.x = 0;
  rival.z = 0;
  resetGame(semillaActual);
}

let frameTimeLastMS = 0;
let frameTimeBufferMS = 0;
const FIXED_STEP = 1000 / 60;

function gameLoop(timeMS = 0) {
  requestAnimationFrame(gameLoop);
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    handleResize();
  }
  if (!frameTimeLastMS) frameTimeLastMS = timeMS;
  let delta = timeMS - frameTimeLastMS;
  frameTimeLastMS = timeMS;
  if (delta > 100) delta = 100;
  frameTimeBufferMS += delta;

  while (frameTimeBufferMS >= FIXED_STEP) {
    updatePhysics();
    frameTimeBufferMS -= FIXED_STEP;
  }

  const opp = window.PlayWin?.getOpponentState();
  // El rival sólo existe DURANTE la partida. Antes, `rival.connected` seguía en
  // true después de terminar un duelo y el fantasma se dibujaba con datos ya
  // muertos, lo que contribuía a que la pantalla pareciera congelada.
  const enPartida = gameState === STATE_PLAYING || gameState === STATE_CRASHED;
  if (opp && rival.connected && enPartida) {
    rival.x = Lerp(0.22, rival.x, opp.x || 0);
    rival.z = Lerp(0.28, rival.z, opp.y || 0);
    rival.isAlive = opp.isAlive ?? true;
  }

  // La cámara se queda donde está hasta que arranca la partida; `vistaPrevia`
  // sólo añade un balanceo suave para que la vista previa no parezca muerta.
  const camaraX = x + vistaPrevia;

  drawSkyAndStars(ctx, stars, canvasWidth, canvasHeight, z);
  drawTrack(ctx, trackManager, camaraX, z, canvasWidth, canvasHeight, isPortrait);
  if (enPartida) drawRivalGhost(ctx, rival, camaraX, z, canvasWidth, canvasHeight, isPortrait);

  const currentRowIdx = (z + cameraInFront) | 0;
  const currentColIdx = carrilDe(x);
  const row = trackManager.getRow(currentRowIdx);
  const isOverTrack = row && row[currentColIdx];
  drawPlayerBall(ctx, x, y, z, canvasWidth, canvasHeight, isPortrait, isOverTrack);
}

window.addEventListener('DOMContentLoaded', () => {
  setupControls();

  canvas.tabIndex = 1000;
  canvas.style.outline = 'none';
  const ensureFocus = () => { window.focus(); canvas.focus(); };
  window.addEventListener('click', ensureFocus);
  canvas.addEventListener('click', ensureFocus);

  if (window.PlayWin) {
    window.PlayWin.init({
      gameId: 'sky',
      callbacks: {
        onMatchReady: (data) => {
          const seed = data?.seed || 123456;
          rival.connected = true;
          rival.username = data?.opponent?.username || 'Rival';
          rival.x = 0;
          rival.z = 0;
          resetGame(seed);
          gameState = STATE_READY;
        },
        onMatchLive: () => {
          startGame();
          ensureFocus();
        },
        onMatchEnd: () => {
          endMatch();
        },
      },
    });
  }

  setInterval(() => {
    if (gameState === STATE_PLAYING && window.PlayWin?.isLive()) {
      window.PlayWin.sendTick({
        x,
        y: z,
        score: puntuacion,
        isAlive: true,
      });
    }
  }, 50);

  requestAnimationFrame(gameLoop);
});
