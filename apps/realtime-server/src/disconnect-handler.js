/**
 * PLAY WIN REALTIME — DESCONEXIÓN Y RECONEXIÓN (disconnect-handler.js)
 * ==============================================================================
 * Todo lo que ocurre cuando un jugador pierde la conexión durante una partida:
 *   · Se le saca de las colas de espera y se limpia su temporizador.
 *   · Si es una partida contra un bot, la simulación se PAUSA para no penalizar
 *     al jugador ausente.
 *   · Se avisa al rival con la ventana de gracia.
 *   · Si no vuelve a tiempo, se declara FORFEIT y gana el rival.
 *
 * Se extrajo de rooms.js para respetar el límite de 350 líneas de
 * playwin-code-governance.
 * ==============================================================================
 */

/** Estados de sala en los que una desconexión todavía importa. */
const LIVE_STATES = ['COUNTDOWN', 'PLAYING'];

/**
 * Saca un socket de todas las colas de espera y limpia su temporizador.
 *
 * @param {Map<string, Array<{socket: any, matchTimer: any}>>} waitingQueues
 * @param {any} socket
 * @returns {boolean} true si el socket estaba esperando en alguna cola.
 */
export function removeFromQueues(waitingQueues, socket) {
  let removed = false;

  for (const [, queue] of waitingQueues.entries()) {
    const idx = queue.findIndex((entry) => entry.socket === socket);
    if (idx !== -1) {
      if (queue[idx].matchTimer) clearTimeout(queue[idx].matchTimer);
      queue.splice(idx, 1);
      removed = true;
    }
  }

  return removed;
}

/**
 * Gestiona la desconexión de un jugador que estaba en partida.
 *
 * @param {object} deps
 * @param {Map<string, any>} deps.rooms
 * @param {Map<any, string>} deps.socketToRoom
 * @param {{ gracePeriodMs: number, schedule: Function }} deps.reconnectManager
 * @param {(socket: any, message: object) => void} deps.send
 * @param {Function} deps.finishMatch
 * @param {any} socket
 */
export function handleInMatchDisconnect({ rooms, socketToRoom, reconnectManager, send, finishMatch }, socket) {
  const roomId = socketToRoom.get(socket);
  const room = roomId ? rooms.get(roomId) : null;
  if (!room || !LIVE_STATES.includes(room.status)) return;

  const isPlayerA = socket === room.playerA.socket;
  const [loser, winner] = isPlayerA ? [room.playerA, room.playerB] : [room.playerB, room.playerA];
  const graceSeconds = Math.round(reconnectManager.gracePeriodMs / 1000);

  // Contra un rival de división, la simulación se pausa durante la ausencia.
  if (room.isGhostMatch && room.ghostSimulation) room.ghostSimulation.pause();

  if (winner.socket) {
    send(winner.socket, {
      event: 'RIVAL_DISCONNECTED',
      graceSeconds,
      message: `${loser.username} desconectado. Esperando ${graceSeconds}s...`,
    });
  }

  reconnectManager.schedule(loser.id, loser.username, room.roomId, () => {
    const current = rooms.get(roomId);
    if (current && LIVE_STATES.includes(current.status)) {
      current.status = 'FINISHED';
      if (current.ghostSimulation) current.ghostSimulation.stop();
      finishMatch(current, winner, loser, 'FORFEIT', `${loser.username} no logró reconectar a tiempo.`, 100, 0);
    }
  });
}
