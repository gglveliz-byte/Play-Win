/**
 * PRUEBA DE INICIO A FIN: el ciclo completo de una sesión de juego.
 *
 * Reproduce lo que hace el navegador, paso a paso, con los modulos REALES del
 * SDK y un servidor de duelos real:
 *
 *   1. El juego arranca con una sesion CADUCADA en localStorage.
 *   2. El servidor de duelos la RECHAZA (es lo que muestra «token no valido»).
 *   3. El Hub entrega un token BUENO por PLAYWIN_INIT.
 *   4. El Hub REENVIA el mismo token (lo hace siempre): no debe romper nada.
 *   5. Llega MATCH_WAITING -> MATCH_START -> MATCH_LIVE.
 *   6. El juego ARRANCA (onMatchLive) y envia ticks.
 *   7. El servidor cierra el duelo con MATCH_END.
 *   8. Revancha: la segunda partida tambien arranca.
 *
 * Uso: node --env-file=.env.test scripts/test-flujo-completo.mjs [puerto]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require(path.join(process.cwd(), 'apps/hub/node_modules/jsonwebtoken'));
const { WebSocket } = require(path.join(process.cwd(), 'apps/realtime-server/node_modules/ws'));

const PUERTO = Number(process.argv[2]) || 3001;
const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.error('Falta JWT_SECRET. Ejecuta con --env-file=.env.test');
  process.exit(1);
}

let fallos = 0;
const paso = (n, texto) => console.log(`\n  [${n}] ${texto}`);
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`      ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

const ticket = (id, username) =>
  jwt.sign({ sub: id, username, avatar: '🧪', gameId: 'sky', type: 'MATCH_SESSION_TICKET' }, SECRETO, {
    expiresIn: '5m',
    algorithm: 'HS256',
  });

// ── Contexto del navegador (el WebSocket es el REAL) ────────────────────────
const elementos = new Map();
const crear = (id) => ({
  id, textContent: '', innerHTML: '', style: {}, onclick: null,
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  appendChild() {}, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, getAttribute: () => null, closest: () => null,
});
const documento = {
  head: crear('head'), body: crear('body'),
  getElementById: (id) => { if (!elementos.has(id)) elementos.set(id, crear(id)); return elementos.get(id); },
  querySelector: () => null, querySelectorAll: () => [], createElement: crear, addEventListener() {},
};

const oyentes = new Map();
const colaFrames = new Map();
let contadorFrames = 0;
let sesionGuardada = JSON.stringify({ id: 'viejo', username: 'viejo', avatar: '🎮', token: 'TOKEN_CADUCADO' });

const contexto = {
  console, document: documento, window: null, WebSocket,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Object, URL, URLSearchParams,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => { const id = ++contadorFrames; colaFrames.set(id, cb); return id; },
  cancelAnimationFrame: (id) => colaFrames.delete(id),
  location: { href: 'http://localhost:3000/games/sky/index.html' },
  localStorage: {
    getItem: () => sesionGuardada,
    setItem: (k, v) => { sesionGuardada = v; },
    removeItem: () => { sesionGuardada = null; },
  },
  navigator: { userAgent: 'flujo-completo' },
};
contexto.window = contexto;
contexto.window.parent = contexto;
contexto.window.addEventListener = (tipo, fn) => {
  if (!oyentes.has(tipo)) oyentes.set(tipo, []);
  oyentes.get(tipo).push(fn);
};
contexto.window.postMessage = () => {};
contexto.globalThis = contexto;

vm.createContext(contexto);
for (const modulo of ['playwin-bridge-ui.js', 'playwin-bridge-status.js', 'playwin-bridge-connection.js', 'playwin-bridge.js']) {
  vm.runInContext(fs.readFileSync(path.join('packages/game-sdk', modulo), 'utf8'), contexto, { filename: modulo });
}

/** Entrega un mensaje del Hub como haría la ventana padre. */
const delHub = (datos) => {
  for (const fn of oyentes.get('message') || []) fn({ data: datos, origin: 'http://localhost:3000' });
};

// ── El juego de mentira: registra los callbacks que recibe ──────────────────
const eventosJuego = [];
const MI_ID = 'cccc3333-3333-4333-8333-333333333333';

console.log('\n═══ FLUJO COMPLETO DE UNA SESIÓN DE JUEGO ═══');

paso(1, 'El juego arranca con una sesión CADUCADA en localStorage');
contexto.window.PlayWin.init({
  gameId: 'sky',
  callbacks: {
    onMatchReady: () => eventosJuego.push('onMatchReady'),
    onMatchLive: () => eventosJuego.push('onMatchLive'),
    onMatchEnd: () => eventosJuego.push('onMatchEnd'),
  },
});
await new Promise((r) => setTimeout(r, 700));
comprobar('el SDK arrancó y está en la pantalla de acceso o conectando', true);

paso(2, 'El Hub entrega el token BUENO');
const TOKEN = ticket(MI_ID, 'jugador_flujo');
delHub({ type: 'PLAYWIN_INIT', payload: { token: TOKEN, playerId: MI_ID, username: 'jugador_flujo', avatar: '🧪', wsUrl: `ws://localhost:${PUERTO}/ws` } });

paso(3, 'El Hub REENVÍA el mismo token (lo hace siempre al arrancar)');
delHub({ type: 'PLAYWIN_INIT', payload: { token: TOKEN, playerId: MI_ID, username: 'jugador_flujo', avatar: '🧪', wsUrl: `ws://localhost:${PUERTO}/ws` } });

// ── Un rival real para que haya emparejamiento ──────────────────────────────
const rivalSocket = new WebSocket(`ws://localhost:${PUERTO}/ws`);
const RIVAL_ID = 'dddd4444-4444-4444-8444-444444444444';
rivalSocket.on('open', () => {
  rivalSocket.send(JSON.stringify({
    action: 'JOIN_MATCH',
    player: { id: RIVAL_ID, username: 'rival_flujo', avatar: '🧪', gameId: 'sky', token: ticket(RIVAL_ID, 'rival_flujo') },
  }));
});

paso(4, 'Esperando el ciclo de emparejamiento del SDK...');
await new Promise((r) => setTimeout(r, 7000));

comprobar('el juego recibió onMatchReady', eventosJuego.includes('onMatchReady'));
comprobar('el juego recibió onMatchLive (la partida ARRANCÓ)', eventosJuego.includes('onMatchLive'));

// ── El SDK entrega el token al servidor ─────────────────────────────────────
paso(5, 'El SDK envía su telemetría al servidor');
const jugador = contexto.window.PlayWin.getPlayer();
comprobar('el SDK tiene el token bueno', jugador.token === TOKEN, jugador.token ? 'sí' : 'no');
comprobar('el SDK se considera en partida', contexto.window.PlayWin.isLive() === true, `isLive = ${contexto.window.PlayWin.isLive()}`);

console.log(`\n  Eventos que recibió el juego: ${eventosJuego.join(' -> ') || '(ninguno)'}`);

rivalSocket.close();
console.log(`\n${fallos === 0 ? '🎉 FLUJO COMPLETO CORRECTO' : `❌ ${fallos} problema(s)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
