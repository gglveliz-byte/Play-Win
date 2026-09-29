import { validateTickPhysics, validatePacketRate, GAME_PHYSICS_BOUNDS } from '../src/anticheat.js';

console.log('🏎️ [CARRERAS SPEC] Iniciando Auditoría Especializada de Anti-Hack para Speed Horizon 3D...\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// --------------------------------------------------------------------------------------
// CASO 1: CONDUCCIÓN LIMPIA Y LEGÍTIMA (JUGADOR "PILAS" - CERO FALSOS POSITIVOS)
// --------------------------------------------------------------------------------------
console.log('--- 1. Pruebas de Jugador Legítimo (Sin falsos positivos) ---');

// 1.1 Conducción normal de crucero (~220 KM/H -> ~66 metros cada 50ms)
const tCruising1 = { timestamp: 1000, x: 0, y: 0, score: 100 };
const tCruising2 = { timestamp: 1050, x: 25, y: 660, score: 166 };
const resCruising = validateTickPhysics('carreras', tCruising1, tCruising2, 0);
assert(resCruising.valid === true, 'Conducción en velocidad crucero es 100% válida');

// 1.2 Turbo Nitro a fondo (~380 KM/H -> ~117 metros cada 50ms)
const tNitro1 = { timestamp: 1050, x: 25, y: 660, score: 166 };
const tNitro2 = { timestamp: 1100, x: 45, y: 1830, score: 283 };
const resNitro = validateTickPhysics('carreras', tNitro1, tNitro2, 0);
assert(resNitro.valid === true, 'Turbo Nitro a máxima velocidad es 100% válido y no banea');

// 1.3 Maniobra de esquive agresivo entre carriles (deltaX = 280 en 50ms)
const tSteer1 = { timestamp: 1100, x: -150, y: 1830, score: 283 };
const tSteer2 = { timestamp: 1150, x: 130, y: 3000, score: 380 };
const resSteer = validateTickPhysics('carreras', tSteer1, tSteer2, 0);
assert(resSteer.valid === true, 'Esquive rápido de obstáculos en curva no banea al piloto hábil');

// 1.4 Jitter / Micro-intervalo de red (2 paquetes recibidos con 10ms de diferencia por coalescencia TCP/WiFi)
// El jugador avanzó 66m en 50ms en su juego, pero los paquetes llegaron con deltaMs = 10ms
const tJitter1 = { timestamp: 2000, x: 0, y: 0, score: 500 };
const tJitter2 = { timestamp: 2010, x: 10, y: 660, score: 566 };
const resJitter = validateTickPhysics('carreras', tJitter1, tJitter2, 0);
assert(resJitter.valid === true, 'Jitter de red (10ms entre llegadas) NO genera falso baneo de speedhack');

// 1.5 Rate Limiter con tasa normal de 20Hz (20 paquetes/segundo)
let history20Hz = [];
const now = Date.now();
for (let i = 0; i < 20; i++) history20Hz.push(now - 1000 + i * 50);
const resRate20Hz = validatePacketRate(history20Hz, now);
assert(resRate20Hz.valid === true, 'Envío a 20Hz (20 paquetes/seg) pasa sin advertencias');

// --------------------------------------------------------------------------------------
// CASO 2: INTENTOS DE HACKEO Y CIERRE DE HUECOS (DETECCIÓN Y BLOQUEO AL 100%)
// --------------------------------------------------------------------------------------
console.log('\n--- 2. Pruebas de Detección de Trampas (Cierre de huecos) ---');

// 2.1 Inyección de Speedhack (+900 metros en 50ms)
const tHack1 = { timestamp: 3000, x: 0, y: 0, score: 200 };
const tHack2 = { timestamp: 3050, x: 0, y: 0, score: 1100 };
const resHackSpeed = validateTickPhysics('carreras', tHack1, tHack2, 0);
assert(
  resHackSpeed.valid === false && resHackSpeed.reason === 'SPEEDHACK_SCORE_OVERFLOW',
  'Speedhack de +900 metros en 50ms bloqueado con SPEEDHACK_SCORE_OVERFLOW'
);

// 2.2 Teletransportación lateral instantánea (+940 unidades en 50ms)
const tTele1 = { timestamp: 3000, x: -400, y: 0, score: 200 };
const tTele2 = { timestamp: 3050, x: 540, y: 500, score: 250 };
const resTeleport = validateTickPhysics('carreras', tTele1, tTele2, 0);
assert(
  resTeleport.valid === false && resTeleport.reason === 'TELEPORT_POSITION_ANOMALY',
  'Teletransporte lateral de 940 unidades bloqueado con TELEPORT_POSITION_ANOMALY'
);

// 2.3 Posición fuera de pista (Noclip / Out of Bounds: x = 3500)
const tOOB1 = { timestamp: 4000, x: 0, y: 0, score: 100 };
const tOOB2 = { timestamp: 4050, x: 3500, y: 500, score: 150 };
const resOOB = validateTickPhysics('carreras', tOOB1, tOOB2, 0);
assert(
  resOOB.valid === false && resOOB.reason === 'TELEPORT_POSITION_ANOMALY',
  'Posición fuera de pista (x=3500) bloqueada inmediatamente'
);

// 2.4 Retroceso de puntuación anómalo (Puntaje decreciente)
const tRetro1 = { timestamp: 5000, x: 0, y: 0, score: 800 };
const tRetro2 = { timestamp: 5050, x: 0, y: 0, score: 500 };
const resRetro = validateTickPhysics('carreras', tRetro1, tRetro2, 0);
assert(
  resRetro.valid === false && resRetro.reason === 'SCORE_RETROGRADE_ANOMALY',
  'Puntuación decreciente bloqueada con SCORE_RETROGRADE_ANOMALY'
);

// 2.5 Invariante Macro de Partida (Un jugador no puede tener más de tiempoTranscurrido * Vmax)
// En 4 segundos, el máximo absoluto con nitro y margen es ~12,500m. Si envía 25,000m:
const tMacro = { timestamp: 4000, x: 0, y: 0, score: 25000 };
const resMacro = validateTickPhysics('carreras', { timestamp: 3950, x: 0, y: 0, score: 24900 }, tMacro, 0);
assert(
  resMacro.valid === false && resMacro.reason === 'SPEEDHACK_SCORE_OVERFLOW',
  'Invariante macro de partida: Puntaje global imposible en 4s bloqueado con éxito'
);

// 2.6 Saturación de paquetes WebSocket (Ataque de flood con > 38 paquetes en 1s)
let floodHistory = [];
for (let i = 0; i < 42; i++) floodHistory.push(now);
const resFlood = validatePacketRate(floodHistory, now);
assert(
  resFlood.valid === false && resFlood.reason === 'PACKET_FLOOD_ANOMALY',
  'Ataque de Flood/Macro (42 paquetes/s) neutralizado con PACKET_FLOOD_ANOMALY'
);

console.log(`\n🏁 Resultado: ${passedTests}/${totalTests} pruebas superadas.`);
if (passedTests === totalTests) {
  console.log('✨ [AUDITORÍA CARRERAS: 100% EXITOSA] Sistema equilibrado, sin huecos y sin falsos positivos.');
} else {
  process.exit(1);
}
