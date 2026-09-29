// ==================================================================
// PLAY WIN: SPEED HORIZON 3D
// Arcade Retro Highway Racer - Ultra-Responsive Mobile & PC
// ==================================================================

(function () {
'use strict';

const c = document.getElementById('c');
const context = c.getContext('2d');

// Game States
const STATE_TITLE = 0;
const STATE_PLAYING = 1;
const STATE_GAMEOVER = 2;
let gameState = STATE_TITLE;
let frames = 0;
let currentSeed = null;

// Control de tasa de refresco y ticks en tiempo real (Protección 120Hz/144Hz y 20Hz WebSocket)
let lastFrameTime = performance.now();
let lastTickSent = 0;
const TARGET_FRAME_MS = 1000 / 60; // 16.666ms (60 FPS estricto)

// Draw settings (Calibrated for silky 60 FPS)
const drawDistance = 260;          // View distance
const cameraDepth = 1;             // FOV of camera
const segmentLength = 100;         // Length of each road segment
const roadWidth = 500;             // Road width
const curbWidth = 150;             // Warning track width
const dashLineWidth = 10;          // Dashed line width
const maxPlayerX = 2e3;            // Limit player offset
const mountainCount = 24;          // Mountains count
const timeDelta = 1 / 60;          // Fixed time step
const PI = Math.PI;

// Player & Speed Settings
const height = 150;                // Camera height above ground
const baseCruisingSpeed = 220;     // Normal cruising top speed (KM/H ~200)
const maxNitroSpeed = 390;         // Turbo Boost top speed (KM/H ~380)
const playerAccel = 1.15;          // Standard forward acceleration
const nitroAccel = 3.2;            // Turbo boost acceleration (explosive)
const playerBrake = -4.8;          // Strong active brake
const coastDecel = 0.965;          // Friction slowdown when not pressing gas
const turnControl = 0.26;          // Player turning responsiveness
const springConstant = 0.01;       // Pitch spring
const collisionSlow = 0.40;        // Slow down factor from obstacle impact
const pitchLerp = 0.1;             // Rate camera pitch changes
const pitchSpringDamp = 0.9;       // Dampen pitch spring
const elasticity = 1.2;            // Bounce elasticity
const centrifugal = 0.002;         // Turn centrifugal force
const forwardDamp = 0.999;         // Forward speed damping
const lateralDamp = 0.7;           // Lateral damping
const offRoadDamp = 0.97;          // Grass damping
const gravity = -1;                // Gravity
const cameraTurnScale = 2;         // Camera turn rotation
const worldRotateScale = 0.00005;  // World rotate scale

// Level settings
const maxTime = 20;                // Starting time (seconds)
const checkPointTime = 10;         // Time bonus per checkpoint
const checkPointDistance = 1e5;    // Distance between checkpoints
const maxDifficultySegment = 9e3;  // Distance until max difficulty
const roadEnd = 1e4;               // Distance until road end

// Audio System (Web Audio API Synthesizer)
class AudioSystem {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.lastNitroTime = 0;
    }

    init() {
        if (this.ctx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.ctx = new AudioContext();
        } catch (e) {}
    }

    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playNitro() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = Date.now();
        if (now - this.lastNitroTime < 320) return;
        this.lastNitroTime = now;

        try {
            const curTime = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, curTime);
            osc.frequency.exponentialRampToValueAtTime(450, curTime + 0.3);
            gain.gain.setValueAtTime(0.2, curTime);
            gain.gain.exponentialRampToValueAtTime(0.01, curTime + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(curTime);
            osc.stop(curTime + 0.3);
        } catch (e) {}
    }

    playCrash() {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            const curTime = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(110, curTime);
            osc.frequency.exponentialRampToValueAtTime(25, curTime + 0.3);
            gain.gain.setValueAtTime(0.35, curTime);
            gain.gain.exponentialRampToValueAtTime(0.01, curTime + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(curTime);
            osc.stop(curTime + 0.3);
        } catch (e) {}
    }

    playCheckpoint() {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            const now = this.ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                gain.gain.setValueAtTime(0.2, now + idx * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.01, now + (idx + 1) * 0.08);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.08);
                osc.stop(now + (idx + 1) * 0.08);
            });
        } catch (e) {}
    }

    playGameOver() {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            const now = this.ctx.currentTime;
            [392, 349.23, 329.63, 261.63].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + idx * 0.18);
                gain.gain.setValueAtTime(0.22, now + idx * 0.18);
                gain.gain.exponentialRampToValueAtTime(0.01, now + (idx + 1) * 0.18);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.18);
                osc.stop(now + (idx + 1) * 0.18);
            });
        } catch (e) {}
    }
}

const audioSys = new AudioSystem();

// Controls State
let keyLeft = false;
let keyRight = false;
let keyBrake = false;
let keyNitro = false;
let steerInput = 0;       // Steering: -1 (left) to 1 (right)
let touchDriving = false;  // True when user is touching the screen to drive
let cornerNitroHeld = false;

// Keyboard Controls (PC)
window.addEventListener('keydown', e => {
    audioSys.resume();
    const k = e.key ? e.key.toLowerCase() : "";
    if (k === 'arrowleft' || k === 'a') { keyLeft = true; e.preventDefault(); }
    if (k === 'arrowright' || k === 'd') { keyRight = true; e.preventDefault(); }
    if (k === 'arrowdown' || k === 's') { keyBrake = true; e.preventDefault(); }
    if (k === ' ' || k === 'arrowup' || k === 'w') {
        keyNitro = true;
        audioSys.playNitro();
        e.preventDefault();
    }
    if (k === 'enter') {
        // BUG-025: la partida NO se arranca localmente. Si el SDK está presente,
        // el único que decide cuándo empezar es el servidor (onMatchLive). Antes
        // esto iniciaba una carrera propia: el reloj corría y el HUD se pintaba,
        // pero no había partida en el servidor y el coche no se movía.
        if (window.PlayWin && !window.PlayWin.canStartLocally()) return;
        if (gameState === STATE_TITLE || gameState === STATE_GAMEOVER) {
            startRace();
        }
    }
});

window.addEventListener('keyup', e => {
    const k = e.key ? e.key.toLowerCase() : "";
    if (k === 'arrowleft' || k === 'a') keyLeft = false;
    if (k === 'arrowright' || k === 'd') keyRight = false;
    if (k === 'arrowdown' || k === 's') keyBrake = false;
    if (k === ' ' || k === 'arrowup' || k === 'w') keyNitro = false;
});

// Direct Touch Screen Driving & Multitouch Turbo (Mobile)
window.addEventListener('touchstart', e => {
    if (gameState !== STATE_PLAYING) return;
    const target = e.target;
    if (target && (target.tagName.toLowerCase() === 'button' || target.closest('button'))) return;

    audioSys.resume();
    touchDriving = true;

    // Multitouch: 2 fingers on screen = instant TURBO!
    if (e.touches.length >= 2) {
        keyNitro = true;
        audioSys.playNitro();
    }

    const t = e.touches[0];
    const normX = (t.clientX / window.innerWidth) * 2 - 1;
    steerInput = Clamp(normX * 1.4, -1, 1);
}, { passive: false });

window.addEventListener('touchmove', e => {
    if (gameState !== STATE_PLAYING) return;
    const target = e.target;
    if (target && (target.tagName.toLowerCase() === 'button' || target.closest('button'))) return;
    if (e.cancelable) e.preventDefault();

    if (e.touches.length >= 2) {
        keyNitro = true;
    }

    const t = e.touches[0];
    const normX = (t.clientX / window.innerWidth) * 2 - 1;
    steerInput = Clamp(normX * 1.4, -1, 1);
}, { passive: false });

window.addEventListener('touchend', e => {
    if (e.touches.length < 2 && !cornerNitroHeld) {
        keyNitro = false;
    }
    if (e.touches.length === 0) {
        touchDriving = false;
    } else {
        const t = e.touches[0];
        const normX = (t.clientX / window.innerWidth) * 2 - 1;
        steerInput = Clamp(normX * 1.4, -1, 1);
    }
}, { passive: false });

window.addEventListener('touchcancel', () => {
    touchDriving = false;
    if (!cornerNitroHeld) keyNitro = false;
});

// Math and helper functions
const Clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const ClampAngle = (a) => (a + PI) % (2 * PI) + (a + PI < 0 ? PI : -PI);
const Lerp = (p, a, b) => a + Clamp(p, 0, 1) * (b - a);
let randSeed = 0;
let startRandSeed = 0;
const R = (a = 1, b = 0) => Lerp((Math.sin(++randSeed) + 1) * 1e5 % 1, a, b);
let hueShift = 0;
const LSHA = (l, s = 0, h = 0, a = 1) => `hsl(${h + hueShift},${s}%,${l}%,${a})`;

class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    Add = (v) => (
        v = v < 1e5 ? new Vec3(v, v, v) : v,
        new Vec3(this.x + v.x, this.y + v.y, this.z + v.z));
    Multiply = (v) => (
        v = v < 1e5 ? new Vec3(v, v, v) : v,
        new Vec3(this.x * v.x, this.y * v.y, this.z * v.z));
}

// Draw a trapezoid-shaped polygon
const DrawPoly = (x1, y1, w1, x2, y2, w2, fillStyle) => {
    context.beginPath();
    context.fillStyle = fillStyle;
    context.lineTo(x1 - w1, y1 | 0);
    context.lineTo(x1 + w1, y1 | 0);
    context.lineTo(x2 + w2, y2 | 0);
    context.lineTo(x2 - w2, y2 | 0);
    context.fill();
};

// Procedural Road Generation
let road = [];
let roadGenLengthMax = 0;
let roadGenLength = 0;
let roadGenTaper = 0;
let roadGenFreqX = 0;
let roadGenFreqY = 0;
let roadGenScaleX = 0;
let roadGenScaleY = 0;
let roadGenWidth = roadWidth;

function generateRoad() {
    startRandSeed = randSeed = (currentSeed !== null && currentSeed !== undefined ? currentSeed : Date.now());
    road = [];
    roadGenLengthMax = roadGenLength = roadGenTaper = roadGenFreqX = roadGenFreqY = roadGenScaleX = roadGenScaleY = 0;
    roadGenWidth = roadWidth;

    for (let i = 0; i < roadEnd * 2; ++i) {
        if (roadGenLength++ > roadGenLengthMax) {
            const d = Math.min(1, i / maxDifficultySegment);
            roadGenWidth = roadWidth * R(1 - d * 0.7, 3 - 2 * d);
            roadGenFreqX = R(Lerp(d, 0.01, 0.02));
            roadGenFreqY = R(Lerp(d, 0.01, 0.03));
            roadGenScaleX = i > roadEnd ? 0 : R(Lerp(d, 0.2, 0.6));
            roadGenScaleY = R(Lerp(d, 1e3, 2e3));
            roadGenTaper = R(99, 1e3) | 0;
            roadGenLengthMax = roadGenTaper + R(99, 1e3);
            roadGenLength = 0;
            i -= roadGenTaper;
        }

        const rx = Math.sin(i * roadGenFreqX) * roadGenScaleX;
        const ry = Math.sin(i * roadGenFreqY) * roadGenScaleY;
        road[i] = road[i] ? road[i] : { x: rx, y: ry, w: roadGenWidth };

        const p = Clamp(roadGenLength / roadGenTaper, 0, 1);
        road[i].x = Lerp(p, road[i].x, rx);
        road[i].y = Lerp(p, road[i].y, ry);
        road[i].w = i > roadEnd ? 0 : Lerp(p, road[i].w, roadGenWidth);
        road[i].a = road[i - 1] ? Math.atan2(road[i - 1].y - road[i].y, segmentLength) : 0;
    }
}

// Game State Variables
let velocity = new Vec3();
let position = new Vec3();
let pitchSpring = 0;
let pitchSpringSpeed = 0;
let pitchRoad = 0;
let nextCheckPoint = checkPointDistance;
let time = maxTime;
let raceStartTime = 0;
let bonusTime = 0;
let bgTicker = null;
let heading = 0;
let checkpointsCount = 0;
let gameOverTriggered = false;
let gameOverCooldownTimer = 0;
let bestDistance = parseInt(localStorage.getItem('playwin_carreras_best')) || 0;

function resetGame() {
    generateRoad();
    velocity = new Vec3(0, 0, 0);
    pitchSpring = pitchSpringSpeed = pitchRoad = hueShift = 0;
    position = new Vec3(0, height);
    nextCheckPoint = checkPointDistance;
    time = maxTime;
    bonusTime = 0;
    raceStartTime = 0;
    if (bgTicker) { clearInterval(bgTicker); bgTicker = null; }
    heading = randSeed;
    checkpointsCount = 0;
    gameOverTriggered = false;
    gameOverCooldownTimer = 0;
    keyLeft = keyRight = keyBrake = keyNitro = false;
    touchDriving = false;
    cornerNitroHeld = false;
    steerInput = 0;
    updateHUD();
}

// UI State Management
function showScreen(screenId) {
    document.querySelectorAll('.ui-screen').forEach(el => el.classList.remove('active'));
    const touchControls = document.getElementById('touch-controls');
    const cornerNitro = document.getElementById('btn-touch-nitro');

    if (screenId) {
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');
        if (touchControls) touchControls.style.display = 'none';
        if (cornerNitro) cornerNitro.style.display = 'none';
    } else {
        if (touchControls) touchControls.style.display = '';
        if (cornerNitro) cornerNitro.style.display = '';
    }
}

function startRace() {
    audioSys.resume();
    resetGame();
    gameState = STATE_PLAYING;
    raceStartTime = performance.now();
    bonusTime = 0;
    time = maxTime;
    showScreen(null);

    // Reloj desacoplado en segundo plano (inmune a desenfoque, cambio de pestaña o minimizado)
    if (bgTicker) clearInterval(bgTicker);
    bgTicker = setInterval(() => {
        if (gameState !== STATE_PLAYING || raceStartTime <= 0) return;
        const elapsedSec = (performance.now() - raceStartTime) / 1000;
        time = Math.max(0, maxTime + bonusTime - elapsedSec);
        updateHUD();

        if (time <= 0 && !gameOverTriggered) {
            gameOverTriggered = true;
            velocity.z = 0;
            endGame();
        }

        const nowMs = performance.now();
        if ((nowMs - lastTickSent >= 48) && window.PlayWin && window.PlayWin.isLive()) {
            lastTickSent = nowMs;
            const distMeters = Math.floor(position.z / 10);
            window.PlayWin.sendTick({
                x: Math.round(position.x),
                y: Math.round(position.z),
                score: distMeters,
                isAlive: time > 0
            });
        }
    }, 50);
}

function endGame() {
    if (gameState === STATE_GAMEOVER) return;
    gameState = STATE_GAMEOVER;
    if (bgTicker) { clearInterval(bgTicker); bgTicker = null; }
    audioSys.playGameOver();

    const distMeters = Math.floor(position.z / 10);
    if (window.PlayWin) {
        window.PlayWin.sendTick({
            x: Math.round(position.x),
            y: Math.round(position.z),
            score: distMeters,
            isAlive: false
        });
        if (typeof window.PlayWin.notifyFinish === 'function') {
            window.PlayWin.notifyFinish(distMeters);
        } else {
            window.PlayWin.notifyCrash();
        }
    }

    if (distMeters > bestDistance) {
        bestDistance = distMeters;
        localStorage.setItem('playwin_carreras_best', bestDistance);
    }

    const goDist = document.getElementById('go-distance');
    if (goDist) goDist.textContent = distMeters + ' M';

    const goCheck = document.getElementById('go-checkpoints');
    if (goCheck) goCheck.textContent = checkpointsCount;

    const goBest = document.getElementById('go-best');
    if (goBest) goBest.textContent = bestDistance + ' M';

    showScreen('screen-gameover');
}

// Update HUD Metrics
function updateHUD() {
    const timeEl = document.getElementById('hud-time');
    if (timeEl) {
        const remaining = Math.max(0, Math.ceil(time));
        timeEl.textContent = remaining;
        if (remaining <= 5) {
            timeEl.style.color = '#ff3b30';
            timeEl.style.textShadow = '0 0 12px rgba(255, 59, 48, 0.9)';
        } else {
            timeEl.style.color = 'var(--neon-orange)';
            timeEl.style.textShadow = '0 0 10px rgba(255, 107, 0, 0.7)';
        }
    }

    const speedEl = document.getElementById('hud-speed');
    if (speedEl) {
        const kmh = Math.floor((velocity.z / maxNitroSpeed) * 380);
        speedEl.innerHTML = `${Math.max(0, kmh)} <small>KM/H</small>`;
    }

    const distEl = document.getElementById('hud-dist');
    if (distEl) {
        const distMeters = Math.floor(position.z / 10);
        distEl.innerHTML = `${distMeters} <small>M</small>`;
    }

    const bestEl = document.getElementById('hud-best');
    if (bestEl) {
        bestEl.innerHTML = `${bestDistance} <small>M</small>`;
    }
}

// Ultra-Fast & Crisp Obstacle Drawing (Zero runtime gradient allocations for 60 FPS)
function drawRealisticObstacle(x, y, pz, objType, alpha) {
    if (pz < 0.003) return; // Cull distant sub-pixel obstacles

    context.save();
    context.globalAlpha = alpha;

    if (objType === 0) {
        // CONO VIAL REFLECTANTE
        const baseW = 75 * pz;
        const topW = 14 * pz;
        const h = 100 * pz;

        // Base de goma pesada negra
        context.fillStyle = '#0f172a';
        context.fillRect(x - baseW * 0.65, y - 8 * pz, baseW * 1.3, 8 * pz);

        // Cuerpo naranja fluorescente
        context.beginPath();
        context.fillStyle = '#ff6b00';
        context.moveTo(x - baseW / 2, y - 8 * pz);
        context.lineTo(x + baseW / 2, y - 8 * pz);
        context.lineTo(x + topW / 2, y - h);
        context.lineTo(x - topW / 2, y - h);
        context.closePath();
        context.fill();

        // 1ª Banda reflectante blanca
        context.beginPath();
        context.fillStyle = '#ffffff';
        const b1Y1 = y - h * 0.35;
        const b1Y2 = y - h * 0.50;
        const b1W1 = Lerp(0.35, baseW, topW) / 2;
        const b1W2 = Lerp(0.50, baseW, topW) / 2;
        context.moveTo(x - b1W1, b1Y1);
        context.lineTo(x + b1W1, b1Y1);
        context.lineTo(x + b1W2, b1Y2);
        context.lineTo(x - b1W2, b1Y2);
        context.closePath();
        context.fill();

        // 2ª Banda reflectante blanca
        context.beginPath();
        const b2Y1 = y - h * 0.65;
        const b2Y2 = y - h * 0.80;
        const b2W1 = Lerp(0.65, baseW, topW) / 2;
        const b2W2 = Lerp(0.80, baseW, topW) / 2;
        context.moveTo(x - b2W1, b2Y1);
        context.lineTo(x + b2W1, b2Y1);
        context.lineTo(x + b2W2, b2Y2);
        context.lineTo(x - b2W2, b2Y2);
        context.closePath();
        context.fill();

    } else if (objType === 1) {
        // BARRERA DE CONSTRUCCIÓN VIAL CON CHEVRONS
        const w = 190 * pz;
        const h = 95 * pz;

        // Postes metálicos de soporte
        context.fillStyle = '#475569';
        context.fillRect(x - w * 0.42, y - h, 12 * pz, h);
        context.fillRect(x + w * 0.42 - 12 * pz, y - h, 12 * pz, h);

        // Panel principal amarillo
        const panelY = y - h * 0.95;
        const panelH = h * 0.65;
        context.fillStyle = '#facc15';
        context.fillRect(x - w / 2, panelY, w, panelH);

        // Franjas de peligro negras (chevrons fijos limpios)
        context.fillStyle = '#0f172a';
        const stripeW = w * 0.16;
        for (let idx = 0; idx < 4; idx++) {
            const sx = x - w * 0.44 + idx * (w * 0.24);
            context.beginPath();
            context.moveTo(sx, panelY);
            context.lineTo(sx + stripeW, panelY);
            context.lineTo(sx + stripeW * 0.5, panelY + panelH);
            context.lineTo(sx - stripeW * 0.5, panelY + panelH);
            context.closePath();
            context.fill();
        }

        // Baliza luminosa ámbar
        const lampX = x;
        const lampY = panelY - 14 * pz;
        context.fillStyle = '#d97706';
        context.fillRect(lampX - 6 * pz, panelY - 6 * pz, 12 * pz, 6 * pz);
        context.beginPath();
        context.fillStyle = (Math.sin(Date.now() * 0.008) > 0) ? '#ffb703' : '#b45309';
        context.arc(lampX, lampY, 9 * pz, 0, PI * 2);
        context.fill();

    } else if (objType === 2) {
        // ÁRBOL LATERAL COSTEÑO
        const trunkW = 32 * pz;
        const trunkH = 110 * pz;
        const crownR = 120 * pz;

        context.fillStyle = '#451a03';
        context.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH);

        const crownY = y - trunkH - crownR * 0.5;
        context.beginPath();
        context.fillStyle = '#14532d';
        context.arc(x, crownY, crownR * 0.8, 0, PI * 2);
        context.fill();

        context.beginPath();
        context.fillStyle = '#16a34a';
        context.arc(x - crownR * 0.15, crownY - crownR * 0.1, crownR * 0.65, 0, PI * 2);
        context.fill();

    } else {
        // ROCA / PEÑASCO LATERAL
        const rw = 110 * pz;
        const rh = 75 * pz;

        context.beginPath();
        context.fillStyle = '#334155';
        context.moveTo(x - rw, y);
        context.lineTo(x - rw * 0.25, y - rh);
        context.lineTo(x + rw * 0.35, y - rh * 0.85);
        context.lineTo(x + rw, y);
        context.closePath();
        context.fill();

        context.beginPath();
        context.fillStyle = '#64748b';
        context.moveTo(x - rw * 0.25, y - rh);
        context.lineTo(x + rw * 0.35, y - rh * 0.85);
        context.lineTo(x + rw * 0.1, y);
        context.lineTo(x - rw * 0.6, y);
        context.closePath();
        context.fill();
    }

    context.restore();
}

// Draw Player Vehicle (Sports Car in 3rd Person)
// NOTICE: NO FIRE AT ALL unless Nitro is ACTIVELY pressed!
function drawPlayerCar(turnAngle, braking, nitroActive) {
    const isPortrait = c.height > c.width;
    const carX = c.width / 2;

    // Elevate car in portrait mobile so it floats cleanly above bottom controls!
    const carBottomMargin = isPortrait ? Math.min(c.height * 0.15, 120) : 32;
    const carY = c.height - carBottomMargin;
    const carW = isPortrait ? Math.min(c.width * 0.29, 150) : Math.min(c.width * 0.22, 195);
    const carH = carW * 0.44;

    context.save();
    context.translate(carX, carY);
    context.rotate(turnAngle * 0.35); // Roll tilt in curves

    // Sombra del auto en el asfalto
    context.beginPath();
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.ellipse(0, 8, carW * 0.55, carH * 0.25, 0, 0, PI * 2);
    context.fill();

    // Ruedas traseras
    context.fillStyle = '#090d16';
    context.fillRect(-carW * 0.49, -carH * 0.35, carW * 0.17, carH * 0.7);
    context.fillRect(carW * 0.32, -carH * 0.35, carW * 0.17, carH * 0.7);

    // Chasis principal deportivo naranja
    context.fillStyle = '#ea580c';
    context.beginPath();
    context.roundRect(-carW * 0.44, -carH * 0.75, carW * 0.88, carH * 0.75, [14, 14, 4, 4]);
    context.fill();

    // Capó superior más claro
    context.fillStyle = '#ff7b00';
    context.fillRect(-carW * 0.4, -carH * 0.72, carW * 0.8, carH * 0.25);

    // Difusor trasero inferior deportivo
    context.fillStyle = '#0f172a';
    context.fillRect(-carW * 0.4, -carH * 0.15, carW * 0.8, carH * 0.2);

    // Salidas dobles de escape cromadas
    context.fillStyle = '#94a3b8';
    context.fillRect(-carW * 0.26, -carH * 0.08, carW * 0.1, carH * 0.12);
    context.fillRect(carW * 0.16, -carH * 0.08, carW * 0.1, carH * 0.12);

    // Cabina / Ventana trasera oscura con reflejos
    context.fillStyle = '#0f172a';
    context.beginPath();
    context.moveTo(-carW * 0.28, -carH * 0.75);
    context.lineTo(-carW * 0.2, -carH * 1.15);
    context.lineTo(carW * 0.2, -carH * 1.15);
    context.lineTo(carW * 0.28, -carH * 0.75);
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 1.5;
    context.stroke();

    // Alerón trasero (Spoiler GT)
    context.fillStyle = '#090d16';
    context.fillRect(-carW * 0.47, -carH * 0.9, carW * 0.94, carH * 0.12);
    context.fillRect(-carW * 0.32, -carH * 0.78, carW * 0.08, carH * 0.12);
    context.fillRect(carW * 0.24, -carH * 0.78, carW * 0.08, carH * 0.12);

    // Luces traseras LED
    context.fillStyle = braking ? '#ff2233' : '#b91c1c';
    context.fillRect(-carW * 0.42, -carH * 0.65, carW * 0.22, carH * 0.16);
    context.fillRect(carW * 0.2, -carH * 0.65, carW * 0.22, carH * 0.16);

    // EFECTO NITRO TURBO: Llamas potentes SOLO cuando Nitro está activado
    if (nitroActive && velocity.z > 25) {
        const flameFlicker = (Math.sin(Date.now() * 0.05) + 1) * 0.5;
        const flameLen = carH * (0.55 + flameFlicker * 0.45);

        // Llama exterior cian
        context.fillStyle = '#00f0ff';
        context.beginPath();
        context.moveTo(-carW * 0.26, carH * 0.04);
        context.lineTo(-carW * 0.16, carH * 0.04);
        context.lineTo(-carW * 0.21, carH * 0.04 + flameLen);
        context.closePath();
        context.fill();

        context.beginPath();
        context.moveTo(carW * 0.16, carH * 0.04);
        context.lineTo(carW * 0.26, carH * 0.04);
        context.lineTo(carW * 0.21, carH * 0.04 + flameLen);
        context.closePath();
        context.fill();

        // Núcleo blanco caliente
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.moveTo(-carW * 0.24, carH * 0.04);
        context.lineTo(-carW * 0.18, carH * 0.04);
        context.lineTo(-carW * 0.21, carH * 0.04 + flameLen * 0.55);
        context.closePath();
        context.fill();

        context.beginPath();
        context.moveTo(carW * 0.18, carH * 0.04);
        context.lineTo(carW * 0.24, carH * 0.04);
        context.lineTo(carW * 0.21, carH * 0.04 + flameLen * 0.55);
        context.closePath();
        context.fill();
    }
    // NOTA: Cuando nitroActive es falso, NO hay fuego. Los escapes se ven limpios y apagados.

    context.restore();
}

// Draw Rival Ghost Car in 1v1 Multiplayer (High-Definition Cyber Sports Car)
function drawRivalGhostCar(turnAngle) {
    if (!window.PlayWin || !window.PlayWin.isLive()) return;
    const opp = window.PlayWin.getOpponentState();
    if (!opp || !opp.isAlive) return;

    const deltaZ = opp.y - position.z;
    // Si el rival está detrás del jugador (más de 80 unidades), el retrovisor o HUD se encarga; no tapar la pantalla
    if (deltaZ < -80 || deltaZ > drawDistance * segmentLength) return;

    const isPortrait = c.height > c.width;
    const playerCarW = isPortrait ? Math.min(c.width * 0.29, 150) : Math.min(c.width * 0.22, 195);
    const carBottomMargin = isPortrait ? Math.min(c.height * 0.15, 120) : 32;
    const playerCarY = c.height - carBottomMargin;

    let rx = 0;
    let ry = 0;
    let rw = 0;

    if (deltaZ > 0) {
        const segIdx = Math.floor(opp.y / segmentLength);
        const seg = road[segIdx];
        if (!seg || !seg.p || seg.p.z <= 0.0001) return;
        const pz = seg.p.z;
        rx = seg.p.x + pz * opp.x;
        ry = seg.p.y;
        // Escala en perspectiva idéntica a la pista y obstáculos (nunca mayor que el auto del jugador)
        rw = playerCarW * Math.min(1.0, Math.max(0.08, pz * 1.35));
    } else {
        // Rival a la par o ligeramente detrás: renderizado al lado del auto del jugador
        const sideBlend = (deltaZ + 80) / 80;
        rx = (c.width / 2) + (opp.x - position.x) * (c.width / 1800);
        ry = playerCarY - (deltaZ * 0.3);
        rw = playerCarW * (0.85 + sideBlend * 0.15);
    }

    const rh = rw * 0.44;

    context.save();
    context.globalAlpha = 0.88; // Holograma eSports nítido y de alta definición
    context.translate(rx, ry);
    context.rotate(turnAngle * 0.35);

    // 1. Sombra aerodinámica en el asfalto
    context.beginPath();
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.ellipse(0, 8 * (rw / playerCarW), rw * 0.55, rh * 0.25, 0, 0, PI * 2);
    context.fill();

    // 2. Neumáticos traseros deportivos
    context.fillStyle = '#090d16';
    context.fillRect(-rw * 0.49, -rh * 0.35, rw * 0.17, rh * 0.7);
    context.fillRect(rw * 0.32, -rh * 0.35, rw * 0.17, rh * 0.7);

    // 3. Chasis principal deportivo en Azul Eléctrico Cyber Neón
    context.fillStyle = '#0284c7';
    context.beginPath();
    context.roundRect(-rw * 0.44, -rh * 0.75, rw * 0.88, rh * 0.75, [14 * (rw / playerCarW), 14 * (rw / playerCarW), 4, 4]);
    context.fill();

    // 4. Capó superior / perfil aerodinámico
    context.fillStyle = '#38bdf8';
    context.fillRect(-rw * 0.4, -rh * 0.72, rw * 0.8, rh * 0.25);

    // 5. Difusor trasero inferior
    context.fillStyle = '#0f172a';
    context.fillRect(-rw * 0.4, -rh * 0.15, rw * 0.8, rh * 0.2);

    // 6. Escapes dobles cromados
    context.fillStyle = '#94a3b8';
    context.fillRect(-rw * 0.26, -rh * 0.08, rw * 0.1, rh * 0.12);
    context.fillRect(rw * 0.16, -rh * 0.08, rw * 0.1, rh * 0.12);

    // 7. Cabina / Parabrisas trasero oscuro con borde cian
    context.fillStyle = '#0f172a';
    context.beginPath();
    context.moveTo(-rw * 0.28, -rh * 0.75);
    context.lineTo(-rw * 0.2, -rh * 1.15);
    context.lineTo(rw * 0.2, -rh * 1.15);
    context.lineTo(rw * 0.28, -rh * 0.75);
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    context.lineWidth = Math.max(1, 1.5 * (rw / playerCarW));
    context.stroke();

    // 8. Alerón trasero GT deportivo
    context.fillStyle = '#090d16';
    context.fillRect(-rw * 0.47, -rh * 0.9, rw * 0.94, rh * 0.12);
    context.fillRect(-rw * 0.32, -rh * 0.78, rw * 0.08, rh * 0.12);
    context.fillRect(rw * 0.24, -rh * 0.78, rw * 0.08, rh * 0.12);

    // 9. Luces traseras LED rojas de competición
    context.fillStyle = '#ff2255';
    context.fillRect(-rw * 0.42, -rh * 0.65, rw * 0.22, rh * 0.16);
    context.fillRect(rw * 0.2, -rh * 0.65, rw * 0.22, rh * 0.16);

    context.restore();

    // 10. Etiqueta flotante elegante tipo píldora
    if (rw > 32) {
        context.save();
        const oppName = (window.PlayWin.getPlayer && window.PlayWin.getOpponentState().username) || 'RIVAL';
        const fontSize = Math.max(9, Math.min(12, rw * 0.13));
        context.font = `700 ${fontSize}px "Inter", sans-serif`;
        const textW = context.measureText(oppName).width;
        const pillW = textW + 18;
        const pillH = fontSize + 8;
        const pillY = ry - rh * 1.25 - pillH;

        context.fillStyle = 'rgba(12, 12, 14, 0.8)';
        context.beginPath();
        context.roundRect(rx - pillW / 2, pillY, pillW, pillH, 999);
        context.fill();
        context.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        context.lineWidth = 1;
        context.stroke();

        context.fillStyle = '#ffffff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(oppName, rx, pillY + pillH / 2);
        context.restore();
    }
}

// Main Game Loop (Ultra Smooth 60 FPS)
function Update(timestamp = performance.now()) {
    requestAnimationFrame(Update);

    // Protección para pantallas de alta tasa de refresco (90Hz, 120Hz, 144Hz, 240Hz):
    // Limita la física y el bucle a un máximo estricto de 60 FPS
    const elapsed = timestamp - lastFrameTime;
    if (elapsed < 14) return;
    lastFrameTime = timestamp - (elapsed % TARGET_FRAME_MS);

    frames++;
    // Sizing canvas dynamically
    if (c.width !== window.innerWidth || c.height !== window.innerHeight) {
        c.width = window.innerWidth;
        c.height = window.innerHeight;
    }

    // Steering input calculation
    if (keyLeft) {
        steerInput = Lerp(0.2, steerInput, -1);
    } else if (keyRight) {
        steerInput = Lerp(0.2, steerInput, 1);
    } else if (!touchDriving) {
        steerInput = Lerp(0.24, steerInput, 0); // Smooth snap back to straight
    }

    // Road segment calculations
    const s = position.z / segmentLength | 0;
    const p = position.z / segmentLength % 1;

    const roadX = Lerp(p, road[s] ? road[s].x : 0, road[s + 1] ? road[s + 1].x : 0);
    const roadY = Lerp(p, road[s] ? road[s].y : 0, road[s + 1] ? road[s + 1].y : 0) + height;
    const roadA = Lerp(p, road[s] ? road[s].a : 0, road[s + 1] ? road[s + 1].a : 0);

    // Player Physics & Dynamics
    const lastVelocity = velocity.Add(0);
    velocity.y += gravity;
    velocity.x *= lateralDamp;

    // Throttle & Acceleration Logic:
    // Driving happens when touching the screen, or pressing PC keys.
    // If NOT pressing any control, the car naturally slows down / coasting brake!
    const isPlaying = (gameState === STATE_PLAYING);
    const isThrottleOn = touchDriving || keyLeft || keyRight || keyNitro || (window.innerWidth > 900 && !keyBrake);

    if (isPlaying && time > 0) {
        if (raceStartTime > 0) {
            const elapsedSec = (performance.now() - raceStartTime) / 1000;
            time = Math.max(0, maxTime + bonusTime - elapsedSec);
        }
        updateHUD();

        // Sincronización en tiempo real con PlayWin (20Hz estricto vía performance.now)
        const nowMs = performance.now();
        if ((nowMs - lastTickSent >= 48) && window.PlayWin && window.PlayWin.isLive()) {
            lastTickSent = nowMs;
            const distMeters = Math.floor(position.z / 10);
            window.PlayWin.sendTick({
                x: Math.round(position.x),
                y: Math.round(position.z),
                score: distMeters,
                isAlive: true
            });
        }

        if (keyBrake) {
            // Hard active brake
            velocity.z = Math.max(0, velocity.z + playerBrake);
        } else if (keyNitro) {
            // TURBO NITRO ACTIVADO: Explosive boost up to ~380 KM/H
            velocity.z += Lerp(velocity.z / maxNitroSpeed, nitroAccel, 0);
            if (velocity.z > 40) {
                audioSys.playNitro();
            }
        } else if (isThrottleOn) {
            // Normal acceleration up to comfortable cruising speed (~200 KM/H)
            velocity.z += Lerp(velocity.z / baseCruisingSpeed, playerAccel, 0);
            velocity.z = Math.max(0, forwardDamp * velocity.z);
        } else {
            // Releasing the screen / throttle: Car naturally decelerates!
            velocity.z = Math.max(0, velocity.z * coastDecel);
        }

    } else if (isPlaying && time <= 0) {
        // TIME OUT! Engine cuts off, rapidly coasts to a complete stop
        time = 0;
        updateHUD();
        velocity.z *= 0.93;
        gameOverCooldownTimer += timeDelta;

        if (!gameOverTriggered && (velocity.z < 12 || gameOverCooldownTimer > 1.2)) {
            gameOverTriggered = true;
            velocity.z = 0;
            endGame();
        }
    } else {
        velocity.z *= 0.94;
    }

    position = position.Add(velocity);
    position.x = Clamp(position.x, -maxPlayerX, maxPlayerX);

    // Road Ground Contact
    if (position.y < roadY) {
        position.y = roadY;
        const dp = Math.cos(roadA) * velocity.y + Math.sin(roadA) * velocity.z;
        velocity = new Vec3(0, Math.cos(roadA), Math.sin(roadA))
            .Multiply(-elasticity * dp).Add(velocity);

        // Off-road slow down
        if (road[s] && Math.abs(position.x) > road[s].w) {
            velocity.z *= offRoadDamp;
            pitchSpring += Math.sin(position.z / 99) ** 4 / 99;
        }
    }

    // Steering turn & centrifugal drift force
    const turn = Lerp(velocity.z / maxNitroSpeed, steerInput * turnControl, 0);
    velocity.x += velocity.z * turn - velocity.z ** 2 * centrifugal * roadX;

    // Pitch & Camera Spring
    const airPercent = (position.y - roadY) / 99;
    pitchSpringSpeed += Lerp(airPercent, 0, velocity.y / 4e4);
    pitchSpringSpeed += (velocity.z - lastVelocity.z) / 2e3;
    pitchSpringSpeed -= pitchSpring * springConstant;
    pitchSpringSpeed *= pitchSpringDamp;
    pitchSpring += pitchSpringSpeed;
    pitchRoad = Lerp(pitchLerp, pitchRoad, Lerp(airPercent, -roadA, 0));
    const playerPitch = pitchSpring + pitchRoad;

    heading = ClampAngle(heading + velocity.z * roadX * worldRotateScale);
    const cameraHeading = turn * cameraTurnScale;

    // Checkpoint crossed
    if (isPlaying && time > 0 && position.z > nextCheckPoint) {
        bonusTime += checkPointTime;
        if (raceStartTime > 0) {
            const elapsedSec = (performance.now() - raceStartTime) / 1000;
            time = Math.max(0, maxTime + bonusTime - elapsedSec);
        }
        nextCheckPoint += checkPointDistance;
        hueShift += 36;
        checkpointsCount++;
        audioSys.playCheckpoint();
    }

    // 3D Perspective Projection
    const projectScale = (new Vec3(1, -1, 1)).Multiply(c.width / 2 / cameraDepth);
    const horizon = c.height / 2 - Math.tan(playerPitch) * projectScale.y;
    const backgroundOffset = Math.sin(cameraHeading) / 2;
    const light = Math.cos(heading);

    // Draw Sky
    const g = context.createLinearGradient(0, horizon - c.height / 2, 0, horizon);
    g.addColorStop(0, LSHA(39 + light * 25, 49 + light * 19, 230 - light * 19));
    g.addColorStop(1, LSHA(5, 79, 250 - light * 9));
    DrawPoly(c.width / 2, 0, c.width / 2, c.width / 2, c.height, c.width / 2, g);

    // Draw Sun and Moon
    for (let i = 2; i--;) {
        const xPos = c.width * (0.5 + Lerp((heading / PI / 2 + 0.5 + i / 2) % 1, 4, -4) - backgroundOffset);
        const yPos = horizon - c.width / 5;
        const radGrad = context.createRadialGradient(
            xPos, yPos, c.width / 25,
            xPos, yPos, i ? c.width / 23 : c.width
        );
        radGrad.addColorStop(0, LSHA(i ? 70 : 99));
        radGrad.addColorStop(1, LSHA(0, 0, 0, 0));
        DrawPoly(c.width / 2, 0, c.width / 2, c.width / 2, c.height, c.width / 2, radGrad);
    }

    // Draw Mountains
    randSeed = startRandSeed;
    for (let i = mountainCount; i--;) {
        const angle = ClampAngle(heading + R(19));
        const mountLight = Math.cos(angle - heading);
        const mw = R(0.2, 0.8) ** 2 * c.width / 2;
        DrawPoly(
            c.width * (0.5 + Lerp(angle / PI / 2 + 0.5, 4, -4) - backgroundOffset),
            horizon,
            mw,
            c.width * (0.5 + Lerp(angle / PI / 2 + 0.5, 4, -4) - backgroundOffset) + mw * R(-0.5, 0.5),
            horizon - R(0.5, 0.8) * mw,
            0,
            LSHA(R(15, 25) + i / 3 - mountLight * 9, i / 2 + R(19), R(220, 230))
        );
    }

    // Draw Horizon Ground
    DrawPoly(c.width / 2, horizon, c.width / 2, c.width / 2, c.height, c.width / 2, LSHA(25, 30, 95));

    // Road Projection Coordinates
    let xOffset = 0;
    let wSum = 0;
    for (let i = 0; i < drawDistance + 1; ++i) {
        if (!road[s + i]) continue;
        const seg = road[s + i];
        const pVec = new Vec3(
            xOffset += wSum += seg.x,
            seg.y,
            (s + i) * segmentLength
        ).Add(position.Multiply(-1));

        pVec.x = pVec.x * Math.cos(cameraHeading) - pVec.z * Math.sin(cameraHeading);
        const zInv = 1 / (pVec.z * Math.cos(playerPitch) - pVec.y * Math.sin(playerPitch));
        pVec.y = pVec.y * Math.cos(playerPitch) - pVec.z * Math.sin(playerPitch);
        pVec.z = zInv;

        seg.p = pVec.Multiply(new Vec3(zInv, zInv, 1))
            .Multiply(projectScale)
            .Add(new Vec3(c.width / 2, c.height / 2));
    }

    // Draw Road and Obstacles (from far to near)
    let segment2 = road[s + drawDistance];
    for (let i = drawDistance; i--;) {
        const segment1 = road[s + i];
        if (!segment1 || !segment2 || !segment1.p || !segment2.p) continue;

        const p1 = segment1.p;
        const p2 = segment2.p;

        randSeed = startRandSeed + s + i;
        const segLight = Math.sin(segment1.a) * Math.cos(heading) * 99;

        if (p1.z < 1e5 && p1.z > 0) {
            if (i % (Lerp(i / drawDistance, 1, 9) | 0) === 0) {
                // Grass ground
                DrawPoly(c.width / 2, p1.y, c.width / 2, c.width / 2, p2.y, c.width / 2, LSHA(25 + segLight, 30, 95));

                // Shoulder Curb / Kerb
                if (segment1.w > 400) {
                    DrawPoly(
                        p1.x, p1.y, p1.z * (segment1.w + curbWidth),
                        p2.x, p2.y, p2.z * (segment2.w + curbWidth),
                        LSHA(((s + i) % 19 < 9 ? 50 : 20) + segLight)
                    );
                }

                // Asphalt Road & Checkpoint markers
                DrawPoly(
                    p1.x, p1.y, p1.z * segment1.w,
                    p2.x, p2.y, p2.z * segment2.w,
                    LSHA(((s + i) * segmentLength % checkPointDistance < 300 ? 75 : 8) + segLight)
                );

                // Dashed Center White Line
                if (segment1.w > 300 && (s + i) % 9 === 0 && i < drawDistance / 3) {
                    DrawPoly(p1.x, p1.y, p1.z * dashLineWidth, p2.x, p2.y, p2.z * dashLineWidth, LSHA(85 + segLight));
                }

                segment2 = segment1;
            }

            // PROPERLY SPACED OBSTACLES (Every 28 segments, ~28 meters apart)
            const segIdx = s + i;
            if (segIdx > 28 && segIdx % 28 === 0 && p1.z > 0.003) {
                const obsPseudoRand = Math.abs(Math.sin(segIdx * 937.13));
                const isRoadObstacle = (obsPseudoRand > 0.35); // 65% on road, 35% roadside
                let obsX = 0;
                let objType = 0;

                if (isRoadObstacle) {
                    // On-road: Traffic Cone (0) or Construction Barrier (1)
                    objType = (obsPseudoRand > 0.65) ? 1 : 0;
                    const laneSide = ((segIdx / 28) % 2 === 0) ? -0.55 : 0.55;
                    obsX = laneSide * segment1.w;
                } else {
                    // Roadside verge: Tree (2) or Boulder (3)
                    objType = (obsPseudoRand > 0.2) ? 2 : 3;
                    const vergeSide = (obsPseudoRand > 0.5) ? 1 : -1;
                    obsX = vergeSide * (segment1.w + curbWidth + 80);
                }

                // Collision Detection with Player
                if (isPlaying && !segment1.h &&
                    Math.abs(position.x - obsX) < 130 &&
                    Math.abs(position.z - segIdx * segmentLength) < 120) {
                    segment1.h = true;
                    velocity.z *= collisionSlow;
                    pitchSpring += 0.08;
                    audioSys.playCrash();
                }

                const alpha = Lerp(i / drawDistance, 3, 0);
                const scrX = p1.x + p1.z * obsX;
                drawRealisticObstacle(scrX, p1.y, p1.z, objType, Clamp(alpha, 0, 1));
            }
        }
    }

    // Kinetic speed streaks when TURBO is active at high velocity
    const isNitro = keyNitro && isPlaying && time > 0;
    if (isNitro && velocity.z > 80) {
        context.save();
        context.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        context.lineWidth = 2.5;
        for (let l = 0; l < 8; l++) {
            const isLeft = (l % 2 === 0);
            const lx = isLeft ? Math.random() * (c.width * 0.18) : c.width - Math.random() * (c.width * 0.18);
            const ly = Math.random() * c.height;
            const len = 70 + Math.random() * 80;
            context.beginPath();
            context.moveTo(lx, ly);
            context.lineTo(lx, ly + len);
            context.stroke();
        }
        context.restore();
    }

    // Dibuja el auto Ghost del rival si está en duelo 1v1
    drawRivalGhostCar(turn);

    // Draw the Player's Sports Car
    const isBraking = keyBrake;
    drawPlayerCar(turn, isBraking, isNitro);
}

// Helper to bind touch and mouse events cleanly
function bindButton(btn, onDown, onUp) {
    if (!btn) return;
    const press = (e) => {
        if (e && e.cancelable) e.preventDefault();
        onDown();
    };
    const release = (e) => {
        if (e && e.cancelable) e.preventDefault();
        onUp();
    };

    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
}

// Setup Event Listeners for UI buttons
function setupUI() {
    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.onclick = startRace;

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) btnRestart.onclick = startRace;

    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
        btnMenu.onclick = () => {
            gameState = STATE_TITLE;
            showScreen('screen-title');
        };
    }

    const btnSound = document.getElementById('btn_sound');
    if (btnSound) {
        btnSound.onclick = () => {
            audioSys.muted = !audioSys.muted;
            btnSound.textContent = audioSys.muted ? '🔇' : '🔊';
        };
    }

    // Botón TURBO en esquina superior derecha
    const btnCornerNitro = document.getElementById('btn-touch-nitro');
    if (btnCornerNitro) {
        bindButton(btnCornerNitro,
            () => {
                cornerNitroHeld = true;
                keyNitro = true;
                btnCornerNitro.classList.add('active');
                audioSys.playNitro();
            },
            () => {
                cornerNitroHeld = false;
                keyNitro = false;
                btnCornerNitro.classList.remove('active');
            }
        );
    }

    // Botones de Dirección y Freno inferiores
    bindButton(document.getElementById('btn-touch-left'),
        () => keyLeft = true,
        () => keyLeft = false
    );

    bindButton(document.getElementById('btn-touch-right'),
        () => keyRight = true,
        () => keyRight = false
    );

    bindButton(document.getElementById('btn-touch-brake'),
        () => keyBrake = true,
        () => keyBrake = false
    );
}

// Initialise Game
resetGame();
setupUI();
requestAnimationFrame(Update);

// Sincronización instantánea de reloj al cambiar foco de ventana / pestaña
function syncTimeInstant() {
    if (gameState === STATE_PLAYING && raceStartTime > 0) {
        const elapsedSec = (performance.now() - raceStartTime) / 1000;
        time = Math.max(0, maxTime + bonusTime - elapsedSec);
        updateHUD();
        if (time <= 0 && !gameOverTriggered) {
            gameOverTriggered = true;
            velocity.z = 0;
            endGame();
        }
    }
}
document.addEventListener('visibilitychange', syncTimeInstant);
window.addEventListener('focus', syncTimeInstant);

// ==================================================================
// CONEXIÓN CON EL SDK PLAYWIN (MULTIJUGADOR 1v1)
// ==================================================================
if (window.PlayWin) {
    window.PlayWin.init({
        gameId: 'carreras',
        callbacks: {
            onMatchReady: (data) => {
                currentSeed = data.seed;
                resetGame();
                gameState = STATE_TITLE;
                updateHUD();
            },
            onMatchLive: () => {
                startRace();
                updateHUD();
            },
            onMatchEnd: () => {
                endGame();
            }
        }
    });
}
})();