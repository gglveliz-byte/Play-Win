/**
 * SIMULADOR DE ESCRITORIO DEL SDK
 * ==============================================================================
 * Ejecuta el SDK REAL (los 4 módulos) dentro de Node, con un DOM mínimo y un
 * juego falso que registra cada callback. Se conecta al servidor de duelos real
 * con un ticket firmado, igual que haría el navegador.
 *
 * Objetivo: responder sin navegador a la pregunta
 *   ¿el SDK entrega MATCH_START y MATCH_LIVE al juego, o se pierde por el camino?
 *
 * Uso: node --env-file=.env.test scripts/simulate-sdk-client.mjs [juego] [puerto]
 * ==============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocket } = require(path.join(process.cwd(), 'apps/realtime-server/node_modules/ws'));
const jwt = require(path.join(process.cwd(), 'apps/hub/node_modules/jsonwebtoken'));

const JUEGO = process.argv[2] || 'carreras';
const PUERTO = Number(process.argv[3]) || 3001;
const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.error('Falta JWT_SECRET. Ejecuta con --env-file=.env.test');
  process.exit(1);
}

const inicio = Date.now();
const t = () => String(Date.now() - inicio).padStart(5) + 'ms';
const registro = [];

// ── DOM mínimo ───────────────────────────────────────────────────────────────
/** Crea un elemento falso con la API que el SDK necesita. */
function crearElemento(id) {
  const clases = new Set();
  const el = {
    id,
    tagName: 'DIV',
    textContent: '',
    innerHTML: '',
    style: {},
    onclick: null,
    children: [],
    classList: {
      add: (c) => clases.add(c),
      remove: (c) => clases.delete(c),
      contains: (c) => clases.has(c),
      toggle: (c, fuerza) => (fuerza === false ? clases.delete(c) : clases.add(c)),
    },
    appendChild: (hijo) => el.children.push(hijo),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    getAttribute: () => null,
    setAttribute: () => {},
    closest: () => null,
  };
  return el;
}

const elementos = new Map();
const documento = {
  head: crearElemento('head'),
  body: crearElemento('body'),
  getElementById: (id) => {
    if (!elementos.has(id)) elementos.set(id, crearElemento(id));
    return elementos.get(id);
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => crearElemento(tag),
  addEventListener: () => {},
};

// El markup real del SDK necesita insertarse en el contenedor de la UI.
const elementoUi = documento.getElementById('playwin-ui-layer');

// ── Contexto del navegador falso ─────────────────────────────────────────────
/** Cola de frames: un único temporizador atiende a todos los requestAnimationFrame. */
const colaFrames = new Map();
let contadorFrames = 0;

/** Oyentes de eventos registrados por el SDK (se usan para el handshake). */
const oyentes = new Map();

/**
 * WebSocket FALSO que el simulador controla.
 *
 * La librería `ws` no emite eventos cuando se instancia dentro del contexto
 * aislado (vm) de este simulador, así que no sirve para probar el SDK aquí. Con
 * este doble se entrega al SDK exactamente la misma secuencia de mensajes que
 * envía el servidor real, y además se registra lo que el SDK DEVUELVE.
 */
const enviadosPorElSdk = [];
let socketFalso = null;

class WebSocketFalso {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instancias = [];

  constructor(url) {
    this.url = url;
    this.readyState = WebSocketFalso.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    WebSocketFalso.instancias.push(this);
    socketFalso = this;
  }

  send(datos) {
    enviadosPorElSdk.push(JSON.parse(datos));
  }

  close() {
    this.readyState = WebSocketFalso.CLOSED;
    if (this.onclose) this.onclose({ code: 1000 });
  }

  /** Simula que el servidor acepta la conexión. */
  simularApertura() {
    this.readyState = WebSocketFalso.OPEN;
    if (this.onopen) this.onopen();
  }

  /** Simula un mensaje del servidor. */
  simularMensaje(objeto) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(objeto) });
  }
}

const contexto = {
  console,
  document: documento,
  window: null,
  WebSocket: WebSocketFalso,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Object,
  Buffer,
  // Globales que usa la librería `ws` internamente. Sin ellos, el constructor del
  // WebSocket lanza una excepción en un contexto aislado (vm) y la conexión no
  // llega a establecerse nunca, sin ningún error visible.
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  parseInt,
  parseFloat,
  isNaN,
  Error,
  TypeError,
  RangeError,
  Promise,
  Map,
  Set,
  Symbol,
  Number,
  String,
  Boolean,
  Array,
  RegExp,
  Function,
  Reflect,
  Proxy,
  globalThis: null,
  process,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => {
    // Un solo temporizador para todos los frames. La versión anterior creaba un
    // intervalo por llamada: el SDK pide un frame cada 16 ms y cada frame pedía
    // otro, así que el número de temporizadores se multiplicaba sin fin hasta
    // agotar la memoria (4 GB).
    const id = ++contadorFrames;
    colaFrames.set(id, cb);
    return id;
  },
  cancelAnimationFrame: (id) => colaFrames.delete(id),
  location: { href: `http://localhost:3000/games/${JUEGO}/index.html` },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { userAgent: 'node-simulador' },
};
contexto.window = contexto;
contexto.window.parent = contexto;
contexto.window.addEventListener = (tipo, fn) => {
  if (!oyentes.has(tipo)) oyentes.set(tipo, []);
  oyentes.get(tipo).push(fn);
};
contexto.window.postMessage = () => {};

/**
 * Entrega un mensaje como lo haría el Hub desde la ventana padre.
 * El SDK obtiene el token EXCLUSIVAMENTE por este camino (PLAYWIN_INIT),
 * nunca desde init(): por eso el simulador debe reproducirlo.
 */
function enviarMensajeDelHub(datos) {
  const evento = { data: datos, origin: 'http://localhost:3000', source: contexto.window };
  for (const fn of oyentes.get('message') || []) {
    try {
      fn(evento);
    } catch (err) {
      console.error('[simulador] error en el oyente de mensajes:', err.message);
    }
  }
}
contexto.window.PLAYWIN_WS_URL = `ws://localhost:${PUERTO}/ws`;
contexto.globalThis = contexto;

// ── Cargar los 4 módulos REALES del SDK en el contexto ───────────────────────
const MODULOS = [
  'playwin-bridge-ui.js',
  'playwin-bridge-status.js',
  'playwin-bridge-connection.js',
  'playwin-bridge.js',
];

vm.createContext(contexto);

// Bucle de frames del navegador falso: atiende la cola a ~60 fps.
const bucleFrames = setInterval(() => {
  if (colaFrames.size === 0) return;
  const pendientes = [...colaFrames.entries()];
  colaFrames.clear();
  for (const [, cb] of pendientes) {
    try {
      cb(Date.now());
    } catch (err) {
      console.error('[simulador] error en requestAnimationFrame:', err.message);
    }
  }
}, 16);
bucleFrames.unref?.();

for (const modulo of MODULOS) {
  const ruta = path.join('packages/game-sdk', modulo);
  const codigo = fs.readFileSync(ruta, 'utf8');
  try {
    vm.runInContext(codigo, contexto, { filename: ruta });
    console.log(`  ✅ cargado ${modulo}`);
  } catch (err) {
    console.error(`  ❌ ${modulo} falló al cargar: ${err.message}`);
    process.exit(1);
  }
}

if (!contexto.window.PlayWin) {
  console.error('\n❌ El SDK no expuso window.PlayWin');
  process.exit(1);
}

// ── El juego falso: registra cada callback ───────────────────────────────────
console.log('\n--- Inicializando el SDK como lo hace un juego ---');
const token = jwt.sign(
  { sub: '33333333-3333-4333-8333-333333333333', username: 'simulador', avatar: '🧪', gameId: JUEGO, type: 'MATCH_SESSION_TICKET' },
  SECRETO,
  { expiresIn: '5m', algorithm: 'HS256' }
);

contexto.window.PlayWin.init({
  gameId: JUEGO,
  token,
  player: {
    id: '33333333-3333-4333-8333-333333333333',
    username: 'simulador',
    avatar: '🧪',
    token,
  },
  callbacks: {
    onMatchReady: (d) => {
      registro.push('onMatchReady');
      console.log(`  [${t()}] 🎮 JUEGO <- onMatchReady ${JSON.stringify({ seed: d?.seed })}`);
    },
    onMatchLive: (d) => {
      registro.push('onMatchLive');
      console.log(`  [${t()}] 🎮 JUEGO <- onMatchLive ${JSON.stringify({ seed: d?.seed, isResume: d?.isResume })}  <-- AQUÍ ARRANCARÍA LA CARRERA`);
    },
    onMatchEnd: (d) => {
      registro.push('onMatchEnd');
      console.log(`  [${t()}] 🎮 JUEGO <- onMatchEnd ${JSON.stringify(d)}`);
    },
  },
});

// ── Guion: se entrega al SDK la MISMA secuencia que envía el servidor real ───
const SEMILLA = 4926714;
const RIVAL = { username: 'rival_simulado', avatar: '🎯', rank: 'GOLD', score: 0 };

setTimeout(() => {
  console.log(`\n  [${t()}] 📨 HUB -> SDK: PLAYWIN_INIT (con token, como en el navegador)`);
  enviarMensajeDelHub({
    type: 'PLAYWIN_INIT',
    payload: {
      token,
      playerId: '33333333-3333-4333-8333-333333333333',
      username: 'simulador',
      avatar: '🧪',
      rank: 'GOLD',
      skillRating: 1700,
      wsUrl: 'ws://localhost:3001/ws',
    },
  });
}, 200);

setTimeout(() => {
  if (!socketFalso) {
    console.error(`\n  [${t()}] ❌ El SDK NO creó ningún WebSocket tras el handshake.`);
    return;
  }
  console.log(`\n  [${t()}] 🔌 el SDK abrió el WebSocket en ${socketFalso.url}`);
  console.log(`  [${t()}] ⬆ SDK -> servidor: ${JSON.stringify(enviadosPorElSdk[0]?.action)}`);
  console.log(`  [${t()}] ✅ el ticket viaja en player.token: ${!!enviadosPorElSdk[0]?.player?.token}`);
  socketFalso.simularApertura();

  // El servidor confirma que estamos en cola.
  setTimeout(() => {
    console.log(`\n  [${t()}] ⬇ servidor -> SDK: MATCH_WAITING`);
    socketFalso.simularMensaje({ event: 'MATCH_WAITING', gameId: JUEGO, message: 'Buscando contrincante...' });
  }, 200);

  // El servidor empareja.
  setTimeout(() => {
    console.log(`\n  [${t()}] ⬇ servidor -> SDK: MATCH_START { roomId, seed }`);
    socketFalso.simularMensaje({
      event: 'MATCH_START',
      roomId: 'duel_carreras_simulado',
      seed: SEMILLA,
      role: 'PLAYER_A',
      player: { id: '33333333-3333-4333-8333-333333333333', username: 'simulador', avatar: '🧪' },
      opponent: RIVAL,
    });
  }, 500);

  // Tres segundos después (como el servidor real), la partida está en vivo.
  setTimeout(() => {
    console.log(`\n  [${t()}] ⬇ servidor -> SDK: MATCH_LIVE   <-- el momento clave`);
    socketFalso.simularMensaje({ event: 'MATCH_LIVE' });
  }, 3500);
}, 600);

setTimeout(() => {
  console.log('\n═══ VEREDICTO ═══');
  console.log(`  Callbacks recibidos por el juego: ${registro.length ? registro.join(' -> ') : '(NINGUNO)'}`);
  console.log(`  Mensajes que el SDK envió al servidor: ${enviadosPorElSdk.map((m) => m.action).join(', ') || '(ninguno)'}`);
  if (registro.includes('onMatchLive')) {
    console.log('\n  ✅ EL SDK ENTREGA onMatchLive AL JUEGO.');
    console.log('     Si el navegador se queda parado, el fallo está DENTRO del motor del juego');
    console.log('     (startRace/startGame), no en el SDK ni en el servidor.');
  } else if (registro.includes('onMatchReady')) {
    console.log('\n  ⚠️  Solo llegó onMatchReady: MATCH_LIVE no produjo onMatchLive.');
  } else {
    console.log('\n  ❌ El juego NO recibió ningún callback del SDK.');
  }
  clearInterval(bucleFrames);
  process.exit(0);
}, 6000);
