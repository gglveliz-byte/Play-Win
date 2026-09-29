/**
 * PLAY WIN BRIDGE — AVISOS DE ESTADO AL JUGADOR (playwin-bridge-status.js)
 * ==============================================================================
 * Helpers genéricos para mostrar y ocultar la pantalla de servicio no
 * disponible y el banner de reconexión.
 *
 * ¿Por qué existe? Porque el SDK no debe fallar en silencio (BUG-022): cuando el
 * servidor de duelos no responde, el jugador TIENE que verlo. Centralizar estos
 * helpers mantiene playwin-bridge.js por debajo del límite de 350 líneas.
 * ==============================================================================
 */
(function () {
  'use strict';

  /** Muestra un elemento por id añadiéndole la clase `active`. */
  function activate(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  /** Oculta un elemento por id quitándole la clase `active`. */
  function deactivate(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('active');
  }

  /**
   * Muestra la pantalla de servicio no disponible con un detalle técnico.
   * @param {string} screenId Id de la pantalla (por defecto `pw-screen-offline`).
   * @param {string} detailId Id del párrafo de detalle (`pw-offline-detail`).
   * @param {string} [motivo] Texto técnico: normalmente la URL intentada.
   */
  function showOffline(screenId, detailId, motivo) {
    var detail = document.getElementById(detailId);
    if (detail && motivo) {
      detail.textContent = motivo;
      detail.classList.add('active');
    }
    var screen = document.getElementById(screenId);
    if (screen) {
      document.querySelectorAll('.pw-screen').forEach(function (s) { s.classList.remove('active'); });
      screen.classList.add('active');
    }
  }

  /** Oculta la pantalla de indisponibilidad y limpia su detalle. */
  function hideOffline(detailId) {
    deactivate(detailId);
  }

  /** Muestra el banner superior con un mensaje (ej. conexión perdida). */
  function showBanner(bannerId, texto) {
    var el = document.getElementById(bannerId);
    if (el) {
      el.textContent = texto;
      el.classList.add('active');
    }
  }

  window.PLAYWIN_STATUS = {
    activate: activate,
    deactivate: deactivate,
    showOffline: showOffline,
    hideOffline: hideOffline,
    showBanner: showBanner,
  };
})();
