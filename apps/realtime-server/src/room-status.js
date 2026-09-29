/**
 * PLAY WIN REALTIME — OBSERVABILIDAD DE SALAS (room-status.js)
 * ==============================================================================
 * Construye una instantánea legible del estado del servidor: qué salas están
 * vivas, cuáles son contra bots, quién espera rival y con qué marcador.
 *
 * ¿Por qué existe este módulo?
 * Antes NO había forma de saber qué estaba pasando sin adivinar: el endpoint
 * /health solo devolvía el número total de salas. Era imposible distinguir
 * "no pasa nada" de "hay bots jugando" o "hay gente esperando".
 *
 * Se extrajo de rooms.js para respetar el límite de 350 líneas de
 * playwin-code-governance.
 * ==============================================================================
 */

/** Estado de un socket listo para enviar/recibir. */
const SOCKET_OPEN = 1;

/**
 * Cuenta los jugadores realmente conectados en espera, por juego.
 * Descarta entradas cuyo socket ya se cerró pero sigue en la cola.
 *
 * @param {Map<string, Array<{socket?: {readyState: number}}>>} waitingQueues
 * @returns {Record<string, number>}
 */
export function countWaitingByGame(waitingQueues) {
  const queues = {};
  for (const [gameId, queue] of waitingQueues.entries()) {
    queues[gameId] = queue.filter((entry) => entry.socket && entry.socket.readyState === SOCKET_OPEN).length;
  }
  return queues;
}

/**
 * Describe las salas que siguen en curso (se excluyen las terminadas).
 *
 * @param {Map<string, any>} rooms
 * @returns {Array<Record<string, unknown>>}
 */
export function describeActiveRooms(rooms) {
  const described = [];

  for (const [, room] of rooms.entries()) {
    if (room.status === 'FINISHED') continue;

    const isGhost = room.isGhostMatch === true;
    described.push({
      roomId: room.roomId,
      gameId: room.gameId,
      status: room.status,
      seed: room.seed,
      isGhostMatch: isGhost,
      // En una partida contra bot se identifica al rival explícitamente.
      rival: isGhost ? room.playerB?.username ?? null : null,
      playerA: room.playerA?.username ?? null,
      playerB: isGhost ? null : room.playerB?.username ?? null,
      scoreA: room.playerA?.score ?? 0,
      scoreB: room.playerB?.score ?? 0,
    });
  }

  return described;
}

/**
 * Instantánea completa del estado del servidor de duelos.
 *
 * @param {{ rooms: Map<string, any>, waitingQueues: Map<string, any[]> }} manager
 */
export function buildStatusSnapshot(manager) {
  const rooms = describeActiveRooms(manager.rooms);
  const waitingInQueue = countWaitingByGame(manager.waitingQueues);

  return {
    activeRoomCount: rooms.length,
    ghostMatchCount: rooms.filter((r) => r.isGhostMatch).length,
    humanMatchCount: rooms.filter((r) => !r.isGhostMatch).length,
    waitingInQueue,
    waitingPlayersTotal: Object.values(waitingInQueue).reduce((a, b) => a + b, 0),
    rooms,
  };
}
