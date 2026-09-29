/**
 * Comprueba si el servidor declara EMPATE de verdad cuando los dos jugadores
 * caen a la vez, o si acaba marcando un ganador arbitrario.
 *
 * Se conectan dos clientes reales al servidor de duelos, se emparejan, y ambos
 * reportan PLAYER_CRASHED prácticamente al mismo tiempo. Luego se comprueba qué
 * MATCH_END recibe cada uno.
 *
 * Uso: node --env-file=.env.test scripts/test-empate-real.mjs [puerto]
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

const inicio = Date.now();
const t = () => String(Date.now() - inicio).padStart(6) + 'ms';
const JUEGO = 'sky';

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

const ticket = (id, username) =>
  jwt.sign({ sub: id, username, avatar: '🧪', gameId: JUEGO, type: 'MATCH_SESSION_TICKET' }, SECRETO, {
    expiresIn: '5m',
    algorithm: 'HS256',
  });

/** Crea un cliente que reporta una caída tras `retrasoMs` desde MATCH_LIVE. */
function crearJugador(etiqueta, id, username, retrasoMs) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://localhost:${PUERTO}/ws`);
    const estado = { etiqueta, recibidos: [], matchEnd: null, vivo: false, socket };

    socket.on('open', () => {
      socket.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: { id, username, avatar: '🧪', gameId: JUEGO, token: ticket(id, username) },
      }));
    });

    socket.on('message', (bruto) => {
      const msg = JSON.parse(bruto.toString());
      estado.recibidos.push(msg.event);

      if (msg.event === 'MATCH_LIVE') {
        estado.vivo = true;
        // Envía un tick para que el servidor tenga una puntuación (= tiempo vivo).
        socket.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 0, score: 3, isAlive: true }));
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
            console.log(`  [${t()}] ${etiqueta}: reporta su caída (${retrasoMs}ms tras LIVE)`);
          }
        }, retrasoMs);
      }

      if (msg.event === 'MATCH_END') {
        estado.matchEnd = msg;
        console.log(
          `  [${t()}] ${etiqueta} <- MATCH_END · motivo=${msg.reason} · ganador=${msg.winnerId} · "${msg.summary}"`
        );
      }
    });

    socket.on('error', (e) => console.log(`  [${t()}] ${etiqueta} ERROR: ${e.message}`));
    resolve(estado);
  });
}

console.log('\n═══ ¿SE DECLARA EMPATE CUANDO CAEN LOS DOS? ═══\n');
console.log(`  Servidor: ws://localhost:${PUERTO}/ws\n`);

const A = await crearJugador('JUGADOR-A', 'aaaa1111-1111-4111-8111-111111111111', 'prueba_alfa', 0);
const B = await crearJugador('JUGADOR-B', 'bbbb2222-2222-4222-8222-222222222222', 'prueba_beta', 60);

// Se les da tiempo a emparejarse, jugar y caer.
await new Promise((r) => setTimeout(r, 9000));

console.log('\n═══ VEREDICTO ═══');
comprobar('los dos recibieron MATCH_LIVE', A.vivo && B.vivo);
comprobar('los dos recibieron MATCH_END (nadie se queda colgado)', !!A.matchEnd && !!B.matchEnd);

if (A.matchEnd && B.matchEnd) {
  const mismoGanador = A.matchEnd.winnerId === B.matchEnd.winnerId;
  comprobar('los dos ven el MISMO ganador', mismoGanador, `A ve ${A.matchEnd.winnerId} · B ve ${B.matchEnd.winnerId}`);

  const motivo = A.matchEnd.reason;
  const resumen = A.matchEnd.summary || '';
  const esEmpate = A.matchEnd.isDraw === true || motivo === 'DRAW';

  console.log(`\n  Motivo: ${motivo}`);
  console.log(`  isDraw: ${A.matchEnd.isDraw}`);
  console.log(`  Resumen: "${resumen}"`);

  comprobar('el aviso lleva isDraw (la interfaz mostrará EMPATE)', esEmpate);
  comprobar('no se declara ganador', A.matchEnd.winnerId === null, `winnerId = ${A.matchEnd.winnerId}`);
  comprobar('el motivo es DRAW', motivo === 'DRAW', motivo);

  const pA = A.matchEnd.payout;
  const pB = B.matchEnd.payout;
  console.log(`  Puntos A: ${JSON.stringify(pA)}`);
  console.log(`  Puntos B: ${JSON.stringify(pB)}`);
  comprobar('los DOS reciben los MISMOS puntos', pA.winnerSeasonPoints === pB.winnerSeasonPoints, `${pA.winnerSeasonPoints} vs ${pB.winnerSeasonPoints}`);
  comprobar('nadie cobra los 100 puntos de victoria', pA.winnerSeasonPoints < 100, `${pA.winnerSeasonPoints} puntos cada uno`);
}

for (const e of [A, B]) e.socket.close();
console.log(`\n${fallos === 0 ? '🎉 RESOLUCIÓN CORRECTA' : `❌ ${fallos} problema(s)`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
