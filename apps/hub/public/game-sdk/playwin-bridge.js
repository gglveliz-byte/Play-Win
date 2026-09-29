// PLAY WIN GAME BRIDGE SDK — CLIENT ADAPTER (playwin-bridge.js)
// Protocolo Universal de Integración de Videojuegos 1v1 (< 350 líneas)
// Cumple AGENTS.md, playwin-realtime-duels y playwin-game-bridge.
(function () {
  'use strict';
  let WS_URL = window.PLAYWIN_WS_URL || 'ws://localhost:3001/ws';
  const isInIframe = window.parent && window.parent !== window;

  let currentGameId = 'flapy-flapy', matchCallbacks = {};
  let currentSeed = null, currentRoomId = null, opponentData = null;
  let targetOppState = { x: 0, y: 0, score: 0, isAlive: true };
  let opponentState = { x: 0, y: 0, score: 0, isAlive: true };
  let localScore = 0, isMatchLive = false, isHandshakeComplete = false;
  let pingTimer = null, afkTimer = null;
  // Gestor de conexión (ver BUG-022). Su ciclo de vida vive en
  // playwin-bridge-connection.js; aquí solo se guarda la instancia.
  let connection = null;
  // Estado de indisponibilidad, para que la UI no oculte el problema.
  let isOffline = false;
  // Reloj del aviso de espera prolongada (BUG-024).
  let waitingTimer = null;

  // Interpolación suave (Lerp 60Hz) para evitar saltos del rival en cualquier juego
  function updateLerp() {
    if (isMatchLive) {
      opponentState.x += (targetOppState.x - opponentState.x) * 0.28;
      opponentState.y += (targetOppState.y - opponentState.y) * 0.28;
      opponentState.score = targetOppState.score;
      opponentState.isAlive = targetOppState.isAlive;
    }
    requestAnimationFrame(updateLerp);
  }
  requestAnimationFrame(updateLerp);

  // El reloj de partida continúa en tiempo real (Zero Pause Trust)
  document.addEventListener('visibilitychange', () => {
    // No se congela ni se penaliza arbitrariamente: los relojes corren en tiempo real
  });

  let currentPlayer = (function () {
    try {
      const stored = localStorage.getItem('playwin_player_session');
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    const rId = 'usr_' + Math.floor(Math.random() * 8999 + 1000);
    return { id: rId, username: 'Piloto_' + rId.slice(-4), avatar: '🎮', rank: 'ORO', skillRating: 1820 };
  })();

  function applyPlayerSession(p) {
    if (!p) return;
    currentPlayer = {
      id: p.playerId || p.id || currentPlayer.id,
      username: p.username || currentPlayer.username,
      avatar: p.avatar || '🎮',
      rank: p.rank || 'ORO',
      skillRating: p.skillRating || 1820,
      token: p.token || currentPlayer.token || null,
    };
    try { localStorage.setItem('playwin_player_session', JSON.stringify(currentPlayer)); } catch (_) {}
    const q = (sel) => document.querySelector(sel);
    if (q('#pw-screen-mm .pw-avatar-bubble')) q('#pw-screen-mm .pw-avatar-bubble').textContent = currentPlayer.avatar;
    if (q('#pw-screen-mm .pw-pname')) q('#pw-screen-mm .pw-pname').textContent = currentPlayer.username;
    if (q('#pw-screen-mm .pw-prank')) q('#pw-screen-mm .pw-prank').textContent = `RATING ${currentPlayer.skillRating}`;
  }

  window.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'PLAYWIN_INIT') {
      const p = event.data.payload || event.data;
      if (p.wsUrl) WS_URL = p.wsUrl;
      applyPlayerSession(p);
      isHandshakeComplete = true;
      if (p.token) {
        if (!isSocketOpen()) connectWebSocket();
      } else { showScreen('pw-screen-auth'); }
    } else if (event.data.type === 'PLAYWIN_REQUIRE_LOGIN') {
      showScreen('pw-screen-auth');
    }
  });

  const STATUS = window.PLAYWIN_STATUS || {};
  const SCREEN_OFFLINE = 'pw-screen-offline';
  const DETAIL_OFFLINE = 'pw-offline-detail';
  const BANNER_ID = 'pw-reconnect-banner';

  const showReconnectBanner = (t) => STATUS.showBanner && STATUS.showBanner(BANNER_ID, t);
  const hideReconnectBanner = () => STATUS.deactivate && STATUS.deactivate(BANNER_ID);

  // Muestra la pantalla de servicio no disponible. Un fallo de conexión ANTES de
  // empezar la partida ya no es mudo (BUG-022): el jugador debe saber que el
  // servidor de duelos no responde, en lugar de mirar el radar indefinidamente.
  function showOfflineScreen(motivo) {
    isOffline = true;
    if (STATUS.showOffline) STATUS.showOffline(SCREEN_OFFLINE, DETAIL_OFFLINE, motivo);
  }

  // Limpia el estado de indisponibilidad al recuperar la conexión.
  function clearOffline() {
    isOffline = false;
    if (STATUS.hideOffline) STATUS.hideOffline(DETAIL_OFFLINE);
    hideReconnectBanner();
  }

  // Reintento manual desde el botón REINTENTAR.
  function retryConnection() {
    if (!connection) return;
    connection.retry();
    isOffline = false;
  }

  function injectInterface() {
    if (document.getElementById('playwin-ui-layer')) return;
    // El markup y la inyección del DOM viven en playwin-bridge-ui.js para que
    // este archivo contenga sólo lógica. Ese script debe cargarse ANTES.
    if (!window.PLAYWIN_UI || typeof window.PLAYWIN_UI.inject !== 'function') {
      console.error('[PlayWin SDK] Falta /game-sdk/playwin-bridge-ui.js: cárgalo ANTES que playwin-bridge.js');
      return;
    }
    window.PLAYWIN_UI.inject(currentPlayer);

    const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    const closeArena = () => isInIframe ? window.parent.postMessage({ type: 'PLAYWIN_CLOSE_ARENA' }, '*') : window.location.href = '/';
    bindClick('pw-btn-auth-login', () => isInIframe ? window.parent.postMessage({ type: 'PLAYWIN_REQUEST_LOGIN' }, '*') : window.location.href = '/');
    bindClick('pw-btn-auth-back', closeArena);
    bindClick('pw-btn-offline-back', closeArena);
    bindClick('pw-btn-lobby', () => isInIframe ? window.parent.postMessage({ type: 'PLAYWIN_CLOSE_ARENA' }, '*') : location.reload());
    bindClick('pw-btn-cancel-mm', closeArena);
    bindClick('pw-btn-retry', retryConnection);
    bindClick('pw-btn-surrender', () => window.PlayWin.notifyCrash());
    bindClick('pw-btn-rematch', () => window.PlayWin.startMatchmaking());

    // Sin pausas locales: se anulan Escape y P durante la partida.
    window.addEventListener('keydown', (e) => {
      if (isMatchLive && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); e.stopPropagation();
      }
    }, true);
  }

  function startPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (connection && connection.isOpen()) {
        connection.getSocket().send(JSON.stringify({ action: 'PING', clientTime: Date.now() }));
      }
    }, 2000);
  }

  // ¿Hay conexión abierta con el servidor de duelos?
  // ¿Hay conexión abierta con el servidor de duelos?
  function isSocketOpen() { return !!connection && connection.isOpen(); }

  // Envía un mensaje si la conexión está abierta.
  function sendIfOpen(payload) {
    if (isSocketOpen()) connection.getSocket().send(JSON.stringify(payload));
  }

  // Conecta con el servidor de duelos. El ciclo de vida del socket (timeout,
  // caídas, reintento y aviso) vive en playwin-bridge-connection.js.
  function connectWebSocket() {
    if (!currentPlayer || !currentPlayer.token) { showScreen('pw-screen-auth'); return; }
    if (!window.PLAYWIN_CONNECTION) {
      console.error('[PlayWin SDK] Falta /game-sdk/playwin-bridge-connection.js: cárgalo ANTES que playwin-bridge.js');
      showOfflineScreen('Falta un componente del SDK en la página.');
      return;
    }
    if (!connection) {
      connection = window.PLAYWIN_CONNECTION.createConnectionManager({
        wsUrl: () => WS_URL,
        joinPayload: () => ({ action: 'JOIN_MATCH', player: { ...currentPlayer, gameId: currentGameId } }),
        isMatchLive: () => isMatchLive,
        onOffline: (motivo) => { isOffline = true; showOfflineScreen(motivo); },
        onOnline: (recuperado) => { isOffline = false; if (recuperado) clearOffline(); startPing(); },
        onBanner: (texto) => showReconnectBanner(texto),
      });
      connection.setOnMessage(handleServerMessage);
    }
    connection.connect();
  }

  // Muestra el radar y, si nadie aparece, explica POR QUÉ (BUG-024). Con los
  // rivales de entrenamiento desactivados, un jugador solo espera indefinidamente
  // sin saber que no va a llegar nadie. A los 15 s se le dice la verdad.
  function startWaitingNotice() {
    showScreen('pw-screen-mm');
    const desc = document.querySelector('#pw-screen-mm .pw-subtitle');
    if (desc) desc.textContent = 'Emparejando rival en tu división competitiva...';
    if (waitingTimer) clearTimeout(waitingTimer);
    waitingTimer = setTimeout(() => {
      const el = document.querySelector('#pw-screen-mm .pw-subtitle');
      if (el && !isMatchLive) {
        el.textContent = 'Seguimos buscando rival humano. Los rivales de entrenamiento están desactivados, así que la espera puede alargarse: entra con otra cuenta o avisa a alguien para duelar.';
      }
    }, 15000);
  }

  // Procesa los eventos que llegan del servidor de duelos.
  function handleServerMessage(event) {
    const msg = JSON.parse(event.data);
    {
      if (msg.event === 'SECURITY_ERROR') {
        showScreen('pw-screen-auth');
        const desc = document.querySelector('#pw-screen-auth .pw-subtitle');
        if (desc) desc.textContent = msg.message;
      }
      else if (msg.event === 'MATCH_WAITING') startWaitingNotice();
      else if (msg.event === 'MATCH_START') handleMatchStart(msg);
      else if (msg.event === 'MATCH_LIVE') handleMatchLive();
      else if (msg.event === 'RIVAL_TICK') {
        targetOppState = { x: msg.x, y: msg.y, score: msg.score, isAlive: msg.isAlive };
        updateHudOpponentScore(msg.score);
      } else if (msg.event === 'PONG') {
        const rtt = Math.max(1, Date.now() - (msg.clientTime || 0));
        const el = document.getElementById('pw-hud-ping');
        if (el) el.textContent = `${rtt}ms`;
      } else if (msg.event === 'RIVAL_DISCONNECTED') {
        showReconnectBanner(msg.message || 'Rival desconectado (15s)...');
      } else if (msg.event === 'RIVAL_RECONNECTED') {
        hideReconnectBanner();
      } else if (msg.event === 'MATCH_RESUME') {
        handleMatchResume(msg);
      } else if (msg.event === 'MATCH_END') handleMatchEnd(msg);
    }
  }

  function handleMatchResume(msg) {
    hideReconnectBanner();
    currentRoomId = msg.roomId; currentSeed = msg.seed; opponentData = msg.opponent;
    isMatchLive = true;
    showScreen(null);
    const hud = document.getElementById('pw-live-hud');
    if (hud) hud.classList.add('active');
    if (opponentData) document.getElementById('pw-hud-opp-name').textContent = opponentData.username;
    if (msg.player?.score != null) {
      localScore = msg.player.score;
      const myEl = document.getElementById('pw-hud-my-score');
      if (myEl) myEl.textContent = localScore;
    }
    if (msg.opponent?.score != null) updateHudOpponentScore(msg.opponent.score);
    if (matchCallbacks.onMatchLive) {
      matchCallbacks.onMatchLive({ seed: currentSeed, isResume: true, opponent: opponentData });
    }
  }

  function showScreen(screenId) {
    document.querySelectorAll('.pw-screen').forEach((s) => s.classList.remove('active'));
    if (screenId) {
      const target = document.getElementById(screenId);
      if (target) target.classList.add('active');
    }
  }

  // Marca visualmente que el rival es un relleno del servidor (versus y HUD).
  function applyBotBadge(isBot) {
    const badge = document.getElementById('pw-bot-badge');
    if (badge) badge.classList.toggle('active', isBot);
    const badgeHud = document.getElementById('pw-hud-bot-badge');
    if (badgeHud) badgeHud.classList.toggle('active', isBot);
    const vsTitle = document.querySelector('#pw-screen-vs .pw-badge');
    if (vsTitle) {
      vsTitle.textContent = isBot
        ? 'RIVAL DE ENTRENAMIENTO · NO HABÍA JUGADORES EN COLA'
        : '¡RIVAL ENCONTRADO!';
    }
  }

  function handleMatchStart(msg) {
    stopWaitingNotice();
    currentRoomId = msg.roomId; currentSeed = msg.seed; opponentData = msg.opponent;
    document.getElementById('pw-opp-avatar').textContent = opponentData.avatar || '🎯';
    document.getElementById('pw-opp-name').textContent = opponentData.username;
    // Sin división conocida se muestra un guion, no una inventada.
    document.getElementById('pw-opp-rank').textContent = opponentData.rank || '—';
    document.getElementById('pw-hud-opp-name').textContent = opponentData.username;
    applyBotBadge(opponentData.isBot === true);

    showScreen('pw-screen-vs');
    let count = 3;
    const countEl = document.getElementById('pw-countdown');
    countEl.textContent = count;
    if (matchCallbacks.onMatchReady) matchCallbacks.onMatchReady({ seed: currentSeed, opponent: opponentData });

    const timer = setInterval(() => {
      count--;
      if (count > 0) countEl.textContent = count;
      else { clearInterval(timer); countEl.textContent = '¡YA!'; }
    }, 1000);
  }

  function handleMatchLive() {
    isMatchLive = true;
    showScreen(null);
    document.getElementById('pw-live-hud').classList.add('active');
    if (matchCallbacks.onMatchLive) matchCallbacks.onMatchLive({ seed: currentSeed });
  }

  function handleMatchEnd(msg) {
    isMatchLive = false;
    if (pingTimer) clearInterval(pingTimer);
    hideReconnectBanner();
    document.getElementById('pw-live-hud').classList.remove('active');
    const isWin = msg.winnerId === currentPlayer.id;
    const banner = document.getElementById('pw-res-banner');
    banner.textContent = isWin ? '¡VICTORIA!' : 'DERROTA';
    banner.className = `pw-result-banner ${isWin ? 'pw-result-win' : 'pw-result-loss'}`;
    document.getElementById('pw-res-summary').textContent = msg.summary || (isWin ? 'Has superado a tu oponente.' : 'Te has estrellado.');
    document.getElementById('pw-res-points').textContent = isWin
      ? `+${msg.payout.winnerSeasonPoints} PUNTOS DE TEMPORADA`
      : `+${msg.payout.loserSeasonPoints} PUNTOS DE CONSOLACIÓN`;

    showScreen('pw-screen-result');
    if (isInIframe) {
      window.parent.postMessage({ type: 'PLAYWIN_MATCH_COMPLETED', winnerId: msg.winnerId, isWin, payout: msg.payout }, '*');
    }
    if (matchCallbacks.onMatchEnd) matchCallbacks.onMatchEnd({ isWin, payout: msg.payout });
  }

  function updateHudOpponentScore(oppScore) {
    const oppEl = document.getElementById('pw-hud-opp-score');
    if (oppEl) oppEl.textContent = oppScore;
    const badge = document.getElementById('pw-hud-lead-badge');
    if (!badge) return;
    if (localScore > oppScore) {
      badge.textContent = `VAS GANANDO (+${localScore - oppScore})`;
      badge.className = 'pw-lead-pill pw-lead-winning';
    } else if (localScore < oppScore) {
      badge.textContent = `VAS PERDIENDO (-${oppScore - localScore})`;
      badge.className = 'pw-lead-pill pw-lead-losing';
    } else {
      badge.textContent = 'EMPATADOS';
      badge.className = 'pw-lead-pill';
    }
  }

  window.PlayWin = {
    init: function (config = {}) {
      currentGameId = config.gameId || 'carreras';
      matchCallbacks = config.callbacks || {};
      injectInterface();
      if (isInIframe) {
        window.parent.postMessage({ type: 'PLAYWIN_READY' }, '*');
        setTimeout(() => {
          if (!isHandshakeComplete) {
            if (!currentPlayer || !currentPlayer.token) {
              showScreen('pw-screen-auth');
            } else {
              connectWebSocket();
            }
          }
        }, 500);
      } else {
        if (!currentPlayer || !currentPlayer.token) {
          showScreen('pw-screen-auth');
        } else {
          connectWebSocket();
        }
      }
    },
    startMatchmaking: function () {
      if (isSocketOpen()) {
        sendIfOpen({ action: 'JOIN_MATCH', player: { ...currentPlayer, gameId: currentGameId } });
      } else {
        connectWebSocket();
      }
    },
    sendTick: function (state = {}) {
      if (!isMatchLive || !isSocketOpen()) return;
      localScore = state.score !== undefined ? state.score : localScore;
      const myScoreEl = document.getElementById('pw-hud-my-score');
      if (myScoreEl) myScoreEl.textContent = localScore;
      sendIfOpen({ action: 'PLAYER_TICK', x: Number(state.x) || 0, y: Number(state.y) || 0, score: Number(localScore) || 0, isAlive: state.isAlive ?? true });
    },
    notifyCrash: function () {
      if (!isMatchLive) return;
      sendIfOpen({ action: 'PLAYER_CRASHED' });
    },
    notifyFinish: function (score) {
      if (!isMatchLive) return;
      sendIfOpen({ action: 'PLAYER_FINISH', score: score !== undefined ? Number(score) : Number(localScore) });
    },
    getOpponentState: function () { return { ...opponentState }; },
    getPlayer: function () { return { ...currentPlayer }; },
    isLive: function () { return isMatchLive; },
    isOffline: function () { return isOffline; },
    // Guardián del ciclo de partida (BUG-025).
    // Los 4 juegos conservan botones y teclas de arranque local de cuando eran
    // de un solo jugador. Si se pulsan, el juego arranca una carrera propia: el
    // reloj corre, el HUD se pinta… pero NO hay partida en el servidor y el
    // coche no se mueve, porque sólo se envían ticks si `isLive()` es true.
    // Los juegos deben consultar esto antes de arrancar por su cuenta:
    // if (window.PlayWin && !window.PlayWin.canStartLocally()) return;
    // @returns {boolean} true SÓLO si no hay SDK cargado (modo práctica suelto).
    canStartLocally: function () { return false; }
  };
  Object.freeze(window.PlayWin);
})();
