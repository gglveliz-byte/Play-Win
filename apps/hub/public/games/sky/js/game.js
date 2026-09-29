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
  audioSys.resume();
  audioSys.playStart();
  gameState = STATE_PLAYING;
}

function triggerJump() {
  audioSys.resume();
  jumpHeld = true;
  jumpBufferTimer = 12;

  const currentRowIdx = (z + cameraInFront) | 0;
  const currentColIdx = Math.round(x + 3);
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
    if (keyLeft) steerInput = Lerp(0.28, steerInput, -1);
    else if (keyRight) steerInput = Lerp(0.28, steerInput, 1);
    else if (touchDriving) steerInput = Lerp(0.35, steerInput, touchSteer);
    else steerInput = Lerp(0.32, steerInput, 0);

    x += steerInput * 0.11;
    x = Clamp(x, -4.2, 4.2);

    if (jumpBufferTimer > 0) jumpBufferTimer--;
    y += (vy -= 0.006);
    z += Math.min(0.5, 0.2 + z / 5000);

    const currentRowIdx = (z + cameraInFront) | 0;
    const currentColIdx = Math.round(x + 3);
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
      gameState = STATE_CRASHED;
      audioSys.playGameOver();
      window.PlayWin?.notifyCrash();
    }

    trackManager.cleanup((z - 25) | 0);
  } else if (gameState === STATE_CRASHED) {
    if (y > -15) y += (vy -= 0.006);
  }
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
  const currentColIdx = Math.round(x + 3);
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
          gameState = STATE_IDLE;
        },
      },
    });
  }

  setInterval(() => {
    if (gameState === STATE_PLAYING && window.PlayWin?.isLive()) {
      window.PlayWin.sendTick({
        x,
        y: z,
        score: Math.floor(z),
        isAlive: true,
      });
    }
  }, 50);

  requestAnimationFrame(gameLoop);
});
