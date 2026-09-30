import { matchService } from '@playwin/database';
import { joinQueue } from './join-queue.js';
import { ReconnectManager } from './match-reconnect.js';
import { createDuelRoom, createGhostRoom } from './room-factory.js';
import { buildStatusSnapshot } from './room-status.js';
import { buildGhostCallbacks } from './ghost-match.js';
import { removeFromQueues, handleInMatchDisconnect } from './disconnect-handler.js';
import { startMatchClock, cancelMatchClock, resumenPorTiempo, resolverDobleCaida, MOTIVO_TIEMPO_AGOTADO } from './match-clock.js';
import { handlePlayerTick as procesarTick } from './tick-handler.js';
import { cerrarEnEmpate, cerrarConGanador } from './match-end.js';
import { vigilarAbandonoDeSala } from './stall-watch.js';

/** Ventana para escuchar la caída del rival antes de cerrar: si los dos caen casi
 * a la vez, los dos avisos llegan dentro y se compara quién aguantó más. */
const VENTANA_CAIDA_MS = 400;

/** Gestor de salas 1v1 y árbitro en tiempo real con Anti-Cheat (Zero Client Trust). */
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
    this._armarRelojes(room);
  }

  async _startGhostMatch(gameId, entry) {
    let targetRoomId = null;
    const callbacks = buildGhostCallbacks({
      getRoomId: () => targetRoomId,
      getRoom: (roomId) => this.rooms.get(roomId),
      send: this._send.bind(this),
      resolveScore: (room) => this._resolveScoreWinner(room),
      finishMatch: (room, w, l, reason, summary, wp, lp) => this._finalizarDuelo(room, w, l, reason, summary, wp),
      socket: entry.socket,
    });

    const { room, roomId } = await createGhostRoom(gameId, entry, callbacks, this._send.bind(this));
    targetRoomId = roomId;
    this.rooms.set(roomId, room);
    this.socketToRoom.set(entry.socket, roomId);
    this._armarRelojes(room);
  }

  /**
   * Arma los relojes de una sala nueva: tope de duración y detección de
   * abandono. Sin ellos, un duelo entre dos supervivientes —o con los dos
   * motores congelados— se quedaba abierto SIN RESULTADO.
   *
   * @param {object} room Sala en juego.
   */
  _armarRelojes(room) {
    startMatchClock(room, (sala, motivo) => this._resolveScoreWinner(sala, motivo), (id) => this.rooms.get(id));
    vigilarAbandonoDeSala(room, (id) => this.rooms.get(id), (sala, motivo) => this._resolveScoreWinner(sala, motivo));
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

  /**
   * Decide el ganador comparando puntuaciones (tiempo agotado o abandono).
   *
   * Si los dos empatan EXACTAMENTE, es empate: no se elige a uno por posición.
   * Antes el resumen decía «Empate a N» mientras se daban 100 puntos de victoria
   * a uno y 20 al otro, así que salían ¡VICTORIA! y DERROTA en la misma partida.
   *
   * @param {object} room Sala del duelo.
   * @param {string} [motivo] Código para el historial.
   */
  _resolveScoreWinner(room, motivo = 'HIGHER_SCORE') {
    const p1 = room.playerA.score || 0;
    const p2 = room.playerB.score || 0;
    if (p1 === p2) {
      this._finalizarEmpate(room, `Los dos aguantaron ${p1}s. Empate técnico.`);
      return;
    }

    const ganador = p1 > p2 ? room.playerA : room.playerB;
    const perdedor = ganador === room.playerA ? room.playerB : room.playerA;
    const resumen = motivo === MOTIVO_TIEMPO_AGOTADO
      ? resumenPorTiempo(ganador.username, ganador.score)
      : `${ganador.username} ganó con ${ganador.score}.`;

    this._finalizarDuelo(room, ganador, perdedor, motivo, resumen, 100);
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
    this._resolverCaida(room, socket);
  }

  /**
   * Resuelve la caída de un jugador en un juego de supervivencia.
   *
   * Gana quien NO cae. Si los dos caen casi a la vez se escucha al rival dentro
   * de una ventana corta: gana quien aguantó más, o empate si fue idéntico.
   *
   * @param {object} room Sala del duelo.
   * @param {any} socket Socket del jugador que acaba de caer.
   */
  _resolverCaida(room, socket) {
    const esA = socket === room.playerA.socket;
    const caido = esA ? room.playerA : room.playerB;
    const rival = esA ? room.playerB : room.playerA;

    // `score` es el tiempo sobrevivido según los ticks VALIDADOS por el servidor.
    caido.cayoEn = caido.score || 0;

    if (rival.cayoEn !== undefined) {
      // La regla vive en match-clock.js para poder probarla sin levantar el servidor.
      const r = resolverDobleCaida(room.playerA.username, room.playerA.cayoEn, room.playerB.username, room.playerB.cayoEn);

      if (r.empate) {
        // EMPATE REAL: si los dos aguantaron lo mismo, no hay ganador. Antes se
        // elegía a uno por posición y se le daban los 100 puntos de victoria,
        // mientras el resumen decía «empate técnico»: la interfaz mostraba
        // ¡VICTORIA! a uno y DERROTA al otro. Incoherente e injusto.
        this._finalizarEmpate(room, r.resumen);
        return;
      }

      const ganador = r.ganador === room.playerA.username ? room.playerA : room.playerB;
      const perdedor = ganador === room.playerA ? room.playerB : room.playerA;
      this._finalizarDuelo(room, ganador, perdedor, 'OPPONENT_CRASH', r.resumen, 100);
      return;
    }

    // Todavía no sabemos si el rival también cae: se le da un instante.
    this._cerrarDandoVictoriaAlRival(
      socket,
      'OPPONENT_CRASH',
      (nombre) => `${nombre} cayó al abismo.`,
      100,
      VENTANA_CAIDA_MS
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
   * Se usa cuando un jugador se rinde, comete una infracción grave o cae sin que
   * el rival caiga también.
   *
   * @param {any} socket Socket del jugador que abandona.
   * @param {string} motivo Código para el historial.
   * @param {(username: string) => string} textoResumen Texto explicativo.
   * @param {number} puntosGanador Puntos de temporada para el ganador.
   * @param {number} [cortesiaMs] Espera antes de cerrar, para dar tiempo a que
   *   llegue el aviso del rival (la ventana de cortesía).
   */
  _cerrarDandoVictoriaAlRival(socket, motivo, textoResumen, puntosGanador, cortesiaMs = 0) {
    const roomId = this.socketToRoom.get(socket);
    const room = roomId ? this.rooms.get(roomId) : null;
    if (!room || room.status !== 'PLAYING') return;

    const isA = socket === room.playerA.socket;
    const [perdedor, ganador] = isA ? [room.playerA, room.playerB] : [room.playerB, room.playerA];

    // VENTANA DE CORTESÍA: el aviso del rival llega milisegundos después. Sin
    // esta espera, la segunda caída se descartaba por «partida ya terminada»: el
    // jugador se quedaba sin resultado en pantalla y el ganador salía por azar.
    if (cortesiaMs > 0) {
      const marca = { perdedor, ganador };
      if (room.cortesiaTimer) clearTimeout(room.cortesiaTimer);
      room.cortesiaTimer = setTimeout(() => {
        const actual = this.rooms.get(room.roomId);
        if (!actual || actual.status !== 'PLAYING') return;   // ya se cerró con las dos caídas
        this._finalizarDuelo(actual, marca.ganador, marca.perdedor, motivo, textoResumen(marca.perdedor.username), puntosGanador);
      }, cortesiaMs);
      return;
    }

    this._finalizarDuelo(room, ganador, perdedor, motivo, textoResumen(perdedor.username), puntosGanador);
  }

  /** Cierra con un ganador. La lógica vive en match-end.js. */
  _finalizarDuelo(room, ganador, perdedor, motivo, resumen, puntosGanador) {
    cerrarConGanador(this._ctxCierre(), room, ganador, perdedor, motivo, resumen, puntosGanador);
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
        finishMatch: (room, w, l, reason, summary, wp, lp) => this._finalizarDuelo(room, w, l, reason, summary, wp),
      },
      socket
    );
    this.socketToRoom.delete(socket);
  }

  /** Dependencias que necesita match-end.js para cerrar un duelo. */
  _ctxCierre() {
    return {
      broadcast: this._broadcastToRoom.bind(this),
      matchService,
      limpiar: (roomId, delayMs) => this._cleanupRoom(roomId, delayMs),
    };
  }

  /** Cierra en EMPATE: sin ganador y con los mismos puntos para los dos. */
  _finalizarEmpate(room, resumen) {
    cerrarEnEmpate(this._ctxCierre(), room, resumen);
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
