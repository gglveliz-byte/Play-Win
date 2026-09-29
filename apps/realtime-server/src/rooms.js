import { matchService } from '@playwin/database';
import { joinQueue } from './join-queue.js';
import { ReconnectManager } from './match-reconnect.js';
import { createDuelRoom, createGhostRoom } from './room-factory.js';
import { buildStatusSnapshot } from './room-status.js';
import { buildGhostCallbacks } from './ghost-match.js';
import { removeFromQueues, handleInMatchDisconnect } from './disconnect-handler.js';
import { startMatchClock, cancelMatchClock, resumenPorTiempo, MOTIVO_TIEMPO_AGOTADO } from './match-clock.js';
import { handlePlayerTick as procesarTick } from './tick-handler.js';

/**
 * Gestor de salas 1v1 y árbitro en tiempo real con Anti-Cheat (< 350 líneas)
 * Cumple AGENTS.md (Zero Client Trust) y playwin-code-governance.
 */
export class RoomManager {
  /**
   * @param {object} [options]
   * @param {boolean} [options.ghostBotsEnabled] Si es false, nunca se empareja
   *   contra un rival de división: solo PvP real (útil para probar con personas).
   * @param {number} [options.ghostBotDelayMs] Cuánto espera un jugador real en
   *   cola antes de que entre un bot.
   */
  constructor(options = {}) {
    this.waitingQueues = new Map();
    this.rooms = new Map();
    this.socketToRoom = new Map();
    this.reconnectManager = new ReconnectManager(15000);
    this.ghostBotsEnabled = options.ghostBotsEnabled !== false;
    this.ghostBotDelayMs = Number(options.ghostBotDelayMs) || 3500;
  }

  /**
   * Mete al jugador en la cola o lo reengancha a su partida.
   * La lógica completa vive en `join-queue.js` (límite de tamaño de archivo).
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
  }

  async _createDuelRoom(gameId, entryA, entryB) {
    const room = await createDuelRoom(gameId, entryA, entryB, this._send.bind(this), this._broadcastToRoom.bind(this));
    this.rooms.set(room.roomId, room);
    this.socketToRoom.set(entryA.socket, room.roomId);
    this.socketToRoom.set(entryB.socket, room.roomId);
    // Reloj máximo: evita que un duelo entre dos jugadores que sobreviven se
    // quede abierto para siempre sin resultado.
    // Tope de duración: sin él, dos jugadores que sobreviven dejarían la sala abierta sin resultado.
    startMatchClock(room, (sala, motivo) => this._resolveScoreWinner(sala, motivo), (id) => this.rooms.get(id));
  }

  async _startGhostMatch(gameId, entry) {
    let targetRoomId = null;
    const callbacks = buildGhostCallbacks({
      getRoomId: () => targetRoomId,
      getRoom: (roomId) => this.rooms.get(roomId),
      send: this._send.bind(this),
      resolveScore: (room) => this._resolveScoreWinner(room),
      finishMatch: (room, winner, loser, reason, summary, wp, lp) =>
        this._finishMatch(room, winner, loser, reason, summary, wp, lp),
      socket: entry.socket,
    });

    const { room, roomId } = await createGhostRoom(gameId, entry, callbacks, this._send.bind(this));
    targetRoomId = roomId;
    this.rooms.set(roomId, room);
    this.socketToRoom.set(entry.socket, roomId);
    // Tope de duración: sin él, dos jugadores que sobreviven dejarían la sala abierta sin resultado.
    startMatchClock(room, (sala, motivo) => this._resolveScoreWinner(sala, motivo), (id) => this.rooms.get(id));
  }

  /**
   * Instantánea del estado del servidor: salas activas, bots en juego y
   * profundidad de cada cola. La lógica vive en `room-status.js` para respetar
   * el límite de tamaño de archivo.
   */
  getStatusSnapshot() {
    return buildStatusSnapshot(this);
  }

  /** Delegado en tick-handler.js: ritmo, física y reenvío al rival. */
  handlePlayerTick(socket, tickData) {
    procesarTick(
      {
        socketToRoom: this.socketToRoom,
        rooms: this.rooms,
        send: this._send.bind(this),
        descalificar: (s, motivo) => this.handlePlayerDisqualification(s, motivo),
      },
      socket,
      tickData
    );
  }

  _resolveScoreWinner(room, motivo = 'HIGHER_SCORE') {
    if (room.finishTimer) clearTimeout(room.finishTimer);
    cancelMatchClock(room);
    room.status = 'FINISHED';
    if (room.ghostSimulation) room.ghostSimulation.stop();
    const p1 = room.playerA.score || 0, p2 = room.playerB.score || 0;
    const winner = p1 >= p2 ? room.playerA : room.playerB;
    const loser = winner === room.playerA ? room.playerB : room.playerA;
    const resumen = p1 === p2
      ? `Empate a ${p1}.`
      : motivo === MOTIVO_TIEMPO_AGOTADO
        ? resumenPorTiempo(winner.username, winner.score)
        : `${winner.username} ganó con ${winner.score}.`;
    this._finishMatch(room, winner, loser, motivo, resumen, 100, 20);
  }

  handlePlayerFinish(socket, data) {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'PLAYING') return;

    const isA = socket === room.playerA.socket;
    const reporter = isA ? room.playerA : room.playerB;
    reporter.finished = true;
    if (data?.score !== undefined) reporter.score = Math.max(reporter.score || 0, Number(data.score));

    if (room.isGhostMatch || (isA ? room.playerB : room.playerA).finished) {
      this._resolveScoreWinner(room);
      return;
    }

    if (!room.finishTimer) {
      room.finishTimer = setTimeout(() => {
        const cur = this.rooms.get(roomId);
        if (cur && cur.status === 'PLAYING') this._resolveScoreWinner(cur);
      }, 4000);
    }
  }

  handlePlayerCrash(socket) {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'PLAYING') return;

    // En carreras estrellarse NO hace perder: se reporta la distancia recorrida
    // y se resuelve por puntuación, como manda el reglamento de ese juego.
    if (room.gameId === 'carreras') {
      this.handlePlayerFinish(socket, {});
      return;
    }

    // En los juegos de supervivencia (Sky Runner), quien cae pierde.
    this._cerrarDandoVictoriaAlRival(
      socket,
      'OPPONENT_CRASH',
      (nombre) => `${nombre} cayó al abismo.`,
      100
    );
  }

  handlePlayerDisqualification(socket, reason) {
    this._cerrarDandoVictoriaAlRival(
      socket,
      reason,
      () => `Descalificación por anomalía (${reason}).`,
      100
    );
  }

  /**
   * Cierra el duelo dando la victoria al rival del socket indicado.
   * Se usa cuando un jugador se rinde o cuando comete una infracción grave.
   *
   * @param {any} socket Socket del jugador que abandona.
   * @param {string} motivo Código que se guarda en el historial.
   * @param {(username: string) => string} textoResumen Texto explicativo.
   * @param {number} puntosGanador Puntos de temporada para el ganador.
   */
  _cerrarDandoVictoriaAlRival(socket, motivo, textoResumen, puntosGanador) {
    const roomId = this.socketToRoom.get(socket);
    const room = roomId ? this.rooms.get(roomId) : null;
    if (!room || room.status !== 'PLAYING') return;

    const isA = socket === room.playerA.socket;
    const [perdedor, ganador] = isA ? [room.playerA, room.playerB] : [room.playerB, room.playerA];

    room.status = 'FINISHED';
    cancelMatchClock(room);
    if (room.ghostSimulation) room.ghostSimulation.stop();
    this._finishMatch(room, ganador, perdedor, motivo, textoResumen(perdedor.username), puntosGanador, 20);
  }

  /**
   * Gestiona la desconexión de un socket: lo saca de las colas y, si estaba en
   * partida, aplica la ventana de gracia de reconexión.
   * La lógica vive en `disconnect-handler.js` para respetar el límite de tamaño.
   */
  handleDisconnect(socket) {
    removeFromQueues(this.waitingQueues, socket);
    handleInMatchDisconnect(
      {
        rooms: this.rooms,
        socketToRoom: this.socketToRoom,
        reconnectManager: this.reconnectManager,
        send: this._send.bind(this),
        finishMatch: (room, winner, loser, reason, summary, wp, lp) =>
          this._finishMatch(room, winner, loser, reason, summary, wp, lp),
      },
      socket
    );
    this.socketToRoom.delete(socket);
  }

  _finishMatch(room, winner, loser, reason, summary, winPoints, losePoints) {
    if (room.ghostSimulation) room.ghostSimulation.stop();
    this._broadcastToRoom(room.roomId, {
      event: 'MATCH_END', winnerId: winner.id, loserId: loser.id, reason, summary,
      payout: { winnerSeasonPoints: winPoints, loserSeasonPoints: losePoints },
    });

    matchService.recordMatch({
      roomId: room.roomId, gameId: room.gameId,
      player1Id: room.playerA.id, player2Id: room.playerB.id, winnerId: winner.id,
      p1Score: room.playerA.score || 0, p2Score: room.playerB.score || 0, seed: room.seed,
      finishReason: reason, durationMs: Date.now() - room.startedAt,
      p1PointsDelta: winner.id === room.playerA.id ? winPoints : losePoints,
      p2PointsDelta: room.isGhostMatch ? 0 : (winner.id === room.playerB.id ? winPoints : losePoints),
    }).catch((err) => console.error('[RoomManager] recordMatch error:', err.message));

    this._cleanupRoom(room.roomId, 6000);
  }

  _cleanupRoom(roomId, delayMs) {
    setTimeout(() => {
      const room = this.rooms.get(roomId);
      if (!room) return;
      if (room.finishTimer) clearTimeout(room.finishTimer);
      cancelMatchClock(room);
      if (room.ghostSimulation) room.ghostSimulation.stop();
      for (const p of [room.playerA, room.playerB]) {
        if (p?.id) this.reconnectManager.cancel(p.id);
        if (p?.socket) this.socketToRoom.delete(p.socket);
      }
      this.rooms.delete(roomId);
    }, delayMs);
  }

  _broadcastToRoom(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.playerA?.socket) this._send(room.playerA.socket, message);
    if (room.playerB?.socket) this._send(room.playerB.socket, message);
  }

  _send(socket, message) {
    try {
      if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));
    } catch (err) {
      console.error('[RoomManager] _send error:', err.message);
    }
  }
}
