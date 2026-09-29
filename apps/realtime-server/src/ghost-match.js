/**
 * PLAY WIN REALTIME — CABLEADO DEL RIVAL DE DIVISIÓN (ghost-match.js)
 * ==============================================================================
 * Construye los callbacks que conectan la simulación del Ghost Bot con el
 * gestor de salas: cuándo empieza la partida, cómo se retransmiten sus ticks,
 * cómo termina y cómo se resuelve la victoria.
 *
 * Se extrajo de rooms.js para respetar el límite de 350 líneas de
 * playwin-code-governance.
 * ==============================================================================
 */

/**
 * Crea los callbacks del simulador de fantasma.
 *
 * @param {object} deps
 * @param {() => string|null} deps.getRoomId Devuelve el id de la sala en curso
 *   (se resuelve de forma perezosa porque la sala aún no existe al crear los callbacks).
 * @param {(roomId: string) => any} deps.getRoom Sala por id.
 * @param {(socket: any, message: object) => void} deps.send Envío al jugador.
 * @param {(room: any) => void} deps.resolveScore Resuelve la victoria por puntaje.
 * @param {(room: any, winner: any, loser: any, reason: string, summary: string, wp: number, lp: number) => void} deps.finishMatch
 * @param {any} socket Socket del jugador humano.
 */
export function buildGhostCallbacks({ getRoomId, getRoom, send, resolveScore, finishMatch, socket }) {
  return {
    onLive: () => {
      const roomId = getRoomId();
      const room = roomId ? getRoom(roomId) : null;
      if (room) {
        room.liveAt = Date.now();
        room.playerA.lastTick.timestamp = room.liveAt;
      }
      send(socket, { event: 'MATCH_LIVE' });
    },

    onTick: (tick) =>
      send(socket, {
        event: 'RIVAL_TICK',
        x: tick.x,
        y: tick.y,
        score: tick.score,
        isAlive: tick.isAlive,
      }),

    onFinish: () => {
      const roomId = getRoomId();
      const room = roomId ? getRoom(roomId) : null;
      if (room && room.status === 'PLAYING') resolveScore(room);
    },

    onCrash: () => {
      const roomId = getRoomId();
      const room = roomId ? getRoom(roomId) : null;
      if (room && room.status === 'PLAYING') {
        room.status = 'FINISHED';
        finishMatch(
          room,
          room.playerA,
          room.playerB,
          'OPPONENT_CRASH',
          'El rival se estrelló contra un obstáculo.',
          100,
          20
        );
      }
    },
  };
}
