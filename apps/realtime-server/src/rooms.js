import { matchService } from '@playwin/database';
import { verifyMatchTicket, validateTickPhysics, detectCollusion, validatePacketRate, isSelfMatchAllowed } from './anticheat.js';
import { ReconnectManager } from './match-reconnect.js';
import { createDuelRoom, createGhostRoom } from './room-factory.js';

/**
 * Gestor de salas 1v1 y árbitro en tiempo real con Anti-Cheat (< 350 líneas)
 * Cumple AGENTS.md (Zero Client Trust) y playwin-code-governance.
 */
export class RoomManager {
  constructor() {
    this.waitingQueues = new Map();
    this.rooms = new Map();
    this.socketToRoom = new Map();
    this.reconnectManager = new ReconnectManager(15000);
  }

  joinQueue(rawPlayer, socket, clientIp = '127.0.0.1') {
    const player = { ...rawPlayer };
    if (!player.token) return this._send(socket, { event: 'SECURITY_ERROR', message: 'Acceso denegado: Inicia sesión.' });
    const verified = verifyMatchTicket(player.token);
    if (!verified) return this._send(socket, { event: 'SECURITY_ERROR', message: 'Token de partida no válido o expirado.' });

    player.id = verified.sub;
    player.username = verified.username;
    player.avatar = verified.avatar || player.avatar;
    player.gameId = verified.gameId || player.gameId;
    const gameId = player.gameId || 'carreras';

    // 0. Reconexión en ventana de gracia (15s) o vinculación a sala activa existente
    let activeRoom = null;
    let isPlayerA = true;

    if (this.reconnectManager.isPending(player.id) || this.reconnectManager.isPending(player.username)) {
      const pending = this.reconnectManager.cancel(player.id) || this.reconnectManager.cancel(player.username);
      activeRoom = pending ? this.rooms.get(pending.roomId) : null;
    }

    if (!activeRoom) {
      for (const [, r] of this.rooms.entries()) {
        if (r.status === 'COUNTDOWN' || r.status === 'PLAYING') {
          const matchA = r.playerA?.id === player.id || r.playerA?.username?.toLowerCase() === player.username?.toLowerCase();
          const matchB = r.playerB?.id === player.id || r.playerB?.username?.toLowerCase() === player.username?.toLowerCase();
          if (matchA || matchB) {
            activeRoom = r;
            isPlayerA = matchA;
            this.reconnectManager.cancel(player.id);
            this.reconnectManager.cancel(player.username);
            break;
          }
        }
      }
    } else {
      isPlayerA = activeRoom.playerA.id === player.id || activeRoom.playerA.username?.toLowerCase() === player.username?.toLowerCase();
    }

    if (activeRoom && (activeRoom.status === 'COUNTDOWN' || activeRoom.status === 'PLAYING')) {
      const [rec, opp] = isPlayerA ? [activeRoom.playerA, activeRoom.playerB] : [activeRoom.playerB, activeRoom.playerA];
      rec.socket = socket;
      this.socketToRoom.set(socket, activeRoom.roomId);
      if (activeRoom.isGhostMatch && activeRoom.ghostSimulation) activeRoom.ghostSimulation.resume();
      this._send(socket, {
        event: 'MATCH_RESUME', roomId: activeRoom.roomId, seed: activeRoom.seed, status: activeRoom.status,
        role: isPlayerA ? 'PLAYER_A' : 'PLAYER_B',
        player: { id: rec.id, username: rec.username, avatar: rec.avatar, score: rec.score },
        opponent: { username: opp.username, avatar: opp.avatar, rank: opp.rank, score: opp.score },
      });
      if (opp.socket) this._send(opp.socket, { event: 'RIVAL_RECONNECTED', message: `${rec.username} se ha reconectado.` });
      return;
    }

    if (!this.waitingQueues.has(gameId)) this.waitingQueues.set(gameId, []);
    const queue = this.waitingQueues.get(gameId);
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!queue[i].socket || queue[i].socket.readyState !== 1) {
        if (queue[i].matchTimer) clearTimeout(queue[i].matchTimer);
        queue.splice(i, 1);
      }
    }

    // 0. Desvincular de sala previa si estuviera en rematch rápido
    if (this.socketToRoom.has(socket)) {
      const oldId = this.socketToRoom.get(socket);
      this.socketToRoom.delete(socket);
      const oldR = this.rooms.get(oldId);
      if (oldR && oldR.status !== 'FINISHED') {
        oldR.status = 'FINISHED';
        if (oldR.ghostSimulation) oldR.ghostSimulation.stop();
      }
    }

    // Evitar socket duplicado en cola sin reiniciar su temporizador si ya está en espera
    const existingIdx = queue.findIndex((e) => e.socket === socket);
    if (existingIdx !== -1) return;

    // Buscar oponente. El emparejamiento contra uno mismo requiere la bandera
    // explícita ALLOW_SELF_MATCH (antes dependía de NODE_ENV, lo que hacía el
    // comportamiento implícito e intraducible a pruebas).
    const isDev = isSelfMatchAllowed();
    const opponentIdx = queue.findIndex(
      (entry) => isDev ? entry.socket !== socket : (entry.player.id !== player.id && entry.player.username !== player.username)
    );

    if (opponentIdx !== -1) {
      const opponent = queue.splice(opponentIdx, 1)[0];
      if (opponent.matchTimer) clearTimeout(opponent.matchTimer);
      const collusion = detectCollusion(opponent, { player, socket, ip: clientIp });
      if (collusion.isCollusion) {
        return this._send(socket, { event: 'SECURITY_WARNING', message: 'Emparejamiento bloqueado por colusión.' });
      }
      if (opponent.player.id === player.id) player.username = `${player.username} (Tab 2)`;
      this._createDuelRoom(gameId, opponent, { player, socket, ip: clientIp });
    } else {
      const queueEntry = { player, socket, ip: clientIp, matchTimer: null };
      queueEntry.matchTimer = setTimeout(() => {
        const q = this.waitingQueues.get(gameId);
        if (!q) return;
        const idx = q.indexOf(queueEntry);
        if (idx !== -1) { q.splice(idx, 1); this._startGhostMatch(gameId, queueEntry); }
      }, 3500);
      queue.push(queueEntry);
      this._send(socket, { event: 'MATCH_WAITING', gameId, message: 'Buscando contrincante en tu división...' });
    }
  }

  async _createDuelRoom(gameId, entryA, entryB) {
    const room = await createDuelRoom(gameId, entryA, entryB, this._send.bind(this), this._broadcastToRoom.bind(this));
    this.rooms.set(room.roomId, room);
    this.socketToRoom.set(entryA.socket, room.roomId);
    this.socketToRoom.set(entryB.socket, room.roomId);
  }

  async _startGhostMatch(gameId, entry) {
    let targetRoomId = null;
    const callbacks = {
      onLive: () => {
        const cur = targetRoomId ? this.rooms.get(targetRoomId) : null;
        if (cur) { cur.liveAt = Date.now(); cur.playerA.lastTick.timestamp = cur.liveAt; }
        this._send(entry.socket, { event: 'MATCH_LIVE' });
      },
      onTick: (t) => this._send(entry.socket, { event: 'RIVAL_TICK', x: t.x, y: t.y, score: t.score, isAlive: t.isAlive }),
      onFinish: () => {
        const cur = targetRoomId ? this.rooms.get(targetRoomId) : null;
        if (cur && cur.status === 'PLAYING') this._resolveScoreWinner(cur);
      },
      onCrash: () => {
        const cur = targetRoomId ? this.rooms.get(targetRoomId) : null;
        if (cur && cur.status === 'PLAYING') {
          cur.status = 'FINISHED';
          this._finishMatch(cur, cur.playerA, cur.playerB, 'OPPONENT_CRASH', `El rival se estrelló contra un obstáculo.`, 100, 20);
        }
      },
    };
    const { room, roomId } = await createGhostRoom(gameId, entry, callbacks, this._send.bind(this));
    targetRoomId = roomId;
    this.rooms.set(roomId, room);
    this.socketToRoom.set(entry.socket, roomId);
  }

  handlePlayerTick(socket, tickData) {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'PLAYING') return;

    const isPlayerA = socket === room.playerA.socket;
    const curPlayer = isPlayerA ? room.playerA : room.playerB;
    const targetSocket = isPlayerA ? room.playerB?.socket : room.playerA?.socket;

    const rateCheck = validatePacketRate(curPlayer.tickHistory, Date.now());
    if (!rateCheck.valid) {
      this.handlePlayerDisqualification(socket, rateCheck.reason);
      return;
    }
    curPlayer.tickHistory = rateCheck.history;

    const currentTick = { timestamp: Date.now(), x: tickData.x || 0, y: tickData.y || 0, score: tickData.score || 0 };
    const physicsCheck = validateTickPhysics(room.gameId, curPlayer.lastTick, currentTick, room.liveAt || room.startedAt);
    if (!physicsCheck.valid) {
      curPlayer.cheatStrikes = (curPlayer.cheatStrikes || 0) + 1;
      if (physicsCheck.severity === 'HIGH' || curPlayer.cheatStrikes >= 2) {
        this.handlePlayerDisqualification(socket, physicsCheck.reason);
        return;
      }
    } else if (curPlayer.cheatStrikes > 0) {
      curPlayer.cheatStrikes = Math.max(0, curPlayer.cheatStrikes - 0.5);
    }

    curPlayer.score = currentTick.score;
    curPlayer.lastTick = currentTick;

    if (targetSocket) {
      this._send(targetSocket, {
        event: 'RIVAL_TICK',
        x: currentTick.x,
        y: currentTick.y,
        score: currentTick.score,
        isAlive: tickData.isAlive ?? true,
      });
    }
  }

  _resolveScoreWinner(room) {
    if (room.finishTimer) clearTimeout(room.finishTimer);
    room.status = 'FINISHED';
    if (room.ghostSimulation) room.ghostSimulation.stop();
    const p1 = room.playerA.score || 0, p2 = room.playerB.score || 0;
    const winner = p1 >= p2 ? room.playerA : room.playerB;
    const loser = winner === room.playerA ? room.playerB : room.playerA;
    this._finishMatch(room, winner, loser, 'HIGHER_SCORE', p1 === p2 ? `Empate a ${p1}m.` : `${winner.username} ganó con ${winner.score}m.`, 100, 20);
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

    if (room.gameId === 'carreras') {
      this.handlePlayerFinish(socket, {});
      return;
    }

    room.status = 'FINISHED';
    if (room.ghostSimulation) room.ghostSimulation.stop();
    const isA = socket === room.playerA.socket;
    this._finishMatch(room, isA ? room.playerB : room.playerA, isA ? room.playerA : room.playerB, 'OPPONENT_CRASH', `${(isA ? room.playerA : room.playerB).username} se estrelló contra un obstáculo.`, 100, 20);
  }

  handlePlayerDisqualification(socket, reason) {
    const roomId = this.socketToRoom.get(socket);
    const room = roomId ? this.rooms.get(roomId) : null;
    if (!room || room.status !== 'PLAYING') return;
    room.status = 'FINISHED';
    if (room.ghostSimulation) room.ghostSimulation.stop();
    const isA = socket === room.playerA.socket;
    this._finishMatch(room, isA ? room.playerB : room.playerA, isA ? room.playerA : room.playerB, reason, `Descalificación por anomalía (${reason}).`, 100, 0);
  }

  handleDisconnect(socket) {
    for (const [, queue] of this.waitingQueues.entries()) {
      const idx = queue.findIndex((e) => e.socket === socket);
      if (idx !== -1) {
        if (queue[idx].matchTimer) clearTimeout(queue[idx].matchTimer);
        queue.splice(idx, 1);
      }
    }
    const roomId = this.socketToRoom.get(socket);
    const room = roomId ? this.rooms.get(roomId) : null;
    if (room && (room.status === 'COUNTDOWN' || room.status === 'PLAYING')) {
      const isA = socket === room.playerA.socket;
      const [loser, winner] = isA ? [room.playerA, room.playerB] : [room.playerB, room.playerA];
      if (room.isGhostMatch && room.ghostSimulation) {
        room.ghostSimulation.pause();
      }
      if (winner.socket) {
        this._send(winner.socket, { event: 'RIVAL_DISCONNECTED', graceSeconds: 15, message: `${loser.username} desconectado. Esperando 15s...` });
      }
      this.reconnectManager.schedule(loser.id, loser.username, room.roomId, () => {
        const cur = this.rooms.get(roomId);
        if (cur && (cur.status === 'COUNTDOWN' || cur.status === 'PLAYING')) {
          cur.status = 'FINISHED';
          if (cur.ghostSimulation) cur.ghostSimulation.stop();
          this._finishMatch(cur, winner, loser, 'FORFEIT', `${loser.username} no logró reconectar a tiempo.`, 100, 0);
        }
      });
    }
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
