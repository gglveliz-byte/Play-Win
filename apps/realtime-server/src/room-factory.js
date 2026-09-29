import { randomUUID } from 'node:crypto';
import { userService } from '@playwin/database';
import { buildGhostRoom } from './ghost-bot.js';

/**
 * PLAY WIN REALTIME — CREADOR DE SALAS (room-factory.js)
 * Modularizado para cumplir el límite < 350 líneas de playwin-code-governance.
 */

export async function createDuelRoom(gameId, entryA, entryB, sendFn, broadcastFn) {
  const roomId = `duel_${gameId}_${randomUUID().slice(0, 8)}`;
  const seed = Math.floor(Math.random() * 9000000) + 1000000;

  try {
    const dbA = await userService.ensureUser({ id: entryA.player.id, username: entryA.player.username, avatarUrl: entryA.player.avatar });
    entryA.player.id = dbA.id; entryA.player.username = dbA.username;
    const dbB = await userService.ensureUser({ id: entryB.player.id, username: entryB.player.username, avatarUrl: entryB.player.avatar });
    entryB.player.id = dbB.id; entryB.player.username = dbB.username;
  } catch (err) {
    console.error('[RoomFactory] ensureUser error:', err.message);
  }

  const now = Date.now();
  const room = {
    roomId,
    gameId,
    status: 'COUNTDOWN',
    seed,
    isGhostMatch: false,
    playerA: { ...entryA.player, socket: entryA.socket, score: 0, lastTick: { timestamp: now, score: 0, x: 0, y: 0 }, tickHistory: [] },
    playerB: { ...entryB.player, socket: entryB.socket, score: 0, lastTick: { timestamp: now, score: 0, x: 0, y: 0 }, tickHistory: [] },
    startedAt: now,
  };

  sendFn(entryA.socket, { event: 'MATCH_START', roomId, seed, role: 'PLAYER_A', player: entryA.player, opponent: entryB.player });
  sendFn(entryB.socket, { event: 'MATCH_START', roomId, seed, role: 'PLAYER_B', player: entryB.player, opponent: entryA.player });

  setTimeout(() => {
    if (room.status === 'COUNTDOWN') {
      room.status = 'PLAYING';
      room.liveAt = Date.now();
      room.playerA.lastTick.timestamp = room.liveAt;
      room.playerB.lastTick.timestamp = room.liveAt;
      broadcastFn(roomId, { event: 'MATCH_LIVE' });
    }
  }, 3000);

  return room;
}

export async function createGhostRoom(gameId, entry, callbacks, sendFn) {
  const { room, rival, roomId, seed } = buildGhostRoom(gameId, entry, callbacks);

  try {
    const dbRival = await userService.ensureUser({ id: rival.id, username: rival.username, avatarUrl: rival.avatar });
    if (dbRival) {
      rival.id = dbRival.id;
      room.playerB.id = dbRival.id;
    }
    const dbPlayer = await userService.ensureUser({ id: entry.player.id, username: entry.player.username, avatarUrl: entry.player.avatar });
    if (dbPlayer) {
      entry.player.id = dbPlayer.id;
      room.playerA.id = dbPlayer.id;
    }
  } catch (e) {
    console.warn('[RoomFactory] Failed to ensure ghost bot user:', e.message);
  }

  sendFn(entry.socket, { event: 'MATCH_START', roomId, seed, role: 'PLAYER_A', player: entry.player, opponent: rival });
  return { room, roomId };
}
