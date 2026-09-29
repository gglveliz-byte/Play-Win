/**
 * Sustituye el método `joinQueue` de rooms.js por un delegado al módulo
 * join-queue.js, y arregla el nombre importado de tick-handler para que no
 * colisione con el método de la clase.
 *
 * Se hace con script (y no con reemplazos literales de PowerShell) porque el
 * bloque tiene 112 líneas y los saltos de línea CRLF rompen los reemplazos.
 */
import fs from 'node:fs';

const FICHERO = 'apps/realtime-server/src/rooms.js';
const DELEGADO = `  /**
   * Mete al jugador en la cola o lo reengancha a su partida.
   * La lógica completa vive en \`join-queue.js\` (límite de tamaño de archivo).
   */
  joinQueue(rawPlayer, socket, clientIp = '127.0.0.1') {
    joinQueue(
      {
        rooms: this.rooms,
        socketToRoom: this.socketToRoom,
        waitingQueues: this.waitingQueues,
        reconnectManager: this.reconnectManager,
        ghostBotsEnabled: this.ghostBotsEnabled,
        ghostBotDelayMs: this.ghostBotDelayMs,
        send: this._send.bind(this),
        createDuelRoom: (gameId, opponent, entry) => this._createDuelRoom(gameId, opponent, entry),
        startGhostMatch: (gameId, entry) => this._startGhostMatch(gameId, entry),
      },
      rawPlayer,
      socket,
      clientIp
    );
  }`;

let contenido = fs.readFileSync(FICHERO, 'utf8');
const lineas = contenido.split('\n');

// Localiza el inicio del método y su cierre por balance de llaves.
const inicio = lineas.findIndex((l) => /^\s{2}joinQueue\(/.test(l));
if (inicio < 0) {
  console.error('  ❌ No se encontró joinQueue');
  process.exit(1);
}

let profundidad = 0;
let fin = -1;
for (let i = inicio; i < lineas.length; i++) {
  for (const ch of lineas[i]) {
    if (ch === '{') profundidad++;
    else if (ch === '}') profundidad--;
  }
  if (profundidad === 0 && i > inicio) {
    fin = i;
    break;
  }
}

if (fin < 0) {
  console.error('  ❌ No se encontró el cierre de joinQueue');
  process.exit(1);
}

console.log(`  joinQueue ocupa las líneas ${inicio + 1}-${fin + 1} (${fin - inicio + 1} líneas)`);

const nuevas = [...lineas.slice(0, inicio), ...DELEGADO.split('\n'), ...lineas.slice(fin + 1)];
contenido = nuevas.join('\n');

// El método se llama igual que la función importada: se renombra la importación.
contenido = contenido
  .replace("import { handlePlayerTick } from './tick-handler.js';", "import { handlePlayerTick as procesarTick } from './tick-handler.js';")
  .replace('    handlePlayerTick(\n', '    procesarTick(\n')
  .replace("import { verifyMatchTicket, detectCollusion, isSelfMatchAllowed } from './anticheat.js';", "import { joinQueue } from './join-queue.js';");

fs.writeFileSync(FICHERO, contenido);
const total = contenido.split('\n').length;
console.log(`  rooms.js: ${lineas.length} -> ${total} líneas ${total <= 350 ? '✅' : '❌ (límite 350)'}`);
