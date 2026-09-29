import assert from 'node:assert/strict';
import { validateTickPhysics, validatePacketRate } from '../src/anticheat.js';

/**
 * ==============================================================================
 * PLAY WIN: SUITE DE PRUEBAS ESPECIALIZADA ANTI-HACK — BATI VUELO (FLAPY-FLAPY)
 * Valida mecánicas discretas (+1 punto/tubería), límites de altura (eje Y) y
 * previene falsos baneos por jitter/lag en jugadores habilidosos.
 * Cumple con AGENTS.md (< 350L).
 * ==============================================================================
 */

console.log('🦇 [FLAPY SPEC] Iniciando Auditoría Especializada de Anti-Hack para Bati Vuelo (Flapy-Flapy)...\n');

let passCount = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('--- 1. Pruebas de Jugador Legítimo (Sin Falsos Positivos) ---');

runTest('Aleteo rítmico normal y paso de 1 obstáculo cada ~1.5s es 100% válido', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 11500, x: 88, y: 280, score: 0 };
  const tick2 = { timestamp: 13000, x: 88, y: 220, score: 1 }; // Superó obstáculo 1
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, true);
});

runTest('Aleteo rápido cerca del techo dentro de límites (y=25 a y=50) no banea', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 12000, x: 88, y: 48, score: 2 };
  const tick2 = { timestamp: 12050, x: 88, y: 26, score: 2 }; // Dentro del margen de techo
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, true);
});

runTest('Recuperación de Lag Spike (2 tuberías pasadas en 1.8s) NO genera falso baneo', () => {
  const matchStart = 10000;
  // Durante un hipo de WiFi de 1.8s, el jugador esquivó 2 tuberías legítimamente
  const tick1 = { timestamp: 12000, x: 88, y: 300, score: 4 };
  const tick2 = { timestamp: 13800, x: 88, y: 260, score: 6 }; // +2 tras 1.8s
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, true, `Lag burst legítimo fue falsamente bloqueado: ${res.reason}`);
});

runTest('Caída en picada y salvada al límite del suelo (y=520 a y=440) es válida', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 14000, x: 88, y: 520, score: 7 };
  const tick2 = { timestamp: 14100, x: 88, y: 440, score: 7 };
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, true);
});

runTest('Cadencia de red a 20Hz (20 paquetes/segundo) pasa con holgura', () => {
  let history = [];
  const baseTime = 20000;
  for (let i = 0; i < 20; i++) {
    const res = validatePacketRate(history, baseTime + i * 50);
    assert.equal(res.valid, true);
    history = res.history;
  }
});

console.log('\n--- 2. Pruebas de Detección de Trampas (Blindaje de Vectores de Ataque) ---');

runTest('Inyección de puntaje (+10 puntos en 50ms) bloqueada con SPEEDHACK_SCORE_OVERFLOW', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 11000, x: 88, y: 280, score: 1 };
  const tick2 = { timestamp: 11050, x: 88, y: 280, score: 11 }; // Hack: +10 instantáneo
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'SPEEDHACK_SCORE_OVERFLOW');
  assert.equal(res.severity, 'HIGH');
});

runTest('Inyección masiva de puntaje (+50 puntos) bloqueada con severidad HIGH', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 12000, x: 88, y: 280, score: 3 };
  const tick2 = { timestamp: 12050, x: 88, y: 280, score: 53 };
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'SPEEDHACK_SCORE_OVERFLOW');
  assert.equal(res.severity, 'HIGH');
});

runTest('Exploit de Techo Flotante (y=-80 para sobrevolar tuberías) bloqueado con OUT_OF_BOUNDS_ANOMALY', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 11000, x: 88, y: 20, score: 1 };
  const tick2 = { timestamp: 11050, x: 88, y: -80, score: 1 }; // Noclip sobre el techo
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'OUT_OF_BOUNDS_ANOMALY');
  assert.equal(res.severity, 'HIGH');
});

runTest('Exploit Subterráneo Noclip (y=750 atravesando el suelo) bloqueado con OUT_OF_BOUNDS_ANOMALY', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 11000, x: 88, y: 500, score: 2 };
  const tick2 = { timestamp: 11050, x: 88, y: 750, score: 2 }; // Noclip bajo el suelo
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'OUT_OF_BOUNDS_ANOMALY');
  assert.equal(res.severity, 'HIGH');
});

runTest('Teletransporte vertical brusco (>350px en 50ms) bloqueado con TELEPORT_POSITION_ANOMALY', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 11000, x: 88, y: 500, score: 2 };
  const tick2 = { timestamp: 11050, x: 88, y: 50, score: 2 }; // Salto imposible de 450px
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'TELEPORT_POSITION_ANOMALY');
  assert.equal(res.severity, 'HIGH');
});

runTest('Teletransporte horizontal anómalo (x=300 evadiendo columnas) bloqueado', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 11000, x: 88, y: 280, score: 1 };
  const tick2 = { timestamp: 11050, x: 300, y: 280, score: 1 }; // X desplazada
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'TELEPORT_POSITION_ANOMALY');
});

runTest('Puntuación retrógrada o decreciente bloqueada con SCORE_RETROGRADE_ANOMALY', () => {
  const matchStart = 10000;
  const tick1 = { timestamp: 15000, x: 88, y: 280, score: 10 };
  const tick2 = { timestamp: 15050, x: 88, y: 280, score: 8 };
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'SCORE_RETROGRADE_ANOMALY');
});

runTest('Invariante macro de partida: Puntaje total imposible (35 pts en 5s) bloqueado con éxito', () => {
  const matchStart = 10000;
  // A los 5 segundos de partida, el puntaje máximo teórico es ~9 puntos
  const tick1 = { timestamp: 14950, x: 88, y: 280, score: 34 };
  const tick2 = { timestamp: 15000, x: 88, y: 280, score: 35 };
  const res = validateTickPhysics('flapy-flapy', tick1, tick2, matchStart);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'SPEEDHACK_SCORE_OVERFLOW');
});

runTest('Ataque de saturación / flood (40 paquetes/s) neutralizado con PACKET_FLOOD_ANOMALY', () => {
  let history = [];
  const baseTime = 30000;
  let blocked = false;
  for (let i = 0; i < 40; i++) {
    const res = validatePacketRate(history, baseTime + i * 20);
    if (!res.valid) {
      assert.equal(res.reason, 'PACKET_FLOOD_ANOMALY');
      blocked = true;
      break;
    }
    history = res.history;
  }
  assert.equal(blocked, true, 'El flood de paquetes debió ser neutralizado');
});

console.log(`\n🏁 Resultado: ${passCount}/${totalTests} pruebas superadas.`);
if (passCount === totalTests) {
  console.log('✨ [AUDITORÍA FLAPY-FLAPY: 100% EXITOSA] Sistema blindado contra exploits y sin falsos positivos.\n');
} else {
  console.error('⚠️ ALGUNAS PRUEBAS FALLARON.');
  process.exit(1);
}
