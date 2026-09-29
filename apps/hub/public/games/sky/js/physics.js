/**
 * PLAY WIN — SKY RUNNER 3D · FÍSICA (physics.js)
 * ==============================================================================
 * Simulación del corredor: avance, giro, salto y caída al abismo.
 *
 * Se separó de game.js para respetar el límite de tamaño de archivo y para que
 * la orquestación (estados, SDK, render) quede legible de un vistazo.
 *
 * Regla del juego: es una prueba de SUPERVIVENCIA. Los dos jugadores avanzan al
 * mismo ritmo, así que lo único que decide el duelo es quién cae al abismo.
 * Por eso lo que se puntúa es el TIEMPO sobrevivido, no la distancia: la
 * distancia sería idéntica para los dos y el duelo no podría decidirse.
 * ==============================================================================
 */
import { cameraInFront } from './renderer.js';

/** Gravedad por paso de simulación (el bucle va a 60 pasos por segundo). */
const GRAVEDAD = 0.006;
/** Impulso vertical de un salto. */
const IMPULSO_SALTO = 0.12;
/** Velocidad lateral máxima por paso. */
const VELOCIDAD_LATERAL = 0.11;
/** Altura por debajo de la cual se considera que el jugador ha caído. */
export const ALTURA_CAIDA = -4;

/** Estados en los que el jugador está compitiendo. */
const JUGANDO = 'PLAYING';
/** Estados en los que aún no hay partida. */
const EN_ESPERA = ['IDLE', 'READY'];

/**
 * Avanza un paso de simulación.
 *
 * @param {object} st Estado mutable del juego (se modifica en el sitio).
 * @param {object} deps Dependencias externas.
 * @param {number} deps.limiteX Límite lateral de la pista.
 * @param {(x: number) => number} deps.carrilDe Carril ocupado por una posición.
 * @param {object} deps.trackManager Generador de circuito.
 * @param {object} deps.audio Sistema de sonido.
 * @param {() => void} deps.alCaer Se llama la primera vez que el jugador cae.
 */
export function pasoDeFisica(st, deps) {
  const { limiteX, carrilDe, trackManager, audio, alCaer } = deps;
  const { Clamp, Lerp } = st;

  // ------------------------------------------------------------------
  // ANTES DE LA PARTIDA NO SE JUEGA
  //
  // `gameState` arranca en IDLE, y antes aquí se hacía `z += 0.12`: la pista
  // empezaba a avanzar en cuanto se abría la página, así que el primer jugador
  // que entraba veía el escenario desplazarse y parecía que ya estaba jugando
  // (sin rival, sin marcador y sin forma de perder). Lo reportado como
  // «puede jugar solito».
  // ------------------------------------------------------------------
  if (EN_ESPERA.includes(st.gameState)) {
    st.y = 0;
    st.vy = 0;
    // Balanceo suave del encuadre: da vida sin simular que se avanza.
    st.vistaPrevia = Math.sin(Date.now() * 0.0012) * 0.6;
    return;
  }
  st.vistaPrevia = 0;

  if (st.gameState === JUGANDO) {
    // El tiempo sobrevivido ES la puntuación.
    st.pasosVivo++;
    st.puntuacion = Math.floor(st.pasosVivo / 60);

    if (st.keyLeft) st.steerInput = Lerp(0.28, st.steerInput, -1);
    else if (st.keyRight) st.steerInput = Lerp(0.28, st.steerInput, 1);
    else if (st.touchDriving) st.steerInput = Lerp(0.35, st.steerInput, st.touchSteer);
    else st.steerInput = Lerp(0.32, st.steerInput, 0);

    st.x = Clamp(st.x + st.steerInput * VELOCIDAD_LATERAL, -limiteX, limiteX);

    if (st.jumpBufferTimer > 0) st.jumpBufferTimer--;
    st.y += (st.vy -= GRAVEDAD);
    st.z += Math.min(0.5, 0.2 + st.z / 5000);

    const fila = trackManager.getRow((st.z + cameraInFront) | 0);
    const sobrePista = fila && fila[carrilDe(st.x)];

    if (st.y <= 0.05 && st.y >= -0.35 && sobrePista) {
      if (st.jumpBufferTimer > 0 || st.jumpHeld) {
        st.y = 0.06;
        st.vy = IMPULSO_SALTO;
        st.jumpBufferTimer = 0;
        audio.playJump();
      } else {
        st.y = 0;
        st.vy = 0;
      }
    }

    if (st.y <= ALTURA_CAIDA) {
      // `notifyCrash()` sólo avisa si la partida sigue viva. Si el rival cayó
      // antes, el servidor ya cerró el duelo y este aviso se descarta (correcto:
      // no se puede perder dos veces). El resultado llega igual, por el rival.
      st.gameState = 'CRASHED';
      audio.playGameOver();
      alCaer();
    }

    trackManager.cleanup((st.z - 25) | 0);
    return;
  }

  if (st.gameState === 'CRASHED') {
    // La bola sigue cayendo fuera de cámara hasta desaparecer.
    if (st.y > -15) st.y += (st.vy -= GRAVEDAD);
  }
}
