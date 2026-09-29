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

/**
 * Decide quién gana cuando caen los DOS jugadores en un juego de supervivencia.
 *
 * En Sky Runner la puntuación es el **tiempo sobrevivido**, así que gana quien
 * aguantó más. Este caso importa: los dos jugadores recorren el mismo circuito
 * determinista, así que caer a la vez es habitual, y antes el duelo se cerraba
 * con el primer aviso dejando al otro sin resultado.
 *
 * @param {string} nombreA Jugador A.
 * @param {number} tiempoA Tiempo sobrevivido por A.
 * @param {string} nombreB Jugador B.
 * @param {number} tiempoB Tiempo sobrevivido por B.
 * @returns {{ganador: string, perdedor: string, empate: boolean, resumen: string}}
 */
export function resolverDobleCaida(nombreA, tiempoA, nombreB, tiempoB) {
  if (tiempoA === tiempoB) {
    // Empate exacto: no se inventa un mérito que no existe.
    return {
      ganador: nombreA,
      perdedor: nombreB,
      empate: true,
      resumen: `Los dos cayeron a la vez con ${tiempoA}. Empate técnico.`,
    };
  }

  const ganaA = tiempoA > tiempoB;
  const tGanador = ganaA ? tiempoA : tiempoB;
  const tPerdedor = ganaA ? tiempoB : tiempoA;

  return {
    ganador: ganaA ? nombreA : nombreB,
    perdedor: ganaA ? nombreB : nombreA,
    empate: false,
    resumen: `${ganaA ? nombreB : nombreA} cayó antes: aguantó ${tPerdedor} frente a ${tGanador}.`,
  };
}
