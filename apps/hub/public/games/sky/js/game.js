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

function updatePhysics() {
  if (gameState === STATE_IDLE || gameState === STATE_READY) {
    z += 0.12;
    x = Math.sin(Date.now() * 0.002) * 0.25;
    y = 0;
    return;
  }

  if (gameState === STATE_PLAYING) {
    // Sky Runner es un juego de SUPERVIVENCIA: los dos jugadores avanzan al mismo
    // ritmo, así que la puntuación NO puede ser la distancia (sería idéntica para
    // los dos y nadie podría ganar nunca). Lo que se puntúa es el TIEMPO que
    // aguantas sin caer al abismo: quien cae primero pierde.
    //
    // (En carreras la puntuación sí es la distancia: allí el avance depende del
    // jugador. Cada juego mide lo suyo.)
    pasosVivo++;
    puntuacion = Math.floor(pasosVivo / 60);   // el bucle va a 60 pasos por segundo

    if (keyLeft) steerInput = Lerp(0.28, steerInput, -1);
    else if (keyRight) steerInput = Lerp(0.28, steerInput, 1);
    else if (touchDriving) steerInput = Lerp(0.35, steerInput, touchSteer);
    else steerInput = Lerp(0.32, steerInput, 0);

    x += steerInput * 0.11;
    x = Clamp(x, -LIMITE_X, LIMITE_X);

    if (jumpBufferTimer > 0) jumpBufferTimer--;
    y += (vy -= 0.006);
    z += Math.min(0.5, 0.2 + z / 5000);

    const currentRowIdx = (z + cameraInFront) | 0;
    const currentColIdx = carrilDe(x);
    const row = trackManager.getRow(currentRowIdx);
    const isOverTrack = row && row[currentColIdx];

    if (y <= 0.05 && y >= -0.35 && isOverTrack) {
      if (jumpBufferTimer > 0 || jumpHeld) {
        y = 0.06;
        vy = 0.12;
        jumpBufferTimer = 0;
        audioSys.playJump();
      } else {
        y = 0;
        vy = 0;
      }
    }

    if (y <= -4) {
      // `notifyCrash()` sólo avisa si la partida sigue viva. Si el rival se
      // estrelló primero, el servidor ya cerró el duelo y este aviso se descarta
      // (correcto: no se puede perder dos veces). El servidor resuelve igual por
      // 'OPPONENT_CRASH', así que el jugador recibe su resultado.
      gameState = STATE_CRASHED;
      audioSys.playGameOver();
      window.PlayWin?.notifyCrash();
    }

    trackManager.cleanup((z - 25) | 0);
  } else if (gameState === STATE_CRASHED) {
    if (y > -15) y += (vy -= 0.006);
  }
}

/**
 * Deja el escenario listo para la siguiente partida.
 *
 * Se llama al terminar el duelo. ANTES, `onMatchEnd` sólo ponía `STATE_IDLE`, y
 * ese estado sigue avanzando la pista indefinidamente (`z += 0.12`), así que tras
 * morir el jugador veía el escenario desplazarse para siempre sin ningún final:
 * parecía que el juego se había quedado colgado. Además el rival fantasma seguía
 * conectado y se dibujaba con datos ya muertos.
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
  if (opp && rival.connected) {
    rival.x = Lerp(0.22, rival.x, opp.x || 0);
    rival.z = Lerp(0.28, rival.z, opp.y || 0);
    rival.isAlive = opp.isAlive ?? true;
  }

  drawSkyAndStars(ctx, stars, canvasWidth, canvasHeight, z);
  drawTrack(ctx, trackManager, x, z, canvasWidth, canvasHeight, isPortrait);
  drawRivalGhost(ctx, rival, x, z, canvasWidth, canvasHeight, isPortrait);

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
