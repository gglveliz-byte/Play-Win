import { randomUUID } from 'node:crypto';
import { userService, query } from '@playwin/database';
import { resolveRankTier } from '@playwin/database/constants';
import { buildGhostRoom } from './ghost-bot.js';

/**
 * Resuelve la división real del jugador en un juego desde su pasaporte.
 *
 * Se consulta la base de datos a propósito: el rango que envía el cliente NO es
 * fiable, y usarlo permitiría a un jugador de BRONCE pedir un rival fácil.
 *
 * @returns {Promise<string|undefined>} División (BRONZE..ELITE) o undefined si
 *   el jugador aún no tiene pasaporte.
 */
async function resolvePlayerTier(userId, gameId) {
  try {
    const res = await query('SELECT skill_rating FROM game_passports WHERE user_id = $1 AND game_id = $2;', [
      userId,
      gameId,
    ]);
    const rating = res.rows[0]?.skill_rating;
    return rating === undefined || rating === null ? undefined : resolveRankTier(rating);
  } catch (err) {
    // Si la consulta falla, se empareja con la lista completa antes que dejar
    // al jugador esperando indefinidamente.
    console.warn('[RoomFactory] No se pudo resolver la división del jugador:', err.message);
    return undefined;
  }
}

/**
 * Quita el token de partida antes de enviar datos de un jugador al cliente.
 *
 * El MatchTicket es una credencial: con él se puede abrir una conexión al
 * servidor de duelos haciéndose pasar por ese jugador. Enviar el del RIVAL no
 * tiene ninguna utilidad —el juego sólo necesita su alias, avatar y división— y
 * lo exponía a cualquiera que mirase el tráfico del WebSocket.
 *
 * @param {object} jugador Datos del jugador.
 * @returns {object} Copia sin el token.
 */
function sinToken(jugador) {
  if (!jugador) return jugador;
  const { token, ...resto } = jugador;
  return resto;
}

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

  sendFn(entryA.socket, { event: 'MATCH_START', roomId, seed, role: 'PLAYER_A', player: sinToken(entryA.player), opponent: sinToken(entryB.player) });
  sendFn(entryB.socket, { event: 'MATCH_START', roomId, seed, role: 'PLAYER_B', player: sinToken(entryB.player), opponent: sinToken(entryA.player) });

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
  // La división del jugador se lee de SU pasaporte (dato del servidor, no del
  // cliente) para elegir un rival del mismo nivel. Sin esto, a un jugador de ORO
  // podía tocarte un bot DIAMANTE.
  const preferredTier = await resolvePlayerTier(entry.player.id, gameId);

  const { room, rival, roomId, seed } = buildGhostRoom(gameId, entry, callbacks, preferredTier);

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

  // `isBot` viaja al cliente para que la interfaz pueda indicar claramente que
  // el rival es un relleno y no una persona. Ocultarlo es deshonesto.
  sendFn(entry.socket, {
    event: 'MATCH_START',
    roomId,
    seed,
    role: 'PLAYER_A',
    player: sinToken(entry.player),
    opponent: { ...sinToken(rival), isBot: true },
  });
  return { room, roomId };
}
