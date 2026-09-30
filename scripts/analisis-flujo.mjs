/**
 * ANÁLISIS DE INICIO A FIN del protocolo de duelos.
 *
 * Recorre una partida COMPLETA contra el servidor real y comprueba cada paso,
 * imprimiendo el reloj del servidor cuando el aviso lo trae. Así se ve de un
 * vistazo en qué paso se rompe algo.
 *
 * Cubre también el caso del usuario: dos jugadores que se quedan sin reportar
 * nada (el juego congelado). Ahí se comprueba que el servidor NO se queda
 * colgado para siempre.
 *
 * Uso: node --env-file=.env.test scripts/analisis-flujo.mjs [puerto]
 */
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocket } = require(path.join(process.cwd(), 'apps/realtime-server/node_modules/ws'));
const jwt = require(path.join(process.cwd(), 'apps/hub/node_modules/jsonwebtoken'));

const PUERTO = Number(process.argv[2]) || 3001;
const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.error('Falta JWT_SECRET. Ejecuta con --env-file=.env.test');
  process.exit(1);
}

const t0 = Date.now();
const t = () => String(Date.now() - t0).padStart(6) + 'ms';
const uuid = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;

const ticket = (id, username) =>
  jwt.sign({ sub: id, username, avatar: '🧪', gameId: 'sky', type: 'MATCH_SESSION_TICKET' }, SECRETO, {
    expiresIn: '5m',
    algorithm: 'HS256',
  });

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

/** Cliente virtual: registra TODO lo que recibe, con marca de tiempo. */
function cliente(etiqueta, num, comportamiento) {
  return new Promise((resolve) => {
    const id = uuid(num);
    const username = `analisis_${etiqueta.toLowerCase()}`;
    const socket = new WebSocket(`ws://localhost:${PUERTO}/ws`);
    const log = [];
    const estado = { etiqueta, id, username, socket, log, crasheo: false, ticks: 0 };

    const anotar = (evento, extra = '') => {
      log.push({ evento, ms: Date.now() - t0 });
      console.log(`  [${t()}] ${etiqueta.padEnd(9)} <- ${evento}${extra}`);
    };

    socket.on('open', () => {
      socket.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: { id, username, avatar: '🧪', gameId: 'sky', token: ticket(id, username) },
      }));
    });

    socket.on('message', (bruto) => {
      const m = JSON.parse(bruto.toString());
      let extra = '';
      if (m.event === 'MATCH_START') extra = ` semilla=${m.seed} rol=${m.role} rival=${m.opponent?.username}`;
      if (m.event === 'MATCH_END') extra = ` motivo=${m.reason} ganador=${m.winnerId} dibuja=${m.isDraw}`;
      if (m.event === 'SECURITY_ERROR' || m.event === 'SECURITY_WARNING') extra = ` "${m.message}"`;
      anotar(m.event, extra);

      if (m.event === 'MATCH_LIVE') {
        comportamiento.alVivir(estado, socket);
      }
      if (m.event === 'MATCH_END') {
        estado.fin = m;
      }
    });

    socket.on('error', (e) => anotar('ERROR', ` ${e.message}`));
    socket.on('close', () => anotar('SOCKET_CERRADO'));
    resolve(estado);
  });
}

/** Comportamiento normal: juega y cae. */
const juegaYCae = (retrasoMs) => ({
  alVivir(estado, socket) {
    const reloj = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return clearInterval(reloj);
      estado.ticks++;
      socket.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 0, score: 3, isAlive: true }));
    }, 50);
    setTimeout(() => {
      clearInterval(reloj);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
        console.log(`  [${t()}] ${estado.etiqueta.padEnd(9)} -> reporta su caída tras ${retrasoMs}ms`);
      }
    }, retrasoMs);
  },
});

/** Comportamiento del fallo: el juego se queda congelado y NO reporta nada. */
const seCongela = () => ({
  alVivir(estado, socket) {
    const reloj = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return clearInterval(reloj);
      estado.ticks++;
      socket.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 0, score: 3, isAlive: true }));
    }, 50);
    setTimeout(() => {
      clearInterval(reloj);
      console.log(`  [${t()}] ${estado.etiqueta.padEnd(9)} -> DEJA de enviar ticks (juego congelado)`);
    }, 2000);
  },
});

// ── ESCENARIO 1: partida normal, uno cae ────────────────────────────────────
console.log('\n═══ ESCENARIO 1 · Partida normal: A cae a los 3s ═══\n');
const A = await cliente('A', 'a', juegaYCae(3000));
const B = await cliente('B', 'b', juegaYCae(60000));
await new Promise((r) => setTimeout(r, 12000));

console.log('\n  Resumen escenario 1:');
comprobar('los dos recibieron MATCH_START', A.log.some((l) => l.evento === 'MATCH_START') && B.log.some((l) => l.evento === 'MATCH_START'));
comprobar('los dos recibieron MATCH_LIVE', A.log.some((l) => l.evento === 'MATCH_LIVE') && B.log.some((l) => l.evento === 'MATCH_LIVE'));
comprobar('los dos recibieron MATCH_END', !!A.fin && !!B.fin);
comprobar('gana B (el que NO cayó)', A.fin?.winnerId === B.id, `ganador=${A.fin?.winnerId} · B es ${B.id}`);
comprobar('el aviso NO es empate', A.fin?.isDraw !== true);

// Desfase entre MATCH_START y MATCH_LIVE: debe ser ~3000ms (el countdown)
const desfase = (c) => {
  const s = c.log.find((l) => l.evento === 'MATCH_START');
  const v = c.log.find((l) => l.evento === 'MATCH_LIVE');
  return s && v ? v.ms - s.ms : null;
};
const dA = desfase(A);
const dB = desfase(B);
console.log(`\n  Countdown observado: A ${dA}ms · B ${dB}ms (debe ser ~3000ms)`);
comprobar('el countdown dura ~3000ms', dA > 2800 && dA < 3400, `${dA}ms`);

// Sincronía: los dos deben empezar a la vez
comprobar('los dos arrancan con menos de 150ms de diferencia', Math.abs(dA - dB) < 150, `${Math.abs(dA - dB)}ms de desfase`);

A.socket.close();
B.socket.close();

// ── ESCENARIO 2: LOS DOS SE CONGELAN (el fallo del usuario) ─────────────────
console.log('\n\n═══ ESCENARIO 2 · Los DOS clientes se congelan (el fallo reportado) ═══');
console.log('  Pregunta: ¿el servidor cierra la partida o se queda colgado?\n');

const C = await cliente('C', 'c', seCongela());
const D = await cliente('D', 'd', seCongela());

// Se espera bastante: si el servidor tiene tope de tiempo, debe cerrar antes.
const TOPE_ESPERA_MS = 16000;
console.log(`\n  Esperando hasta ${TOPE_ESPERA_MS / 1000}s a ver si el servidor cierra solo...`);
await new Promise((r) => setTimeout(r, TOPE_ESPERA_MS));

console.log('\n  Resumen escenario 2:');
comprobar('C recibió MATCH_END (el servidor no se quedó colgado)', !!C.fin, C.fin ? `motivo=${C.fin.reason}` : 'SIN RESULTADO');
comprobar('D recibió MATCH_END', !!D.fin, D.fin ? `motivo=${D.fin.reason}` : 'SIN RESULTADO');
comprobar('los dos ven el MISMO resultado', C.fin?.reason === D.fin?.reason, `${C.fin?.reason} vs ${D.fin?.reason}`);

C.socket.close();
D.socket.close();

console.log(`\n${fallos === 0 ? '🎉 FLUJO CORRECTO' : `❌ ${fallos} problema(s) encontrados`}\n`);
process.exit(fallos === 0 ? 0 : 1);
