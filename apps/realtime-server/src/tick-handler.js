/**
 * PLAY WIN REALTIME — PROCESAMIENTO DE TICKS (tick-handler.js)
 * ==============================================================================
 * Recibe la telemetría de un jugador y hace las tres cosas que exige el
 * reglamento (Zero Client Trust):
 *
 *   1. Comprueba el ritmo de paquetes (anti-macro / anti-flood).
 *   2. Valida la física del avance (anti-speedhack).
 *   3. Reenvía el estado al rival, que es lo que dibuja su fantasma.
 *
 * Se extrajo de rooms.js para respetar el límite de 350 líneas de
 * playwin-code-governance.
 * ==============================================================================
 */
import { validateTickPhysics, validatePacketRate } from './anticheat.js';

/**
 * Procesa un tick de un jugador.
 *
 * @param {object} deps
 * @param {Map<any, string>} deps.socketToRoom Índice socket -> sala.
 * @param {Map<string, any>} deps.rooms Salas activas.
 * @param {(socket: any, message: object) => void} deps.send Envío directo.
 * @param {(socket: any, reason: string) => void} deps.descalificar Cierre por trampa.
 * @param {any} socket Socket del jugador que reporta.
 * @param {object} tickData Telemetría: { x, y, score, isAlive }.
 */
export function handlePlayerTick({ socketToRoom, rooms, send, descalificar }, socket, tickData) {
  const roomId = socketToRoom.get(socket);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room || room.status !== 'PLAYING') return;

  const isPlayerA = socket === room.playerA.socket;
  const curPlayer = isPlayerA ? room.playerA : room.playerB;
  const targetSocket = isPlayerA ? room.playerB?.socket : room.playerA?.socket;

  // ── 1. Ritmo de paquetes ────────────────────────────────────────────────
  const rateCheck = validatePacketRate(curPlayer.tickHistory, Date.now());
  if (!rateCheck.valid) {
    descalificar(socket, rateCheck.reason);
    return;
  }
  curPlayer.tickHistory = rateCheck.history;

  // ── 2. Física del avance ────────────────────────────────────────────────
  const currentTick = {
    timestamp: Date.now(),
    x: tickData.x || 0,
    y: tickData.y || 0,
    score: tickData.score || 0,
  };
  const physicsCheck = validateTickPhysics(room.gameId, curPlayer.lastTick, currentTick, room.liveAt || room.startedAt);

  if (!physicsCheck.valid) {
    curPlayer.cheatStrikes = (curPlayer.cheatStrikes || 0) + 1;
    // Una anomalía grave basta; dos leves también. Antes esto se decidía dentro
    // de rooms.js junto al resto del árbitro.
    if (physicsCheck.severity === 'HIGH' || curPlayer.cheatStrikes >= 2) {
      descalificar(socket, physicsCheck.reason);
      return;
    }
  } else if (curPlayer.cheatStrikes > 0) {
    // El jugador se va redimiendo: las marcas bajan de medio en medio.
    curPlayer.cheatStrikes = Math.max(0, curPlayer.cheatStrikes - 0.5);
  }

  // ── 3. Estado aceptado y reenvío al rival ───────────────────────────────
  curPlayer.score = currentTick.score;
  curPlayer.lastTick = currentTick;

  if (targetSocket) {
    send(targetSocket, {
      event: 'RIVAL_TICK',
      x: currentTick.x,
      y: currentTick.y,
      score: currentTick.score,
      isAlive: tickData.isAlive ?? true,
    });
  }
}
