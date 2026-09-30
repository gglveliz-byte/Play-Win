/**
 * PLAY WIN REALTIME — VIGILANTE DE ESTANCAMIENTO (stall-watch.js)
 * ==============================================================================
 * Detecta una partida en la que NADIE está jugando y la cierra.
 *
 * ¿Por qué hace falta? Si los dos clientes se quedan mudos a la vez (el motor del
 * juego se congela, el navegador suspende la pestaña, se cae el wifi de los dos),
 * el servidor no recibía ninguna señal: ni caída, ni rendición, ni desconexión.
 * La partida se quedaba abierta y los jugadores veían su marcador congelado SIN
 * RESULTADO hasta que expiraba el tope de 3 minutos.
 *
 * Regla: si NINGUNO de los dos ha enviado telemetría en 8 segundos, la partida
 * está abandonada. Se cierra con el mismo criterio que el tope de tiempo (gana
 * quien más aguantó) y con un texto que explica lo que pasó.
 *
 * Distinción importante: si sólo UNO se queda mudo, NO se cierra nada. Ese caso
 * ya lo cubre la ventana de reconexión de 15s, y cerrar aquí castigaría a quien
 * sí está jugando.
 * ==============================================================================
 */

/** Silencio de AMBOS jugadores que se considera abandono. */
export const SILENCIO_ABANDONO_MS = 8000;

/** Cada cuánto se revisa la actividad. */
const INTERVALO_REVISION_MS = 1000;

/**
 * Vigila la actividad de una sala y avisa cuando se abandona.
 *
 * @param {object} room Sala en juego.
 * @param {() => void} alAbandonar Qué hacer cuando los dos callan.
 * @returns {() => void} Función para detener la vigilancia.
 */
export function vigilarEstancamiento(room, alAbandonar) {
  const vigilante = setInterval(() => {
    if (room.status !== 'PLAYING') return;

    const ahora = Date.now();
    const ultimoDe = (jugador) => jugador?.lastTick?.timestamp ?? room.liveAt ?? room.startedAt ?? ahora;

    // Se cuenta desde la señal MÁS RECIENTE de cualquiera de los dos. Así, si uno
    // sigue jugando, el silencio del otro no dispara nada.
    const ultimaSenal = Math.max(ultimoDe(room.playerA), ultimoDe(room.playerB));

    if (ahora - ultimaSenal >= SILENCIO_ABANDONO_MS) {
      detenerVigilancia(room);
      alAbandonar();
    }
  }, INTERVALO_REVISION_MS);

  room.stallWatch = vigilante;
  return () => detenerVigilancia(room);
}

/** Detiene la vigilancia de una sala. */
export function detenerVigilancia(room) {
  if (room && room.stallWatch) {
    clearInterval(room.stallWatch);
    room.stallWatch = null;
  }
}

/** Motivo con el que se cierra una partida abandonada. */
export const MOTIVO_ABANDONO = 'ABANDONED';

/**
 * Vigila una sala recién creada y la cierra si los dos jugadores callan.
 *
 * Se encarga de todo: comprobar que la sala sigue viva antes de cerrar (puede
 * haber terminado por otra vía mientras tanto) y resolver por puntuación, que es
 * el mismo criterio que el tope de tiempo.
 *
 * @param {object} room Sala en juego.
 * @param {(roomId: string) => object|undefined} obtenerSala Acceso a la sala viva.
 * @param {(room: object, motivo: string) => void} resolver Cómo se decide el ganador.
 */
export function vigilarAbandonoDeSala(room, obtenerSala, resolver) {
  vigilarEstancamiento(room, () => {
    const actual = obtenerSala(room.roomId);
    // Si la sala ya no está o ya terminó, no hay nada que cerrar.
    if (!actual || actual.status !== 'PLAYING') return;
    resolver(actual, MOTIVO_ABANDONO);
  });
}

/**
 * Texto que explica un cierre por abandono.
 *
 * @param {string} nombreGanador Quién iba ganando.
 * @param {number} marca Tiempo que aguantó.
 * @returns {string}
 */
export function resumenPorAbandono(nombreGanador, marca) {
  return `Ninguno de los dos siguió jugando. Gana ${nombreGanador} con ${marca}s.`;
}
