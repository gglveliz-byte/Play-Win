/**
 * PLAY WIN REALTIME — ENTRADA A LA COLA (join-queue.js)
 * ==============================================================================
 * Todo lo que ocurre cuando un jugador pide entrar en un duelo:
 *
 *   1. Verifica su MatchTicket. Sin ticket válido no hay partida (Zero Client
 *      Trust: la identidad la dicta el token, nunca lo que envía el cliente).
 *   2. Si tenía una partida abierta (se le cayó la conexión), lo REANUDA en vez
 *      de emparejarlo de nuevo.
 *   3. Busca rival humano del mismo juego y evita la colusión.
 *   4. Si no hay nadie, lo deja esperando (y opcionalmente programa un bot).
 *
 * Se extrajo de rooms.js para respetar el límite de 350 líneas de
 * playwin-code-governance.
 * ==============================================================================
 */
import { verifyMatchTicket, detectCollusion, isSelfMatchAllowed } from './anticheat.js';

/** Estados en los que una partida sigue viva y admite reanudación. */
const ESTADOS_VIVOS = ['COUNTDOWN', 'PLAYING'];

/**
 * Mete a un jugador en la cola o lo reengancha a su partida en curso.
 *
 * @param {object} host El RoomManager (se pasan sus piezas explícitamente para
 *   no acoplar este módulo a su implementación).
 * @param {any} rawPlayer Datos enviados por el cliente (sin fiarse de ellos).
 * @param {any} socket Conexión del jugador.
 * @param {string} clientIp IP de origen, para detectar colusión.
 */
export function joinQueue(host, rawPlayer, socket, clientIp = '127.0.0.1') {
  const player = { ...rawPlayer };
  if (!player.token) return host.send(socket, { event: 'SECURITY_ERROR', message: 'Acceso denegado: Inicia sesión.' });

  const verified = verifyMatchTicket(player.token);
  if (!verified) return host.send(socket, { event: 'SECURITY_ERROR', message: 'Token de partida no válido o expirado.' });

  // La identidad sale del TOKEN, no del cliente.
  player.id = verified.sub;
  player.username = verified.username;
  player.avatar = verified.avatar || player.avatar;
  player.gameId = verified.gameId || player.gameId;
  const gameId = player.gameId || 'carreras';

  // ── 1. ¿Tiene una partida abierta que reanudar? ─────────────────────────
  let activeRoom = null;
  let isPlayerA = true;

  if (host.reconnectManager.isPending(player.id) || host.reconnectManager.isPending(player.username)) {
    const pending = host.reconnectManager.cancel(player.id) || host.reconnectManager.cancel(player.username);
    activeRoom = pending ? host.rooms.get(pending.roomId) : null;
  }

  if (!activeRoom) {
    for (const [, r] of host.rooms.entries()) {
      if (!ESTADOS_VIVOS.includes(r.status)) continue;
      const mismoA = r.playerA?.id === player.id || r.playerA?.username?.toLowerCase() === player.username?.toLowerCase();
      const mismoB = r.playerB?.id === player.id || r.playerB?.username?.toLowerCase() === player.username?.toLowerCase();
      if (mismoA || mismoB) {
        activeRoom = r;
        isPlayerA = mismoA;
        host.reconnectManager.cancel(player.id);
        host.reconnectManager.cancel(player.username);
        break;
      }
    }
  } else {
    isPlayerA = activeRoom.playerA.id === player.id || activeRoom.playerA.username?.toLowerCase() === player.username?.toLowerCase();
  }

  if (activeRoom && ESTADOS_VIVOS.includes(activeRoom.status)) {
    const [rec, opp] = isPlayerA ? [activeRoom.playerA, activeRoom.playerB] : [activeRoom.playerB, activeRoom.playerA];
    rec.socket = socket;
    host.socketToRoom.set(socket, activeRoom.roomId);
    if (activeRoom.isGhostMatch && activeRoom.ghostSimulation) activeRoom.ghostSimulation.resume();

    host.send(socket, {
      event: 'MATCH_RESUME',
      roomId: activeRoom.roomId,
      seed: activeRoom.seed,
      status: activeRoom.status,
      role: isPlayerA ? 'PLAYER_A' : 'PLAYER_B',
      player: { id: rec.id, username: rec.username, avatar: rec.avatar, score: rec.score },
      opponent: { username: opp.username, avatar: opp.avatar, rank: opp.rank, score: opp.score },
    });
    if (opp.socket) {
      host.send(opp.socket, { event: 'RIVAL_RECONNECTED', message: `${rec.username} se ha reconectado.` });
    }
    return;
  }

  // ── 2. Cola del juego ───────────────────────────────────────────────────
  if (!host.waitingQueues.has(gameId)) host.waitingQueues.set(gameId, []);
  const queue = host.waitingQueues.get(gameId);

  // Limpia las entradas de sockets ya cerrados.
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!queue[i].socket || queue[i].socket.readyState !== 1) {
      if (queue[i].matchTimer) clearTimeout(queue[i].matchTimer);
      queue.splice(i, 1);
    }
  }

  // Desvincula de una sala anterior (revuelta rápida).
  if (host.socketToRoom.has(socket)) {
    const oldId = host.socketToRoom.get(socket);
    host.socketToRoom.delete(socket);
    const oldR = host.rooms.get(oldId);
    if (oldR && oldR.status !== 'FINISHED') {
      oldR.status = 'FINISHED';
      if (oldR.ghostSimulation) oldR.ghostSimulation.stop();
    }
  }

  // Si este socket ya espera, no se duplica ni se reinicia su temporizador.
  if (queue.some((e) => e.socket === socket)) return;

  // ── 3. Buscar rival ─────────────────────────────────────────────────────
  // Emparejar contra uno mismo exige la bandera explícita ALLOW_SELF_MATCH
  // (antes dependía de NODE_ENV, lo que lo hacía implícito e intraducible a pruebas).
  const permitirUnoMismo = isSelfMatchAllowed();
  const opponentIdx = queue.findIndex((entry) =>
    permitirUnoMismo
      ? entry.socket !== socket
      : entry.player.id !== player.id && entry.player.username !== player.username
  );

  if (opponentIdx === -1) {
    // Sin rival humano: se espera. Si los bots están desactivados, el jugador
    // queda en cola indefinidamente (comportamiento deseado para probar PvP real).
    const queueEntry = { player, socket, ip: clientIp, matchTimer: null };
    if (host.ghostBotsEnabled) {
      queueEntry.matchTimer = setTimeout(() => {
        const q = host.waitingQueues.get(gameId);
        if (!q) return;
        const idx = q.indexOf(queueEntry);
        if (idx !== -1) {
          q.splice(idx, 1);
          host.startGhostMatch(gameId, queueEntry);
        }
      }, host.ghostBotDelayMs);
    }
    queue.push(queueEntry);
    host.send(socket, { event: 'MATCH_WAITING', gameId, message: 'Buscando contrincante en tu división...' });
    return;
  }

  const opponent = queue.splice(opponentIdx, 1)[0];
  if (opponent.matchTimer) clearTimeout(opponent.matchTimer);

  const collusion = detectCollusion(opponent, { player, socket, ip: clientIp });
  if (collusion.isCollusion) {
    host.send(socket, { event: 'SECURITY_WARNING', message: 'Emparejamiento bloqueado por colusión.' });
    return;
  }

  if (opponent.player.id === player.id) player.username = `${player.username} (Tab 2)`;
  host.createDuelRoom(gameId, opponent, { player, socket, ip: clientIp });
}
