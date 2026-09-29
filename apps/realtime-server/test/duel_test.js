import assert from 'node:assert';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { RoomManager } from '../src/rooms.js';
// Carga JWT_SECRET del entorno (.env / .env.test). Sin fallback quemado.
import '../src/load-env.js';

/**
 * ============================================================================
 * PLAY WIN — PRUEBA QUIRÚRGICA DE DUELO 1v1 (duel_test.js)
 * ============================================================================
 * Valida el ciclo completo del protocolo:
 *   Conexión → Matchmaking → SEMILLA IDÉNTICA → Countdown → MATCH_LIVE
 *   → Ticks bidireccionales → Fin de partida → MATCH_END del servidor
 *
 * Historia de este archivo: la versión anterior conectaba a un servidor
 * externo en el puerto 3001 (que nunca arrancaba) y enviaba JOIN_MATCH SIN
 * token, cuando `rooms.js` ya lo exige. Se colgaba indefinidamente y bloqueaba
 * `npm run test:all` (BUG-006). Ahora arranca su propio servidor y firma
 * MatchTickets reales.
 * ============================================================================
 */

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'Falta JWT_SECRET. Ejecuta: npm run test:duel  (carga .env.test automáticamente)'
  );
}

/** Timeout global: ninguna prueba debe colgarse para siempre. */
const GLOBAL_TIMEOUT_MS = 40000;
const timeoutHandle = setTimeout(() => {
  console.error(`\n❌ TIMEOUT GLOBAL: la prueba superó ${GLOBAL_TIMEOUT_MS} ms sin terminar.`);
  process.exit(1);
}, GLOBAL_TIMEOUT_MS);
timeoutHandle.unref?.();

/** Puerto efímero: evita colisionar con un servidor ya en ejecución. */
const TEST_PORT = Number(process.env.TEST_WS_PORT || 3199);

function createMatchTicket(sub, username, gameId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      username,
      avatar: '🎮',
      gameId,
      exp: Math.floor(Date.now() / 1000) + 300,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/** Espera a que llegue un evento concreto por el socket. */
function waitForEvent(socket, eventName, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timeout esperando el evento "${eventName}" tras ${timeoutMs} ms`));
    }, timeoutMs);

    function onMessage(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.event === eventName) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(msg);
      }
    }
    socket.on('message', onMessage);
  });
}

async function runDuelTest() {
  console.log('🧪 [Duel Test] Prueba quirúrgica de salas 1v1 en tiempo real...\n');

  // ── Servidor efímero propio ────────────────────────────────────────────────
  const server = createServer();
  const wss = new WebSocketServer({ server });
  const roomManager = new RoomManager();

  wss.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      switch (data.action) {
        case 'JOIN_MATCH':
          roomManager.joinQueue(data.player, socket, '127.0.0.1');
          break;
        case 'PLAYER_TICK':
          roomManager.handlePlayerTick(socket, data);
          break;
        case 'PLAYER_CRASHED':
          roomManager.handlePlayerCrash(socket);
          break;
        case 'PLAYER_FINISH':
          roomManager.handlePlayerFinish(socket, data);
          break;
        case 'PING':
          socket.send(JSON.stringify({ event: 'PONG', clientTime: data.clientTime || 0, time: Date.now() }));
          break;
        default:
          break;
      }
    });
    socket.on('close', () => roomManager.handleDisconnect(socket));
    socket.on('error', () => roomManager.handleDisconnect(socket));
  });

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  const wsUrl = `ws://localhost:${TEST_PORT}`;
  console.log(`✅ Servidor de prueba escuchando en ${wsUrl}`);

  const gameId = `duel_test_${Date.now()}`;
  const tickets = {
    a: createMatchTicket('usr_duel_a', 'BatiRojo', gameId),
    b: createMatchTicket('usr_duel_b', 'BatiAzul', gameId),
  };

  /** Seguridad: un JOIN_MATCH sin token debe ser rechazado. */
  const noTokenSocket = new WebSocket(wsUrl);
  await new Promise((resolve) => noTokenSocket.on('open', resolve));
  noTokenSocket.send(JSON.stringify({ action: 'JOIN_MATCH', player: { id: 'intruso', username: 'intruso', gameId } }));
  const securityError = await waitForEvent(noTokenSocket, 'SECURITY_ERROR');
  assert.ok(securityError.message, 'SECURITY_ERROR debe traer un mensaje');
  console.log(`✅ Cliente sin MatchTicket rechazado: "${securityError.message}"`);
  noTokenSocket.close();

  // ── Dos clientes legítimos ─────────────────────────────────────────────────
  const clientA = new WebSocket(wsUrl);
  await new Promise((resolve) => clientA.on('open', resolve));
  clientA.send(JSON.stringify({ action: 'JOIN_MATCH', player: { token: tickets.a, gameId } }));
  await waitForEvent(clientA, 'MATCH_WAITING');
  console.log('⏳ Cliente A en cola. Conectando cliente B...');

  const clientB = new WebSocket(wsUrl);
  await new Promise((resolve) => clientB.on('open', resolve));
  const startA = waitForEvent(clientA, 'MATCH_START');
  clientB.send(JSON.stringify({ action: 'JOIN_MATCH', player: { token: tickets.b, gameId } }));
  const startB = waitForEvent(clientB, 'MATCH_START');

  const [matchStartA, matchStartB] = await Promise.all([startA, startB]);

  assert.strictEqual(matchStartA.seed, matchStartB.seed, 'Ambos jugadores DEBEN recibir la misma semilla PRNG');
  assert.ok(Number.isInteger(matchStartA.seed), 'La semilla debe ser un entero');
  assert.strictEqual(matchStartA.role, 'PLAYER_A');
  assert.strictEqual(matchStartB.role, 'PLAYER_B');
  // Los usernames se normalizan a minúsculas al persistirse en la base de datos,
  // así que la comparación es insensible a mayúsculas a propósito.
  assert.strictEqual(matchStartA.opponent.username.toLowerCase(), 'batiazul');
  assert.strictEqual(matchStartB.opponent.username.toLowerCase(), 'batirojo');
  console.log(`✅ MATCH_START con SEMILLA IDÉNTICA: ${matchStartA.seed}`);

  // ── Countdown de 3s → MATCH_LIVE ───────────────────────────────────────────
  const liveA = waitForEvent(clientA, 'MATCH_LIVE', 10000);
  const liveB = waitForEvent(clientB, 'MATCH_LIVE', 10000);
  await Promise.all([liveA, liveB]);
  console.log('✅ MATCH_LIVE recibido por ambos tras el conteo.');

  // ── Ticks bidireccionales ──────────────────────────────────────────────────
  const rivalTickB = waitForEvent(clientB, 'RIVAL_TICK');
  clientA.send(JSON.stringify({ action: 'PLAYER_TICK', x: 120, y: 0, score: 64, isAlive: true }));
  const tickFromA = await rivalTickB;
  assert.strictEqual(tickFromA.score, 64, 'El rival debe recibir el puntaje remitido');
  assert.strictEqual(tickFromA.x, 120);

  const rivalTickA = waitForEvent(clientA, 'RIVAL_TICK');
  clientB.send(JSON.stringify({ action: 'PLAYER_TICK', x: 40, y: 0, score: 21, isAlive: true }));
  const tickFromB = await rivalTickA;
  assert.strictEqual(tickFromB.score, 21);
  console.log('✅ Telemetría retransmitida en ambos sentidos (RIVAL_TICK).');

  // ── Fin de partida: gana quien más distancia acumuló ───────────────────────
  // El juego de esta prueba usa el criterio por puntaje (no es 'carreras'),
  // así que la victoria se resuelve con _resolveScoreWinner.
  clientA.send(JSON.stringify({ action: 'PLAYER_TICK', x: 300, y: 0, score: 180, isAlive: true }));
  await new Promise((r) => setTimeout(r, 120));
  clientB.send(JSON.stringify({ action: 'PLAYER_TICK', x: 60, y: 0, score: 45, isAlive: true }));
  await new Promise((r) => setTimeout(r, 120));

  const endA = waitForEvent(clientA, 'MATCH_END', 12000);
  const endB = waitForEvent(clientB, 'MATCH_END', 12000);
  clientA.send(JSON.stringify({ action: 'PLAYER_FINISH', score: 180 }));

  const [matchEndA, matchEndB] = await Promise.all([endA, endB]);

  assert.strictEqual(matchEndA.winnerId, matchEndB.winnerId, 'Ambos deben recibir el MISMO veredicto');
  assert.strictEqual(matchEndA.reason, 'HIGHER_SCORE');
  assert.strictEqual(matchEndA.payout.winnerSeasonPoints, 100, 'El ganador recibe +100 Season Points');
  assert.strictEqual(matchEndA.payout.loserSeasonPoints, 20, 'El perdedor recibe +20 Season Points');
  assert.ok(matchEndA.summary && matchEndA.summary.length > 0, 'MATCH_END debe incluir un resumen');
  console.log(`✅ MATCH_END emitido por el SERVIDOR (no por el cliente):`);
  console.log(`     motivo  : ${matchEndA.reason}`);
  console.log(`     resumen : ${matchEndA.summary}`);
  console.log(`     premios : ganador +${matchEndA.payout.winnerSeasonPoints} SP · perdedor +${matchEndA.payout.loserSeasonPoints} SP`);

  clientA.close();
  clientB.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await new Promise((resolve) => server.close(resolve));

  clearTimeout(timeoutHandle);
  console.log('\n🎉 ¡DUELO 1v1 VERIFICADO AL 100%! Semilla determinista, relé de ticks y árbitro del servidor.');
}

runDuelTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ FALLO EN LA PRUEBA DE DUELO:', err.message);
    process.exit(1);
  });
