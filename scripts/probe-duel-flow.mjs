/**
 * SONDA DEL PROTOCOLO DE DUELOS
 * ==============================================================================
 * Se conecta al servidor de duelos como un cliente de verdad (dos jugadores),
 * con tickets firmados, y REGISTRA CRONOLÓGICAMENTE todo lo que recibe.
 *
 * Sirve para responder a una sola pregunta: cuando el juego se queda parado,
 * ¿qué dejó de llegar por el WebSocket?
 *
 * Uso: node --env-file=.env.test scripts/probe-duel-flow.mjs [juego] [puerto]
 * ==============================================================================
 */
import { createRequire } from 'node:module';
import path from 'node:path';

// `ws` vive en apps/realtime-server y `jsonwebtoken` en apps/hub. Se resuelven
// explícitamente porque este script corre desde la raíz del monorepo.
const require = createRequire(import.meta.url);
const { WebSocket } = require(path.join(process.cwd(), 'apps/realtime-server/node_modules/ws'));
const jwt = require(path.join(process.cwd(), 'apps/hub/node_modules/jsonwebtoken'));

const JUEGO = process.argv[2] || 'carreras';
const PUERTO = Number(process.argv[3]) || 3001;
const URL_WS = `ws://localhost:${PUERTO}/ws`;

const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.error('Falta JWT_SECRET. Ejecuta con --env-file=.env.test');
  process.exit(1);
}

const inicio = Date.now();
const t = () => String(Date.now() - inicio).padStart(5) + 'ms';
const registro = [];

/** Firma un MatchTicket EXACTAMENTE como lo hace el Hub (apps/hub/src/lib/auth.ts). */
function firmarTicket(id, username) {
  // El Hub firma el identificador en el claim estándar `sub`, y el servidor de
  // duelos lo lee con `player.id = verified.sub`. Si aquí se firmara con `id`,
  // el servidor recibiría `undefined` y NUNCA emparejaría a nadie: exactamente
  // el fallo que se investigaba.
  return jwt.sign(
    { sub: id, username, avatar: '🧪', gameId: JUEGO, type: 'MATCH_SESSION_TICKET' },
    SECRETO,
    { expiresIn: '5m', algorithm: 'HS256' }
  );
}

function crearJugador(etiqueta, id, username) {
  return new Promise((resolve) => {
    const token = firmarTicket(id, username);
    const socket = new WebSocket(URL_WS);
    const estado = { etiqueta, socket, eventos: [], resolucion: resolve, vivo: false };

    socket.on('open', () => {
      console.log(`  [${t()}] ${etiqueta}: conectado -> enviando JOIN_MATCH`);
      socket.send(
        JSON.stringify({
          action: 'JOIN_MATCH',
          // El servidor exige el ticket dentro de `player.token`
          // (rooms.js: `if (!player.token) -> SECURITY_ERROR`).
          player: { id, username, avatar: '🧪', gameId: JUEGO, token },
        })
      );
    });

    socket.on('message', (bruto) => {
      let msg;
      try {
        msg = JSON.parse(bruto.toString());
      } catch {
        msg = { event: '(no JSON)', crudo: bruto.toString().slice(0, 100) };
      }
      estado.eventos.push(msg.event);
      // Se registra TODO, incluidos los avisos de seguridad: antes se ignoraban
      // y por eso el bloqueo por anticolusión pasaba desapercibido.
      console.log(`  [${t()}] ${etiqueta} <- ${msg.event}${msg.message ? ' : ' + msg.message : ''}${msg.reason ? ' (' + msg.reason + ')' : ''}`);
      if (msg.event === 'MATCH_LIVE') {
        estado.vivo = true;
        // A partir de aquí, envía ticks como haría el juego.
        let n = 0;
        estado.ticker = setInterval(() => {
          n++;
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({ action: 'PLAYER_TICK', x: n, y: n * 10, score: n * 7, isAlive: true })
            );
          }
        }, 50);
      }
    });

    socket.on('error', (err) => console.log(`  [${t()}] ${etiqueta} ERROR: ${err.message}`));
    socket.on('close', (codigo) => {
      console.log(`  [${t()}] ${etiqueta} CERRADO (código ${codigo})`);
      clearInterval(estado.ticker);
    });

    registro.push(estado);
    setTimeout(() => resolve(estado), 1000);
  });
}

console.log(`\n🔬 SONDA DEL PROTOCOLO · juego=${JUEGO} · ${URL_WS}\n`);
console.log('--- FASE 1: dos jugadores entran a la cola ---');
const a = await crearJugador('JUGADOR-A', '11111111-1111-4111-8111-111111111111', 'sonda_alfa');
const b = await crearJugador('JUGADOR-B', '22222222-2222-4222-8222-222222222222', 'sonda_beta');

// La partida arranca a los 3 s de emparejar; se observa 8 s en total.
await new Promise((r) => setTimeout(r, 8000));

console.log('\n--- FASE 2: estado de la sala en el servidor ---');
try {
  const h = await fetch(`http://localhost:${PUERTO}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
  console.log(`  salas: ${h.duels.activeRoomCount} · humanas: ${h.duels.humanMatchCount} · en cola: ${h.duels.waitingPlayersTotal} ${JSON.stringify(h.duels.waitingInQueue)}`);
  for (const r of h.duels.rooms) {
    console.log(`    · ${r.roomId} [${r.status}] ${r.playerA} ${r.scoreA} vs ${r.scoreB} ${r.playerB ?? r.rival}`);
    console.log(`      isGhostMatch: ${r.isGhostMatch} · rival: ${r.rival ?? 'null'}`);
  }
} catch (err) {
  console.log(`  no se pudo leer /health: ${err.message}`);
}

console.log('\n--- FASE 3: veredicto ---');
const eventosA = a.eventos.join(', ') || '(ninguno)';
const eventosB = b.eventos.join(', ') || '(ninguno)';
console.log(`  JUGADOR-A recibió: ${eventosA}`);
console.log(`  JUGADOR-B recibió: ${eventosB}`);

const esperados = ['MATCH_WAITING', 'MATCH_START', 'MATCH_LIVE'];
const faltanA = esperados.filter((e) => !a.eventos.includes(e));
const faltanB = esperados.filter((e) => !b.eventos.includes(e));

if (faltanA.length === 0 && faltanB.length === 0) {
  console.log('\n  ✅ El protocolo completo funciona: ambos recibieron WAITING, START y LIVE.');
  console.log('     Los ticks se enviaron durante 5s. Si el marcador del servidor subió,');
  console.log('     entonces el problema está SOLO en el cliente (navegador).');
} else {
  console.log(`\n  ❌ Faltan eventos. A: ${faltanA.join(', ') || 'ninguno'} · B: ${faltanB.join(', ') || 'ninguno'}`);
}

for (const e of registro) clearInterval(e.ticker);
for (const e of registro) e.socket.close();
setTimeout(() => process.exit(0), 500);
