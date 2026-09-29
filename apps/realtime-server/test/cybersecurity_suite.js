/**
 * ==============================================================================
 * PLAY WIN CYBERSECURITY & ANTI-CHEAT AUDIT SUITE (cybersecurity_suite.js)
 * Validación de los 4 Vectores Críticos de Ataque:
 * 1. Falsificación Criptográfica de JWT (Token Spoofing)
 * 2. Inyección de Speedhack / Puntaje Imposible (Score Overflow)
 * 3. Teletransportación Espacial Anómala (Noclip / Teleport)
 * 4. Saturación de Paquetes WebSocket (Flood / Macros / Bots)
 * ==============================================================================
 */

import { verifyMatchTicket, validateTickPhysics, validatePacketRate } from '../src/anticheat.js';

console.log('🛡️ [CyberAudit] Iniciando Suite de Ciberseguridad y Detección de Trampas...');

// PRUEBA 1: Falsificación Criptográfica de Token
console.log('\n[Vector 1] Verificación de Tokens Criptográficos (HMAC SHA-256)...');
const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrZXIxMjMiLCJ1c2VybmFtZSI6IkZha2VQbGF5ZXIiLCJleHAiOjk5OTk5OTk5OTl9.invalid_signature_xyz';
const tokenResult = verifyMatchTicket(fakeToken);
if (tokenResult === null) {
  console.log('  ✅ Correcto: Token falsificado rechazado criptográficamente.');
} else {
  throw new Error('Fallo crítico: El token falso fue aceptado.');
}

// PRUEBA 2: Inyección de Speedhack (+800 pts en 50ms)
console.log('\n[Vector 2] Detección de Speedhack & Score Overflow...');
const t1 = { timestamp: 1000, x: 0, y: 0, score: 10 };
const t2 = { timestamp: 1050, x: 0, y: 0, score: 810 };
const speedhackCheck = validateTickPhysics('carreras', t1, t2);
if (!speedhackCheck.valid && speedhackCheck.reason === 'SPEEDHACK_SCORE_OVERFLOW') {
  console.log(`  ✅ Correcto: Speedhack detectado con éxito (${speedhackCheck.reason}).`);
} else {
  throw new Error(`Fallo crítico en detección de speedhack: ${JSON.stringify(speedhackCheck)}`);
}

// PRUEBA 3: Teletransportación Anómala (Salto de carril imposible)
console.log('\n[Vector 3] Detección de Salto Espacial (Teleport / Noclip)...');
const t3 = { timestamp: 1000, x: 10, y: 0, score: 10 };
const t4 = { timestamp: 1050, x: 950, y: 0, score: 12 };
const teleportCheck = validateTickPhysics('carreras', t3, t4);
if (!teleportCheck.valid && teleportCheck.reason === 'TELEPORT_POSITION_ANOMALY') {
  console.log(`  ✅ Correcto: Teletransportación anómala detectada (${teleportCheck.reason}).`);
} else {
  throw new Error(`Fallo crítico en detección de teletransporte: ${JSON.stringify(teleportCheck)}`);
}

// PRUEBA 4: Saturación de Paquetes (Anti-Flood / Macros)
console.log('\n[Vector 4] Detección de Saturación / Bot Macro (Rate Limiter)...');
let history = [];
const now = Date.now();
for (let i = 0; i < 34; i++) {
  history.push(now - 800 + i * 10);
}
const floodCheckNormal = validatePacketRate(history, now);
if (floodCheckNormal.valid) {
  console.log('  ✅ 34 paquetes/seg permitidos dentro del umbral 20Hz.');
}

// Inyección del paquete 36 (violación de flood)
const floodHistory = [...floodCheckNormal.history];
for (let j = 0; j < 3; j++) floodHistory.push(now);
const floodCheckAbuse = validatePacketRate(floodHistory, now);
if (!floodCheckAbuse.valid && floodCheckAbuse.reason === 'PACKET_FLOOD_ANOMALY') {
  console.log(`  ✅ Correcto: Flood/Macro bloqueado inmediatamente (${floodCheckAbuse.reason}).`);
} else {
  throw new Error(`Fallo crítico en detección de flood: ${JSON.stringify(floodCheckAbuse)}`);
}

console.log('\n🎉 [CyberAudit] ¡LOS 4 VECTORES DE ATAQUE FUERON NEUTRALIZADOS CON 100% DE ÉXITO!\n');
