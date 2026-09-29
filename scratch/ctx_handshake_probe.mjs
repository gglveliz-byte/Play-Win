import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import { env } from './load-env.mjs';

/**
 * Sonda de contexto: verifica el protocolo REAL de emparejamiento 1v1
 * con MatchTicket firmado (Zero Client Trust) contra un servidor en :3002.
 * Uso: node scratch/ctx_handshake_probe.mjs
 */
const WS_URL = process.env.WS_URL || 'ws://localhost:3002/ws';
const SECRET = env('JWT_SECRET');
const GAME = 'carreras';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signTicket(sub, username, gameId) {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub,
    username,
    avatar: 'probe.png',
    gameId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const events = [];
const clients = [];

function connect(label, sub, username) {
  const ws = new WebSocket(WS_URL);
  clients.push(ws);
  ws.on('open', () => {
    events.push(`${label}: open -> JOIN_MATCH`);
    ws.send(JSON.stringify({
      action: 'JOIN_MATCH',
      player: { token: signTicket(sub, username, GAME), gameId: GAME },
    }));
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    events.push(`${label}: <- ${msg.event}${msg.seed !== undefined ? ` seed=${msg.seed}` : ''}${msg.message ? ` (${msg.message})` : ''}`);
    if (msg.event === 'MATCH_START') ws.send(JSON.stringify({ action: 'PLAYER_TICK', x: 10, y: 0, score: 42, isAlive: true }));
    if (msg.event === 'MATCH_LIVE') {
      const t = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ action: 'PLAYER_TICK', x: 100, y: 0, score: 150, isAlive: true }));
      }, 50);
      setTimeout(() => {
        clearInterval(t);
        if (ws.readyState === 1) ws.send(JSON.stringify({ action: 'PLAYER_FINISH', score: 150 }));
      }, 1200);
    }
  });
  ws.on('error', (err) => events.push(`${label}: ERROR ${err.message}`));
}

connect('A', 'ctx-probe-a', 'ProbeAlpha');
setTimeout(() => connect('B', 'ctx-probe-b', 'ProbeBeta'), 700);

setTimeout(() => {
  console.log(events.join('\n'));
  const done = events.some((e) => e.includes('MATCH_END'));
  console.log(`\nRESULT: ${done ? 'PROTOCOL OK — match resolved by server' : 'NO MATCH_END — protocol did not complete'}`);
  for (const ws of clients) { try { ws.close(); } catch {} }
  process.exit(done ? 0 : 1);
}, 9000);
