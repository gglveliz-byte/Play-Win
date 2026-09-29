/**
 * PLAY WIN BRIDGE — MARKUP DE LAS 5 PANTALLAS ESTÁNDAR
 * ==============================================================================
 * Contiene el HTML del ciclo obligatorio de menús 1v1, separado del SDK para
 * que el SDK se ocupe solo de la lógica (protocolo, ticks, handshake) y no de
 * la maquetación.
 *
 * Se expone como global porque los juegos cargan el SDK con <script src> y no
 * como módulo ES. Debe cargarse ANTES que playwin-bridge.js:
 *
 *   <script src="/game-sdk/playwin-bridge-ui.js"></script>
 *   <script src="/game-sdk/playwin-bridge.js"></script>
 *
 * Si el global no está presente, el SDK avisa claramente en consola en lugar de
 * fallar en silencio.
 * ==============================================================================
 */
(function () {
  'use strict';

  window.PLAYWIN_UI_MARKUP = function buildMarkup(player) {
    return (
      '<div id="pw-reconnect-banner" class="pw-reconnect-banner"></div>' +

      // 1. Matchmaking (radar)
      '<div id="pw-screen-mm" class="pw-screen"><div class="pw-card">' +
        '<div class="pw-badge">PLAY WIN ARENA 1v1</div>' +
        '<div class="pw-radar-container"><div class="pw-radar-ring"></div><div class="pw-radar-center">⚡</div></div>' +
        '<h2 class="pw-title">Buscando Contrincante</h2><p class="pw-subtitle">Emparejando rival en tu división competitiva...</p>' +
        '<div class="pw-player-box" style="margin-bottom:20px;"><div class="pw-avatar-bubble">' + player.avatar + '</div>' +
        '<div class="pw-pname">' + player.username + '</div><span class="pw-prank">RATING ' + player.skillRating + '</span></div>' +
        '<button id="pw-btn-cancel-mm" class="pw-btn-pill pw-btn-secondary">Cancelar y Volver</button>' +
      '</div></div>' +

      // 2. Versus y conteo 3-2-1
      '<div id="pw-screen-vs" class="pw-screen"><div class="pw-card">' +
        '<div class="pw-badge">¡RIVAL ENCONTRADO!</div>' +
        '<div class="pw-versus-grid">' +
          '<div class="pw-player-box"><div class="pw-avatar-bubble">' + player.avatar + '</div>' +
          '<div class="pw-pname">' + player.username + '</div><span class="pw-prank">' + player.rank + '</span></div>' +
          '<div class="pw-vs-badge">VS</div>' +
          '<div class="pw-player-box"><div id="pw-opp-avatar" class="pw-avatar-bubble">🎯</div>' +
          '<div id="pw-opp-name" class="pw-pname">Oponente</div><span id="pw-opp-rank" class="pw-prank">—</span></div>' +
        '</div>' +
        '<div id="pw-countdown" class="pw-countdown-display">3</div>' +
        '<p id="pw-bot-badge" class="pw-bot-badge">🤖 Rival de entrenamiento — no había jugadores en cola</p>' +
        '<p class="pw-subtitle">Ambos compiten con la misma pista exacta.</p>' +
      '</div></div>' +

      // 3. HUD en vivo (sin botón de pausa)
      '<div id="pw-live-hud">' +
        '<div class="pw-hud-col"><span style="font-size:11px;font-weight:700;color:var(--pw-mute);">TÚ ' +
          '<span id="pw-hud-ping" class="pw-ping-badge">--ms</span></span>' +
          '<span id="pw-hud-my-score" class="pw-hud-score">0</span></div>' +
        '<div id="pw-hud-lead-badge" class="pw-lead-pill pw-lead-winning">EMPATADOS</div>' +
        '<div class="pw-hud-col"><span id="pw-hud-opp-name" style="font-size:11px;font-weight:700;color:var(--pw-mute);">RIVAL</span>' +
          '<span id="pw-hud-opp-score" class="pw-hud-score">0</span>' +
          '<span id="pw-hud-bot-badge" class="pw-hud-bot-badge">🤖 BOT</span>' +
          '<button id="pw-btn-surrender" class="pw-btn-surrender" title="Rendirse">Rendirse</button></div>' +
      '</div>' +

      // 4. Resultado final
      '<div id="pw-screen-result" class="pw-screen"><div class="pw-card">' +
        '<div id="pw-res-banner" class="pw-result-banner pw-result-win">¡VICTORIA!</div>' +
        '<p id="pw-res-summary" class="pw-subtitle">El oponente se estrelló contra un obstáculo.</p>' +
        '<div id="pw-res-points" class="pw-points-pill">+100 PUNTOS DE LIGA</div>' +
        '<div class="pw-btn-stack"><button id="pw-btn-rematch" class="pw-btn-pill">SIGUIENTE DUELO ➔</button>' +
        '<button id="pw-btn-lobby" class="pw-btn-pill pw-btn-secondary">VOLVER AL HUB</button></div>' +
      '</div></div>' +

      // 5. Acceso requerido
      '<div id="pw-screen-auth" class="pw-screen"><div class="pw-card">' +
        '<div class="pw-badge">ACCESO REQUERIDO</div>' +
        '<div class="pw-avatar-bubble" style="margin:0 auto 16px;font-size:32px;">🔐</div>' +
        '<h2 class="pw-title">Inicia Sesión para Competir</h2>' +
        '<p class="pw-subtitle">Sin iniciar sesión no es posible competir en duelos 1v1 oficiales ni acumular Season Points.</p>' +
        '<div class="pw-btn-stack" style="margin-top:20px;">' +
        '<button id="pw-btn-auth-login" class="pw-btn-pill">INICIAR SESIÓN / REGISTRARSE</button>' +
        '<button id="pw-btn-auth-back" class="pw-btn-pill pw-btn-secondary">VOLVER AL HUB</button></div>' +
      '</div></div>'
    );
  };
})();
