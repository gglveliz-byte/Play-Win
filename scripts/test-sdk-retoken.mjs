/**
 * Prueba que un TOKEN NUEVO siempre fuerza la reconexión.
 *
 * Bug que cubre: si el SDK ya tenía un socket abierto (por ejemplo con un token
 * caducado leído de localStorage), al llegar `PLAYWIN_INIT` con un token válido
 * NO se reconectaba, porque la comprobación era `if (!isSocketOpen())`. El
 * jugador se quedaba en «ACCESO REQUERIDO · Token de partida no válido o
 * expirado» teniendo un token bueno en la mano.
 *
 * Uso: node scripts/test-sdk-retoken.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

// ── WebSocket falso que cuenta aperturas ────────────────────────────────────
const sockets = [];
class WebSocketFalso {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = WebSocketFalso.CONNECTING;
    this.enviados = [];
    this.onopen = this.onclose = this.onerror = this.onmessage = null;
    sockets.push(this);
  }
  send(d) { this.enviados.push(JSON.parse(d)); }
  close() {
    this.readyState = WebSocketFalso.CLOSED;
    // Deliberadamente NO se llama a onclose: el SDK anula los manejadores antes
    // de cerrar, y aquí se comprueba justamente eso.
  }
  abrir() { this.readyState = WebSocketFalso.OPEN; if (this.onopen) this.onopen(); }
  recibir(obj) { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }
}

// ── DOM y contexto mínimos ──────────────────────────────────────────────────
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

const contexto = {
  console, document: documento, window: null,
  WebSocket: WebSocketFalso,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Object, URL, URLSearchParams,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => { const id = ++contadorFrames; colaFrames.set(id, cb); return id; },
  cancelAnimationFrame: (id) => colaFrames.delete(id),
  location: { href: 'http://localhost:3000/games/sky/index.html' },
  // Sesión VIEJA en localStorage: es la causa del token caducado.
  localStorage: {
    getItem: () => JSON.stringify({ id: 'viejo', username: 'viejo', avatar: '🎮', token: 'TOKEN_CADUCADO' }),
    setItem() {}, removeItem() {},
  },
  navigator: { userAgent: 'simulador' },
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
function delHub(datos) {
  for (const fn of oyentes.get('message') || []) fn({ data: datos, origin: 'http://localhost:3000' });
}

console.log('\n═══ ¿UN TOKEN NUEVO FUERZA LA RECONEXIÓN? ═══\n');

// 1. El SDK arranca y conecta con el token caducado de localStorage.
contexto.window.PlayWin.init({ gameId: 'sky', callbacks: {} });

// El SDK conecta tras su temporizador de arranque; se le da margen.
await new Promise((r) => setTimeout(r, 700));

const primerSocket = sockets[0];
comprobar('el SDK abrió un socket con la sesión vieja', !!primerSocket, primerSocket ? primerSocket.url : 'ninguno');

if (primerSocket) {
  primerSocket.abrir();
  const tokenEnviado = primerSocket.enviados[0]?.player?.token;
  comprobar('ese socket llevaba el token CADUCADO', tokenEnviado === 'TOKEN_CADUCADO', String(tokenEnviado));

  // 2. El servidor lo rechaza: es lo que muestra «Token no válido o expirado».
  primerSocket.recibir({ event: 'SECURITY_ERROR', message: 'Token de partida no válido o expirado.' });
}

const socketsAntes = sockets.length;

// 3. El Hub entrega un token NUEVO y válido.
delHub({
  type: 'PLAYWIN_INIT',
  payload: {
    token: 'TOKEN_NUEVO_VALIDO',
    playerId: 'nuevo',
    username: 'jugador',
    avatar: '🧪',
    wsUrl: 'ws://localhost:3001/ws',
  },
});

await new Promise((r) => setTimeout(r, 300));

// 4. Lo que importa: ¿se abrió un socket NUEVO con el token nuevo?
const socketNuevo = sockets[sockets.length - 1];
const seReconecto = sockets.length > socketsAntes;

comprobar('se abrió un socket NUEVO al recibir el token bueno', seReconecto, `sockets: ${socketsAntes} -> ${sockets.length}`);
comprobar(
  'el socket viejo quedó DESCARTADO',
  !primerSocket || primerSocket.readyState === WebSocketFalso.CLOSED,
  primerSocket ? `estado ${primerSocket.readyState}` : 'no había'
);

if (socketNuevo && seReconecto) {
  socketNuevo.abrir();
  const enviado = socketNuevo.enviados[0]?.player?.token;
  comprobar('el socket nuevo lleva el token BUENO', enviado === 'TOKEN_NUEVO_VALIDO', String(enviado));
}

// ── 5. El Hub reenvía el MISMO token: NO debe reconectar ────────────────────
//
// El Hub envía PLAYWIN_INIT dos veces al arrancar (al cargar el iframe y cuando
// el SDK avisa PLAYWIN_READY) con el mismo token. Reconectar en la segunda
// destruía el socket vivo y se perdía la partida en curso.
console.log('\n  Segundo aviso del Hub con el MISMO token:');
const socketsTrasSegundo = sockets.length;
const socketActivo = sockets[sockets.length - 1];

delHub({
  type: 'PLAYWIN_INIT',
  payload: {
    token: 'TOKEN_NUEVO_VALIDO',
    playerId: 'nuevo',
    username: 'jugador',
    avatar: '🧪',
    wsUrl: 'ws://localhost:3001/ws',
  },
});

await new Promise((r) => setTimeout(r, 300));

comprobar(
  'NO se abre otro socket cuando el token es el mismo',
  sockets.length === socketsTrasSegundo,
  `sockets: ${socketsTrasSegundo} -> ${sockets.length}`
);
comprobar(
  'el socket en curso sigue ABIERTO',
  socketActivo && socketActivo.readyState === WebSocketFalso.OPEN,
  socketActivo ? `estado ${socketActivo.readyState}` : 'no hay'
);

// ── 6. Y si el token SÍ cambia estando conectado, reconecta ─────────────────
console.log('\n  Tercer aviso con un token DISTINTO (p. ej. caducó el anterior):');
const socketsAntesDeTercero = sockets.length;

delHub({
  type: 'PLAYWIN_INIT',
  payload: {
    token: 'TOKEN_RENOVADO',
    playerId: 'nuevo',
    username: 'jugador',
    avatar: '🧪',
    wsUrl: 'ws://localhost:3001/ws',
  },
});

await new Promise((r) => setTimeout(r, 300));

comprobar(
  'con un token distinto SÍ se reconecta',
  sockets.length > socketsAntesDeTercero,
  `sockets: ${socketsAntesDeTercero} -> ${sockets.length}`
);
const socketFinal = sockets[sockets.length - 1];
if (socketFinal && sockets.length > socketsAntesDeTercero) {
  socketFinal.abrir();
  comprobar('el socket final lleva el token renovado', socketFinal.enviados[0]?.player?.token === 'TOKEN_RENOVADO', String(socketFinal.enviados[0]?.player?.token));
}

console.log(`\n${fallos === 0 ? '🎉 EL TOKEN SE GESTIONA CORRECTAMENTE EN LOS DOS SENTIDOS' : `❌ ${fallos} comprobación(es) fallaron`}\n`);

// El SDK deja temporizadores vivos (ping, lerp), así que el proceso no termina
// solo. Se marca el código y se sale explícitamente para no dejar el test colgado.
process.exitCode = fallos === 0 ? 0 : 1;
process.exit(process.exitCode);
