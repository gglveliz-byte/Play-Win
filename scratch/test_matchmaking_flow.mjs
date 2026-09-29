import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import crypto from 'node:crypto';

import { env } from './load-env.mjs';

const JWT_SECRET = env('JWT_SECRET');

console.log('🧪 [Test Matchmaking] Iniciando verificación de emparejamiento 1v1...');

function createTestToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

const testToken = createTestToken({
  sub: 'usr_progamer2026_test',
  username: 'progamer2026',
  avatar: '🏎️',
  gameId: 'carreras',
  tier: 'ORO',
  skillRating: 1850,
});

const ws = new WebSocket('ws://localhost:3001/ws');
let receivedMatchStart = false;
let receivedMatchLive = false;
let receivedRivalTick = false;
const startTime = Date.now();

ws.on('open', () => {
  console.log('✅ WebSocket conectado a ws://localhost:3001/ws');
  ws.send(JSON.stringify({
    action: 'JOIN_MATCH',
    player: {
      id: 'usr_progamer2026_test',
      username: 'progamer2026',
      avatar: '🏎️',
      gameId: 'carreras',
      token: testToken,
    }
  }));
  console.log('📤 JOIN_MATCH enviado con token válido. Esperando emparejamiento...');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️ [${elapsed}s] Evento recibido:`, msg.event);

  if (msg.event === 'MATCH_WAITING') {
    console.log('   ℹ️ En cola de espera:', msg.message);
  } else if (msg.event === 'MATCH_START') {
    receivedMatchStart = true;
    console.log('   🎉 ¡EMPAREJAMIENTO EXITOSO!');
    console.log('   Sala:', msg.roomId);
    console.log('   Semilla PRNG compartida:', msg.seed);
    console.log('   Rival asignado:', msg.opponent.username, `(${msg.opponent.rank || 'ORO'})`);
  } else if (msg.event === 'MATCH_LIVE') {
    receivedMatchLive = true;
    console.log('   🏁 ¡PARTIDA EN VIVO (MATCH_LIVE)!');
    ws.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 100, score: 10, isAlive: true }));
  } else if (msg.event === 'RIVAL_TICK') {
    if (!receivedRivalTick) {
      receivedRivalTick = true;
      console.log('   🏎️ Telemetría del rival recibida (RIVAL_TICK):', {
        x: msg.x.toFixed(1),
        y: msg.y.toFixed(1),
        score: msg.score,
        isAlive: msg.isAlive
      });
      console.log('✅ ¡PRUEBA SUPERADA CON ÉXITO TOTAL: EL EMPAREJAMIENTO FUNCIONA PERFECTAMENTE!');
      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 500);
    }
  }
});

ws.on('error', (err) => {
  console.error('❌ Error de conexión:', err.message);
  process.exit(1);
});

setTimeout(() => {
  if (!receivedMatchStart) {
    console.error('❌ FALLÓ: El emparejamiento no ocurrió en el tiempo esperado (timeout de 8s).');
    process.exit(1);
  }
}, 8000);
