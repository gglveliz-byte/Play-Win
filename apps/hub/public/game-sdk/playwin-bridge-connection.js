/**
 * PLAY WIN BRIDGE — GESTIÓN DE CONEXIÓN (playwin-bridge-connection.js)
 * ==============================================================================
 * Encapsula el ciclo de vida del WebSocket: conectar, detectar caídas, avisar
 * al jugador y reintentar.
 *
 * ¿Por qué existe este módulo?
 * Antes, un fallo de conexión ANTES de empezar la partida no se comunicaba en
 * ninguna parte: los manejadores estaban condicionados a `isMatchLive`, así que
 * el jugador se quedaba mirando el radar indefinidamente sin saber que el
 * servidor de duelos no existía (BUG-022). Además no había timeout: un socket
 * atascado en CONNECTING no producía ningún aviso.
 *
 * Debe cargarse ANTES que playwin-bridge.js:
 *   <script src="/game-sdk/playwin-bridge-connection.js"></script>
 * ==============================================================================
 */
(function () {
  'use strict';

  /** Tiempo máximo para establecer la conexión, en milisegundos. */
  var CONNECT_TIMEOUT_MS = 10000;

  // Versión de la API del SDK. Se compara con la que espera el puente para
  // detectar que el navegador sirvió una copia cacheada de otro módulo.
  var SDK_VERSION = 4;

  /**
   * Crea el gestor de conexión de una sesión de juego.
   *
   * @param {object} api Callbacks que aporta el SDK (evita acoplar este módulo
   *   a sus variables internas).
   * @param {() => string} api.wsUrl URL del servidor de duelos.
   * @param {() => object} api.joinPayload Datos del mensaje JOIN_MATCH.
   * @param {() => boolean} api.isMatchLive Si hay partida en curso.
   * @param {(motivo: string) => void} api.onOffline Mostrar pantalla de caída.
   * @param {() => void} api.onOnline Conexión establecida.
   * @param {(texto: string) => void} api.onBanner Aviso durante la partida.
   */
  function createConnectionManager(api) {
    var socket = null;
    var connectTimer = null;
    var isOffline = false;

    /** Avisa de la caída una sola vez hasta que se recupere. */
    function reportOffline(motivo) {
      if (isOffline) return;
      isOffline = true;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      api.onOffline(motivo);
    }

    function handleOpen() {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      var recovered = isOffline;
      isOffline = false;
      api.onOnline(recovered);
      socket.send(JSON.stringify(api.joinPayload()));
    }

    function handleClose() {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (api.isMatchLive()) {
        // En partida: el servidor concede 15 s de gracia, se reintenta solo.
        api.onBanner('⚠️ Conexión perdida. Reconectando...');
        setTimeout(function () {
          if (!socket || socket.readyState === WebSocket.CLOSED) connect();
        }, 1000);
      } else {
        reportOffline('No se pudo conectar con ' + api.wsUrl());
      }
    }

    function connect() {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

      socket = new WebSocket(api.wsUrl());

      // Sin este timeout, una URL mal configurada o un firewall dejaban el
      // socket en CONNECTING para siempre, sin ningún aviso al jugador.
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = setTimeout(function () {
        if (socket && socket.readyState === WebSocket.CONNECTING) {
          try { socket.close(); } catch (_) {}
          reportOffline('Sin respuesta de ' + api.wsUrl() + ' tras ' + (CONNECT_TIMEOUT_MS / 1000) + 's');
        }
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = handleOpen;
      socket.onclose = handleClose;
      socket.onerror = function () {
        if (!api.isMatchLive()) reportOffline('No se pudo conectar con ' + api.wsUrl());
      };
    }

    return {
      /** Abre la conexión (idempotente). */
      connect: connect,
      /** Descarta el socket actual y vuelve a intentarlo desde cero. */
      retry: function () {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
        socket = null;
        isOffline = false;
        connect();
      },
      getSocket: function () { return socket; },
      setOnMessage: function (handler) { if (socket) socket.onmessage = handler; },
      isOpen: function () { return !!socket && socket.readyState === WebSocket.OPEN; },
      isOffline: function () { return isOffline; },
      clearOffline: function () { isOffline = false; }
    };
  }

  window.PLAYWIN_CONNECTION = {
    createConnectionManager: createConnectionManager,
    CONNECT_TIMEOUT_MS: CONNECT_TIMEOUT_MS,
    SDK_VERSION: SDK_VERSION,
  };
})();
