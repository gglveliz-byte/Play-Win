import assert from 'node:assert';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { RoomManager } from '../apps/realtime-server/src/rooms.js';
import { validateTickPhysics } from '../apps/realtime-server/src/anticheat.js';

import { env } from './load-env.mjs';

const JWT_SECRET = env('JWT_SECRET');

function createTestToken(id, username, gameId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: id,
    username,
    avatar: '🎮',
    gameId,
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function runNetworkScenariosTest() {
  console.log('🧪 Iniciando Suite de Pruebas de Red y Escenarios Extremos...');

  // 1. Probar que lag bursts no disparan falso positivo en validateTickPhysics
  console.log('--- Caso 1: Tolerancia de Lag Burst / Jitter en Anti-Cheat ---');
  const lastTick = { timestamp: Date.now() - 10, score: 50, x: 10, y: 10 };
  const burstTick = { timestamp: Date.now(), score: 60, x: 25, y: 25 }; // +10 pts en 10ms (burst TCP)
  const physicsCheck = validateTickPhysics('carreras', lastTick, burstTick, Date.now() - 5000);
  assert.strictEqual(physicsCheck.valid, true, 'El buffer TCP no debe disparar falso positivo de speedhack');
  console.log('✅ Anti-Cheat tolera ráfagas de paquetes post-lag.');

  // 2. Levantar servidor efímero para pruebas de reconexión 1v1
  console.log('--- Caso 2 & 3: Ventana de Gracia de Reconexión (5s) ---');
  const server = createServer();
  const wss = new WebSocketServer({ server });
  const roomManager = new RoomManager();
  // Reducir ventana a 600ms para pruebas rápidas
  roomManager.reconnectManager.gracePeriodMs = 600;

  wss.on('connection', (socket, request) => {
    socket.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.action === 'JOIN_MATCH') {
        roomManager.joinQueue(data.player, socket, '127.0.0.1');
      } else if (data.action === 'PING') {
        socket.send(JSON.stringify({ event: 'PONG', clientTime: data.clientTime || 0, time: Date.now() }));
      }
    });
    socket.on('close', () => roomManager.handleDisconnect(socket));
  });

  await new Promise(r => server.listen(3099, r));
  const WS_URL = 'ws://localhost:3099';

  try {
    // Probar PING / PONG RTT
    const testSocket = new WebSocket(WS_URL);
    await new Promise(r => testSocket.on('open', r));
    const now = Date.now();
    testSocket.send(JSON.stringify({ action: 'PING', clientTime: now }));
    const pongMsg = await new Promise(r => testSocket.on('message', d => r(JSON.parse(d))));
    assert.strictEqual(pongMsg.event, 'PONG');
    assert.strictEqual(pongMsg.clientTime, now);
    console.log('✅ Medición de PING / PONG validada.');
    testSocket.close();

    // Probar Desconexión y Reconexión Exitosa dentro de la ventana de gracia
    const p1Token = createTestToken('user_rec_1', 'Player1', 'sky');
    const p2Token = createTestToken('user_rec_2', 'Player2', 'sky');

    let ws1 = new WebSocket(WS_URL);
    let ws2 = new WebSocket(WS_URL);

    await Promise.all([
      new Promise(r => ws1.on('open', r)),
      new Promise(r => ws2.on('open', r)),
    ]);

    let matchStartedPromise = new Promise(resolve => {
      let count = 0;
      const check = () => { if (++count === 2) resolve(); };
      ws1.on('message', d => { if (JSON.parse(d).event === 'MATCH_START') check(); });
      ws2.on('message', d => { if (JSON.parse(d).event === 'MATCH_START') check(); });
    });

    ws1.send(JSON.stringify({ action: 'JOIN_MATCH', player: { token: p1Token, gameId: 'sky' } }));
    ws2.send(JSON.stringify({ action: 'JOIN_MATCH', player: { token: p2Token, gameId: 'sky' } }));
    await matchStartedPromise;
    console.log('✅ Duelo 1v1 iniciado entre Player1 y Player2.');

    // Simular desconexión intempestiva de Player 1
    const p2NotifiedPromise = new Promise(resolve => {
      ws2.on('message', d => {
        const msg = JSON.parse(d);
        if (msg.event === 'RIVAL_DISCONNECTED') resolve(msg);
      });
    });

    ws1.close();
    const disconnectNotice = await p2NotifiedPromise;
    assert.strictEqual(disconnectNotice.event, 'RIVAL_DISCONNECTED');
    assert.strictEqual(disconnectNotice.graceSeconds, 5);
    console.log('✅ Rival notificado de desconexión temporal con gracia de 5s.');

    // Player 1 se reconecta con nuevo WebSocket antes de que expire la gracia (a los 150ms)
    await new Promise(r => setTimeout(r, 150));
    const ws1Reconnected = new WebSocket(WS_URL);
    await new Promise(r => ws1Reconnected.on('open', r));

    const resumedPromise = new Promise(resolve => {
      ws1Reconnected.on('message', d => {
        const msg = JSON.parse(d);
        if (msg.event === 'MATCH_RESUME') resolve(msg);
      });
    });

    const p2ReconnectedPromise = new Promise(resolve => {
      ws2.on('message', d => {
        const msg = JSON.parse(d);
        if (msg.event === 'RIVAL_RECONNECTED') resolve(msg);
      });
    });

    ws1Reconnected.send(JSON.stringify({ action: 'JOIN_MATCH', player: { token: p1Token, gameId: 'sky' } }));
    const resumeMsg = await resumedPromise;
    const reconnectedNotice = await p2ReconnectedPromise;

    assert.strictEqual(resumeMsg.event, 'MATCH_RESUME');
    assert.strictEqual(reconnectedNotice.event, 'RIVAL_RECONNECTED');
    console.log('✅ Reconexión de emergencia exitosa: partida reanudada y rival notificado.');

    ws1Reconnected.close();
    ws2.close();
  } finally {
    server.close();
  }

  console.log('🎉 ¡TODOS LOS ESCENARIOS DE RED Y LATENCIA VERIFICADOS AL 100%!');
}

runNetworkScenariosTest().catch(err => {
  console.error('❌ Error en suite de pruebas de red:', err);
  process.exit(1);
});
