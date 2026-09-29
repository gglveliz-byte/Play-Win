/**
 * PLAY WIN GAME BRIDGE SDK — CLIENT ADAPTER (playwin-bridge.js)
 * Protocolo Universal de Integración de Videojuegos 1v1 (< 350 líneas)
 * Cumple AGENTS.md, playwin-realtime-duels y playwin-game-bridge.
 */
(function () {
  'use strict';
  let WS_URL = window.PLAYWIN_WS_URL || 'ws://localhost:3001/ws';
  const isInIframe = window.parent && window.parent !== window;

  let socket = null, currentGameId = 'flapy-flapy', matchCallbacks = {};
  let currentSeed = null, currentRoomId = null, opponentData = null;
  let targetOppState = { x: 0, y: 0, score: 0, isAlive: true };
  let opponentState = { x: 0, y: 0, score: 0, isAlive: true };
  let localScore = 0, isMatchLive = false, isHandshakeComplete = false;
  let pingTimer = null, afkTimer = null;

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
        if (!socket || socket.readyState !== WebSocket.OPEN) connectWebSocket();
      } else { showScreen('pw-screen-auth'); }
    } else if (event.data.type === 'PLAYWIN_REQUIRE_LOGIN') {
      showScreen('pw-screen-auth');
    }
  });

  const showReconnectBanner = (t) => { const el = document.getElementById('pw-reconnect-banner'); if (el) { el.textContent = t; el.classList.add('active'); } };
  const hideReconnectBanner = () => { const el = document.getElementById('pw-reconnect-banner'); if (el) el.classList.remove('active'); };

  function injectInterface() {
    if (document.getElementById('playwin-ui-layer')) return;
    if (!document.getElementById('playwin-bridge-css')) {
      const link = document.createElement('link');
      link.id = 'playwin-bridge-css';
      link.rel = 'stylesheet';
      link.href = window.PLAYWIN_SDK_CSS_URL || '/game-sdk/playwin-bridge.css';
      document.head.appendChild(link);
    }
    const container = document.createElement('div');
    container.id = 'playwin-ui-layer';
    container.innerHTML = `
      <div id="pw-reconnect-banner" class="pw-reconnect-banner"></div>
      <div id="pw-screen-mm" class="pw-screen"><div class="pw-card">
        <div class="pw-badge">PLAY WIN ARENA 1v1</div>
        <div class="pw-radar-container"><div class="pw-radar-ring"></div><div class="pw-radar-center">⚡</div></div>
        <h2 class="pw-title">Buscando Contrincante</h2><p class="pw-subtitle">Emparejando rival en tu división competitiva...</p>
        <div class="pw-player-box" style="margin-bottom:20px;"><div class="pw-avatar-bubble">${currentPlayer.avatar}</div><div class="pw-pname">${currentPlayer.username}</div><span class="pw-prank">RATING ${currentPlayer.skillRating}</span></div>
        <button id="pw-btn-cancel-mm" class="pw-btn-pill pw-btn-secondary">Cancelar y Volver</button>
      </div></div>
      <div id="pw-screen-vs" class="pw-screen"><div class="pw-card">
        <div class="pw-badge">¡RIVAL ENCONTRADO!</div>
        <div class="pw-versus-grid">
          <div class="pw-player-box"><div class="pw-avatar-bubble">${currentPlayer.avatar}</div><div class="pw-pname">${currentPlayer.username}</div><span class="pw-prank">${currentPlayer.rank}</span></div>
          <div class="pw-vs-badge">VS</div>
          <div class="pw-player-box"><div id="pw-opp-avatar" class="pw-avatar-bubble">🎯</div><div id="pw-opp-name" class="pw-pname">Oponente</div><span id="pw-opp-rank" class="pw-prank">ORO</span></div>
        </div>
        <div id="pw-countdown" class="pw-countdown-display">3</div><p class="pw-subtitle">Ambos compiten con la misma pista exacta.</p>
      </div></div>
      <div id="pw-live-hud">
        <div class="pw-hud-col"><span style="font-size:11px;font-weight:700;color:var(--pw-mute);">TÚ <span id="pw-hud-ping" class="pw-ping-badge">--ms</span></span><span id="pw-hud-my-score" class="pw-hud-score">0</span></div>
        <div id="pw-hud-lead-badge" class="pw-lead-pill pw-lead-winning">EMPATADOS</div>
        <div class="pw-hud-col"><span id="pw-hud-opp-name" style="font-size:11px;font-weight:700;color:var(--pw-mute);">RIVAL</span><span id="pw-hud-opp-score" class="pw-hud-score">0</span><button id="pw-btn-surrender" class="pw-btn-surrender" title="Rendirse">Rendirse</button></div>
      </div>
      <div id="pw-screen-result" class="pw-screen"><div class="pw-card">
        <div id="pw-res-banner" class="pw-result-banner pw-result-win">¡VICTORIA!</div>
        <p id="pw-res-summary" class="pw-subtitle">El oponente se estrelló contra un obstáculo.</p>
        <div id="pw-res-points" class="pw-points-pill">+100 PUNTOS DE LIGA</div>
        <div class="pw-btn-stack"><button id="pw-btn-rematch" class="pw-btn-pill">SIGUIENTE DUELO ➔</button><button id="pw-btn-lobby" class="pw-btn-pill pw-btn-secondary">VOLVER AL HUB</button></div>
      </div></div>
      <div id="pw-screen-auth" class="pw-screen"><div class="pw-card">
        <div class="pw-badge">ACCESO REQUERIDO</div><div class="pw-avatar-bubble" style="margin:0 auto 16px;font-size:32px;">🔐</div>
        <h2 class="pw-title">Inicia Sesión para Competir</h2><p class="pw-subtitle">Sin iniciar sesión no es posible competir en duelos 1v1 oficiales ni acumular Season Points.</p>
        <div class="pw-btn-stack" style="margin-top:20px;"><button id="pw-btn-auth-login" class="pw-btn-pill">INICIAR SESIÓN / REGISTRARSE</button><button id="pw-btn-auth-back" class="pw-btn-pill pw-btn-secondary">VOLVER AL HUB</button></div>
      </div></div>`;
    document.body.appendChild(container);

    const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bindClick('pw-btn-auth-login', () => isInIframe ? window.parent.postMessage({ type: 'PLAYWIN_REQUEST_LOGIN' }, '*') : window.location.href = '/');
    bindClick('pw-btn-auth-back', () => isInIframe ? window.parent.postMessage({ type: 'PLAYWIN_CLOSE_ARENA' }, '*') : window.location.href = '/');
    bindClick('pw-btn-surrender', () => window.PlayWin.notifyCrash());
    bindClick('pw-btn-rematch', () => window.PlayWin.startMatchmaking());
    bindClick('pw-btn-lobby', () => isInIframe ? window.parent.postMessage({ type: 'PLAYWIN_CLOSE_ARENA' }, '*') : location.reload());
    bindClick('pw-btn-cancel-mm', () => isInIframe ? window.parent.postMessage({ type: 'PLAYWIN_CLOSE_ARENA' }, '*') : document.getElementById('pw-screen-mm')?.classList.remove('active'));

    window.addEventListener('keydown', (e) => {
      if (isMatchLive && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); e.stopPropagation();
      }
    }, true);
  }

  function startPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'PING', clientTime: Date.now() }));
      }
    }, 2000);
  }

  function connectWebSocket() {
    if (!currentPlayer || !currentPlayer.token) {
      showScreen('pw-screen-auth');
      return;
    }
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      hideReconnectBanner();
      startPing();
      socket.send(JSON.stringify({ action: 'JOIN_MATCH', player: { ...currentPlayer, gameId: currentGameId } }));
    };
    socket.onclose = () => {
      if (isMatchLive) {
        showReconnectBanner('⚠️ Conexión perdida. Reconectando...');
        setTimeout(() => {
          if (isMatchLive && (!socket || socket.readyState === WebSocket.CLOSED)) connectWebSocket();
        }, 1000);
      }
    };
    socket.onerror = () => {
      if (isMatchLive) showReconnectBanner('⚠️ Error de red. Reintentando...');
    };
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === 'SECURITY_ERROR') {
        showScreen('pw-screen-auth');
        const desc = document.querySelector('#pw-screen-auth .pw-subtitle');
        if (desc) desc.textContent = msg.message;
      }
      else if (msg.event === 'MATCH_WAITING') showScreen('pw-screen-mm');
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
    };
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

  function handleMatchStart(msg) {
    currentRoomId = msg.roomId; currentSeed = msg.seed; opponentData = msg.opponent;
    document.getElementById('pw-opp-avatar').textContent = opponentData.avatar || '🎯';
    document.getElementById('pw-opp-name').textContent = opponentData.username;
    document.getElementById('pw-opp-rank').textContent = opponentData.rank || 'ORO';
    document.getElementById('pw-hud-opp-name').textContent = opponentData.username;

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
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'JOIN_MATCH', player: { ...currentPlayer, gameId: currentGameId } }));
      } else {
        connectWebSocket();
      }
    },
    sendTick: function (state = {}) {
      if (!isMatchLive || !socket || socket.readyState !== WebSocket.OPEN) return;
      localScore = state.score !== undefined ? state.score : localScore;
      const myScoreEl = document.getElementById('pw-hud-my-score');
      if (myScoreEl) myScoreEl.textContent = localScore;
      socket.send(JSON.stringify({ action: 'PLAYER_TICK', x: Number(state.x) || 0, y: Number(state.y) || 0, score: Number(localScore) || 0, isAlive: state.isAlive ?? true }));
    },
    notifyCrash: function () {
      if (!isMatchLive || !socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
    },
    notifyFinish: function (score) {
      if (!isMatchLive || !socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ action: 'PLAYER_FINISH', score: score !== undefined ? Number(score) : Number(localScore) }));
    },
    getOpponentState: function () { return { ...opponentState }; },
    getPlayer: function () { return { ...currentPlayer }; },
    isLive: function () { return isMatchLive; }
  };
  Object.freeze(window.PlayWin);
})();
