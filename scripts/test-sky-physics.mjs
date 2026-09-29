/**
 * Prueba la física extraída de Sky Runner 3D (js/physics.js) fuera del navegador.
 *
 * Lo importante que se comprueba aquí:
 *   1. ANTES de la partida el escenario NO avanza (el fallo de «jugar solito»).
 *   2. Durante la partida sólo se avanza en PLAYING.
 *   3. Caer al abismo avisa UNA sola vez.
 *   4. Tras el duelo el escenario se queda quieto.
 *
 * Uso: node scripts/test-sky-physics.mjs
 */
import { pasoDeFisica, ALTURA_CAIDA } from '../apps/hub/public/games/sky/js/physics.js';
import { TrackManager } from '../apps/hub/public/games/sky/js/prng.js';

const CARRILES = 7;
const LIMITE_X = CARRILES / 2 - 0.1;
const carrilDe = (x) => Math.min(CARRILES - 1, Math.max(0, Math.floor(x + CARRILES / 2)));

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

/** Estado inicial igual al del motor. */
function nuevoEstado(extra = {}) {
  return {
    gameState: 'IDLE',
    x: 0, y: 0, z: 0, vy: 0,
    steerInput: 0, jumpHeld: false, jumpBufferTimer: 0,
    touchDriving: false, touchSteer: 0,
    keyLeft: false, keyRight: false,
    vistaPrevia: 0, pasosVivo: 0, puntuacion: 0,
    Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
    Lerp: (p, a, b) => a + Math.min(Math.max(p, 0, 1), 1) * (b - a),
    ...extra,
  };
}

const deps = (trackManager, caidas) => ({
  limiteX: LIMITE_X,
  carrilDe,
  trackManager,
  audio: { playJump() {}, playGameOver() {} },
  alCaer: () => caidas.push(1),
});

console.log('\n═══ FÍSICA DE SKY RUNNER 3D ═══\n');

// ── 1. Antes de la partida el escenario NO avanza ───────────────────────────
console.log('  Antes de la partida (el fallo de «jugar solito»):');
for (const estadoInicial of ['IDLE', 'READY']) {
  const st = nuevoEstado({ gameState: estadoInicial });
  const pista = new TrackManager(123456);
  const caidas = [];
  for (let i = 0; i < 300; i++) pasoDeFisica(st, deps(pista, caidas));
  comprobar(`en ${estadoInicial} no se avanza (z sigue en 0)`, st.z === 0, `z = ${st.z}`);
  comprobar(`en ${estadoInicial} no se puntúa`, st.puntuacion === 0, `puntuación = ${st.puntuacion}`);
  comprobar(`en ${estadoInicial} no se puede caer`, caidas.length === 0, `${caidas.length} caídas`);
  comprobar(`en ${estadoInicial} el estado no cambia solo`, st.gameState === estadoInicial, st.gameState);
}

// ── 2. Durante la partida sí se avanza y se puntúa ──────────────────────────
// Se simulan sólo 3 segundos: con el carril por defecto el jugador cae alrededor
// del segundo 4, y tras caer la puntuación deja de subir (que es lo correcto).
console.log('\n  Durante la partida:');
const stJuego = nuevoEstado({ gameState: 'PLAYING' });
const pistaJuego = new TrackManager(4926714);
const caidasJuego = [];
for (let i = 0; i < 180; i++) pasoDeFisica(stJuego, deps(pistaJuego, caidasJuego));
comprobar('se avanza por el circuito', stJuego.z > 0, `z = ${stJuego.z.toFixed(1)}`);
comprobar('la puntuación es el tiempo sobrevivido', stJuego.puntuacion === 3, `${stJuego.puntuacion} s tras 180 pasos (3 s)`);
comprobar('sigue vivo a los 3 s', stJuego.gameState === 'PLAYING', stJuego.gameState);

// ── 3. La puntuación crece con el tiempo, no con la distancia ───────────────
console.log('\n  La puntuación mide tiempo, no distancia:');
const stA = nuevoEstado({ gameState: 'PLAYING' });
const stB = nuevoEstado({ gameState: 'PLAYING' });
const pA = new TrackManager(1);
const pB = new TrackManager(999999);
for (let i = 0; i < 600; i++) {
  pasoDeFisica(stA, deps(pA, []));
  pasoDeFisica(stB, deps(pB, []));
}
comprobar(
  'dos partidas distintas dan la MISMA puntuación al mismo tiempo',
  stA.puntuacion === stB.puntuacion,
  `${stA.puntuacion} vs ${stB.puntuacion}`
);

// ── 4. Caer avisa una sola vez ──────────────────────────────────────────────
console.log('\n  Caída al abismo:');
const stCaida = nuevoEstado({ gameState: 'PLAYING' });
const pistaCaida = new TrackManager(4926714);
const caidas = [];
// Fuerza la caída dejando al jugador en un carril sin pista y sin saltar.
stCaida.x = LIMITE_X;
for (let i = 0; i < 900; i++) pasoDeFisica(stCaida, deps(pistaCaida, caidas));
comprobar('el jugador acaba cayendo', stCaida.gameState === 'CRASHED', `estado = ${stCaida.gameState}, y = ${stCaida.y.toFixed(1)}`);
comprobar('el aviso de caída se da EXACTAMENTE una vez', caidas.length === 1, `${caidas.length} avisos`);
comprobar('el estado pasa a CRASHED y no vuelve a jugar', stCaida.gameState === 'CRASHED');
comprobar('la puntuación deja de subir al caer', (() => {
  const antes = stCaida.puntuacion;
  for (let i = 0; i < 120; i++) pasoDeFisica(stCaida, deps(pistaCaida, caidas));
  return stCaida.puntuacion === antes;
})());

// ── 5. Tras el duelo el escenario se queda quieto ───────────────────────────
console.log('\n  Tras terminar el duelo:');
const stFin = nuevoEstado({ gameState: 'IDLE' });
const pistaFin = new TrackManager(123456);
const zAntes = stFin.z;
for (let i = 0; i < 300; i++) pasoDeFisica(stFin, deps(pistaFin, []));
comprobar('el escenario no se mueve solo', stFin.z === zAntes, `z = ${stFin.z}`);

// ── 6. NINGÚN campo del estado se pierde al pasar por la física ─────────────
//
// Este es el fallo que dejó el canvas EN NEGRO: el motor copiaba el estado, se lo
// pasaba a la física y lo leía de vuelta, pero un campo se quedaba fuera de la
// copia y volvía como `undefined`. Con `gameState` en undefined ninguna rama de
// la simulación se ejecuta y no se dibuja nada. Se comprueba campo por campo.
console.log('\n  Integridad del estado (el fallo del canvas en negro):');
const CAMPOS = ['gameState', 'x', 'y', 'z', 'vy', 'steerInput', 'jumpHeld', 'jumpBufferTimer',
  'touchDriving', 'touchSteer', 'keyLeft', 'keyRight', 'vistaPrevia', 'pasosVivo', 'puntuacion'];

for (const campo of CAMPOS) {
  const st = nuevoEstado({ gameState: 'PLAYING' });
  const antes = st[campo];
  pasoDeFisica(st, deps(new TrackManager(1), []));
  const despues = st[campo];
  const sePerdio = despues === undefined && antes !== undefined;
  comprobar(`  ${campo.padEnd(17)} sobrevive`, !sePerdio, `antes ${JSON.stringify(antes)} -> después ${JSON.stringify(despues)}`);
}

// `gameState` es el crítico: si se pierde, no se dibuja NADA.
const stCritico = nuevoEstado({ gameState: 'PLAYING' });
pasoDeFisica(stCritico, deps(new TrackManager(1), []));
comprobar('el estado del juego NO queda indefinido (causa del canvas negro)', stCritico.gameState !== undefined, `gameState = ${JSON.stringify(stCritico.gameState)}`);

console.log(`\n${fallos === 0 ? '🎉 FÍSICA CORRECTA' : `❌ ${fallos} comprobación(es) fallaron`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
