/**
 * PLAY WIN REALTIME — RELOJ DEL DUELO (match-clock.js)
 * ==============================================================================
 * Pone un tope de duración a cada partida.
 *
 * ¿Por qué existe? Sin este tope un duelo podía no terminar NUNCA. Ocurre de
 * verdad: en Sky Runner los dos jugadores avanzan al mismo ritmo y la pista
 * siempre ofrece un paso practicable, así que dos jugadores buenos pueden
 * sobrevivir indefinidamente. La sala se quedaba abierta, no se registraba
 * resultado y el emparejamiento no se liberaba.
 *
 * Al agotarse el tiempo gana quien más puntuación tenga (en carreras, más
 * distancia recorrida; en Sky Runner, más tiempo sobrevivido).
 * ==============================================================================
 */
import { MATCH_TIME_LIMIT_MS } from '@playwin/database/constants';

/** Motivo con el que se cierra un duelo que agotó su tiempo. */
export const MOTIVO_TIEMPO_AGOTADO = 'TIME_LIMIT';

/**
 * Arranca el reloj máximo de una sala.
 *
 * @param {object} room Sala recién creada (se le añade `matchClock`).
 * @param {(room: object, motivo: string) => void} resolver Cómo se decide el ganador.
 * @param {(roomId: string) => object|undefined} obtenerSala Acceso a la sala viva.
 */
export function startMatchClock(room, resolver, obtenerSala) {
  cancelMatchClock(room);
  room.matchClock = setTimeout(() => {
    const actual = obtenerSala(room.roomId);
    // Sólo se resuelve si el duelo sigue vivo: si ya terminó (alguien cayó, se
    // rindió o se desconectó sin volver), el reloj no debe hacer nada.
    if (actual && actual.status === 'PLAYING') {
      resolver(actual, MOTIVO_TIEMPO_AGOTADO);
    }
  }, MATCH_TIME_LIMIT_MS);
}

/** Cancela el reloj de una sala si sigue pendiente. */
export function cancelMatchClock(room) {
  if (room && room.matchClock) {
    clearTimeout(room.matchClock);
    room.matchClock = null;
  }
}

/**
 * Texto del resultado cuando se agota el tiempo.
 *
 * @param {string} ganador Nombre de quien iba por delante.
 * @param {number} marca Su puntuación.
 * @returns {string}
 */
export function resumenPorTiempo(ganador, marca) {
  return `Se agotó el tiempo del duelo: ${ganador} iba por delante con ${marca}.`;
}
