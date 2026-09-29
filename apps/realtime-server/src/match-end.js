/**
 * PLAY WIN REALTIME — CIERRE DE DUELOS (match-end.js)
 * ==============================================================================
 * Las formas en que puede acabar una partida:
 *
 *   1. EMPATE: los dos aguantaron exactamente lo mismo.
 *   2. VICTORIA de uno (el rival cayó, se rindió o fue descalificado).
 *
 * Todas comparten dos obligaciones: avisar a LOS DOS jugadores con el MISMO
 * resultado y registrar la partida. Centralizarlo evita que una vía se olvide de
 * algo: pasó con el empate, que se anunciaba como tal pero repartía puntos de
 * victoria y derrota, así que la interfaz mostraba ¡VICTORIA! y DERROTA.
 *
 * Se extrajo de rooms.js para respetar el límite de 350 líneas.
 * ==============================================================================
 */

/** Puntos de temporada que recibe CADA jugador en un empate. */
export const PUNTOS_EMPATE = 50;
/** Puntos de temporada del ganador. */
export const PUNTOS_VICTORIA = 100;
/** Puntos de temporada del perdedor. */
export const PUNTOS_DERROTA = 20;

/**
 * Marca la sala como terminada y cancela sus relojes pendientes.
 *
 * El orden importa: hay que cerrar la sala ANTES de avisar. Si se avisa primero,
 * un reloj que esté a punto de dispararse (la ventana de cortesía, el tope de
 * tiempo) ve la sala todavía en `PLAYING` y **cierra el duelo una segunda vez**,
 * con otro ganador distinto. El jugador recibe dos resultados contradictorios y
 * el juego se queda en un estado inconsistente.
 *
 * @param {object} room Sala del duelo.
 * @param {(roomId: string, delayMs: number) => void} limpiar Limpieza diferida.
 */
function cerrarSala(room, limpiar) {
  room.status = 'FINISHED';
  if (room.cortesiaTimer) {
    clearTimeout(room.cortesiaTimer);
    room.cortesiaTimer = null;
  }
  if (room.finishTimer) {
    clearTimeout(room.finishTimer);
    room.finishTimer = null;
  }
  if (room.matchClock) {
    clearTimeout(room.matchClock);
    room.matchClock = null;
  }
  if (room.ghostSimulation) room.ghostSimulation.stop();
  limpiar(room.roomId, 6000);
}

/**
 * Avisa a la sala y guarda la partida en el historial.
 *
 * @param {object} ctx Dependencias del gestor de salas.
 * @param {(roomId: string, message: object) => void} ctx.broadcast Aviso a la sala.
 * @param {object} ctx.matchService Servicio de persistencia.
 * @param {(roomId: string, delayMs: number) => void} ctx.limpiar Limpieza diferida.
 * @param {object} room Sala del duelo.
 * @param {object} aviso Mensaje MATCH_END que reciben los dos jugadores.
 * @param {object} registro Datos para el historial.
 */
function cerrar(ctx, room, aviso, registro) {
  // La sala se cierra ANTES de avisar: así ningún reloj pendiente la ve en
  // PLAYING y no puede cerrar el duelo por segunda vez con otro ganador. Ocurría
  // de verdad: tras un empate llegaba un segundo MATCH_END con un ganador
  // distinto y el juego quedaba en un estado inconsistente.
  cerrarSala(room, ctx.limpiar);

  ctx.broadcast(room.roomId, aviso);

  ctx.matchService
    .recordMatch({
      roomId: room.roomId,
      gameId: room.gameId,
      player1Id: room.playerA.id,
      player2Id: room.playerB.id,
      winnerId: aviso.winnerId,
      p1Score: room.playerA.score || 0,
      p2Score: room.playerB.score || 0,
      seed: room.seed,
      finishReason: aviso.reason,
      durationMs: Date.now() - room.startedAt,
      p1PointsDelta: registro.puntosA,
      p2PointsDelta: room.isGhostMatch ? 0 : registro.puntosB,
    })
    .catch((err) => console.error('[MatchEnd] recordMatch error:', err.message));
}

/**
 * Cierra el duelo en EMPATE: sin ganador y con los mismos puntos para los dos.
 *
 * @param {object} ctx Dependencias del gestor de salas.
 * @param {object} room Sala del duelo.
 * @param {string} resumen Explicación del empate.
 */
export function cerrarEnEmpate(ctx, room, resumen) {
  cerrar(
    ctx,
    room,
    {
      event: 'MATCH_END',
      isDraw: true,
      winnerId: null,
      loserId: null,
      reason: 'DRAW',
      summary: resumen,
      payout: { winnerSeasonPoints: PUNTOS_EMPATE, loserSeasonPoints: PUNTOS_EMPATE },
    },
    { puntosA: PUNTOS_EMPATE, puntosB: PUNTOS_EMPATE }
  );
}

/**
 * Cierra el duelo con un ganador.
 *
 * @param {object} ctx Dependencias del gestor de salas.
 * @param {object} room Sala del duelo.
 * @param {object} ganador Jugador que gana.
 * @param {object} perdedor Jugador que pierde.
 * @param {string} motivo Código para el historial.
 * @param {string} resumen Texto explicativo.
 * @param {number} [puntosGanador] Puntos para el ganador.
 */
export function cerrarConGanador(ctx, room, ganador, perdedor, motivo, resumen, puntosGanador = PUNTOS_VICTORIA) {
  const ganaA = ganador.id === room.playerA.id;
  cerrar(
    ctx,
    room,
    {
      event: 'MATCH_END',
      isDraw: false,
      winnerId: ganador.id,
      loserId: perdedor.id,
      reason: motivo,
      summary: resumen,
      payout: { winnerSeasonPoints: puntosGanador, loserSeasonPoints: PUNTOS_DERROTA },
    },
    {
      puntosA: ganaA ? puntosGanador : PUNTOS_DERROTA,
      puntosB: ganaA ? PUNTOS_DERROTA : puntosGanador,
    }
  );
}
