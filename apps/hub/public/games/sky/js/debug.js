/**
 * PLAY WIN — SKY RUNNER 3D · DIAGNÓSTICO EN PANTALLA (debug.js)
 * ==============================================================================
 * Muestra el estado interno del motor dentro del propio juego.
 *
 * ¿Por qué existe? Diagnosticar una partida que «se queda parada» obligaba a
 * abrir la consola del navegador y pedir capturas. Con esto basta con añadir
 * `?debug=1` a la URL del juego: el panel dice el estado, si el SDK cree que la
 * partida sigue viva, la puntuación y si el rival está conectado.
 *
 * NO se activa por defecto: sólo con `?debug=1`, para no ensuciar la partida.
 * ==============================================================================
 */

/** ¿Se ha pedido el diagnóstico en la URL? */
export function debugActivado() {
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

/**
 * Arranca el panel de diagnóstico.
 *
 * @param {() => object} leerEstado Devuelve el estado actual del motor.
 * @param {number} [cadaMs] Frecuencia de refresco.
 */
export function iniciarPanelDebug(leerEstado, cadaMs = 200) {
  const panel = document.getElementById('debug-panel');
  if (!panel) {
    console.warn('[SkyRunner] No se encontró #debug-panel; el diagnóstico no se mostrará.');
    return;
  }
  panel.classList.add('active');

  setInterval(() => {
    const e = leerEstado();
    const vivo = e.vivoSdk;
    // Señal clave: el motor cree que juega pero el SDK ya no considera viva la
    // partida. Entonces no se envían ticks y el juego parece congelado.
    const congelado = e.estado === 'PLAYING' && vivo === false;

    panel.textContent = [
      `estado    ${e.estado}${congelado ? '   <-- CONGELADO' : ''}`,
      `vivo(SDK) ${vivo}`,
      `puntos    ${e.puntuacion}`,
      `pasos     ${e.pasosVivo}`,
      `z         ${e.z.toFixed(1)}`,
      `rival     ${e.rivalConectado ? `sí  z=${e.rivalZ.toFixed(0)}` : 'NO'}`,
      `semilla   ${e.semilla}`,
    ].join('\n');
  }, cadaMs);
}
