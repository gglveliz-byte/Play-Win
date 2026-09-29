import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import crypto from 'node:crypto';

import { env } from './load-env.mjs';

const JWT_SECRET = env('JWT_SECRET');

function createToken(sub, username) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub, username, gameId: 'carreras', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

const tokenA = createToken('usr_playerA', 'progamer2026');
const tokenB = createToken('usr_playerB', 'carlos_pro');

console.log('🧪 [Test 2 Humanos 1v1] Probando emparejamiento instantáneo humano vs humano...');

const wsA = new WebSocket('ws://localhost:3001/ws');
const wsB = new WebSocket('ws://localhost:3001/ws');

let paired = false;

wsA.on('open', () => {
  wsA.send(JSON.stringify({
    action: 'JOIN_MATCH',
    player: { id: 'usr_playerA', username: 'progamer2026', avatar: '🏎️', gameId: 'carreras', token: tokenA }
  }));
  console.log('👤 Jugador A (progamer2026) entró a la cola.');

  // Jugador B entra 400ms después
  setTimeout(() => {
    wsB.send(JSON.stringify({
      action: 'JOIN_MATCH',
      player: { id: 'usr_playerB', username: 'carlos_pro', avatar: '🎯', gameId: 'carreras', token: tokenB }
    }));
    console.log('👤 Jugador B (carlos_pro) entró a la cola.');
  }, 400);
});

wsA.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.event === 'MATCH_START') {
    paired = true;
    console.log('🎉 Jugador A recibió MATCH_START contra:', msg.opponent.username);
  }
});

wsB.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.event === 'MATCH_START') {
    console.log('🎉 Jugador B recibió MATCH_START contra:', msg.opponent.username);
    console.log('✅ ¡EMPAREJAMIENTO HUMANO VS HUMANO INSTANTÁNEO VERIFICADO!');
    wsA.close();
    wsB.close();
    process.exit(0);
  }
});

setTimeout(() => {
  if (!paired) {
    console.error('❌ FALLÓ: No se emparejaron los dos humanos.');
    process.exit(1);
  }
}, 5000);
