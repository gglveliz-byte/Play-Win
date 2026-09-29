'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameLobbyView } from './GameLobbyView';

interface GameLauncherModalProps {
  gameId: string | null;
  onClose: () => void;
  onMatchComplete: () => void;
  onRequireAuth?: () => void;
}

const GAME_URLS: Record<string, string> = {
  'flapy-flapy': '/games/flapy-flapy/index.html',
  'carreras': '/games/carreras/index.html',
  'space': '/games/space/index.html',
  'sky': '/games/sky/index.html',
};

const GAME_TITLES: Record<string, string> = {
  'flapy-flapy': 'Bati Vuelo 1v1',
  'carreras': 'Speed Horizon 3D',
  'space': 'Fuerza Espacial',
  'sky': 'Sky Runner 3D',
};

export function GameLauncherModal({
  gameId,
  onClose,
  onMatchComplete,
  onRequireAuth,
}: GameLauncherModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewMode, setViewMode] = useState<'LOBBY' | 'ARENA'>('LOBBY');
  const [lobbyData, setLobbyData] = useState<any>(null);
  const [loadingLobby, setLoadingLobby] = useState(true);
  const [ticketData, setTicketData] = useState<any>(null);

  const ticketRef = useRef<any>(null);
  const onRequireAuthRef = useRef(onRequireAuth);
  const onCloseRef = useRef(onClose);
  onRequireAuthRef.current = onRequireAuth;
  onCloseRef.current = onClose;

  // Cargar información de la sala, jugadores reales y reglas al seleccionar el juego
  useEffect(() => {
    if (!gameId) {
      setViewMode('LOBBY');
      return;
    }

    try {
      const activeArena = sessionStorage.getItem('playwin_active_arena');
      setViewMode(activeArena === gameId ? 'ARENA' : 'LOBBY');
    } catch (_) {
      setViewMode('LOBBY');
    }

    setLoadingLobby(true);
    fetch(`/api/games/lobby?gameId=${gameId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setLobbyData(data);
        }
      })
      .catch((err) => console.error('[Lobby fetch error]', err))
      .finally(() => setLoadingLobby(false));

    // Pre-generar ticket efímero de partida
    fetch('/api/games/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          ticketRef.current = data;
          setTicketData(data);
        } else if (data.requireLogin) {
          ticketRef.current = null;
          setTicketData(null);
          if (onRequireAuthRef.current) onRequireAuthRef.current();
          if (onCloseRef.current) onCloseRef.current();
        }
      })
      .catch((err) => console.error('[Ticket error]', err));
  }, [gameId]);

  const sendInitToIframe = useCallback((ticketInfo: any) => {
    const t = ticketInfo || ticketRef.current;
    if (!iframeRef.current?.contentWindow || !t) return;
    const token = t.ticket || t.token;
    if (!token) return;
    const player = t.player || t;

    iframeRef.current.contentWindow.postMessage(
      {
        type: 'PLAYWIN_INIT',
        payload: {
          token,
          playerId: player.id || player.playerId,
          username: player.username,
          avatar: player.avatar || player.avatar_url || '🎮',
          rank: player.rank || 'ORO',
          skillRating: player.skillRating || 1820,
          wsUrl: process.env.NEXT_PUBLIC_REALTIME_WS_URL || 'ws://localhost:3001/ws',
        },
      },
      '*'
    );
  }, []);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'PLAYWIN_READY') {
        const t = ticketRef.current || ticketData;
        if (t && (t.ticket || t.token)) {
          sendInitToIframe(t);
        } else {
          // Reintentar si el ticket está en camino
          const checkTimer = setInterval(() => {
            if (ticketRef.current && (ticketRef.current.ticket || ticketRef.current.token)) {
              clearInterval(checkTimer);
              sendInitToIframe(ticketRef.current);
            }
          }, 150);
          setTimeout(() => {
            clearInterval(checkTimer);
            if (!ticketRef.current) {
              iframeRef.current?.contentWindow?.postMessage({ type: 'PLAYWIN_REQUIRE_LOGIN' }, '*');
            }
          }, 3000);
        }
      } else if (e.data?.type === 'PLAYWIN_REQUEST_LOGIN') {
        if (onCloseRef.current) onCloseRef.current();
        if (onRequireAuthRef.current) onRequireAuthRef.current();
      } else if (e.data?.type === 'PLAYWIN_MATCH_COMPLETED') {
        try { sessionStorage.removeItem('playwin_active_arena'); } catch (_) {}
        onMatchComplete();
      } else if (e.data?.type === 'PLAYWIN_CLOSE_ARENA') {
        try { sessionStorage.removeItem('playwin_active_arena'); } catch (_) {}
        onMatchComplete();
        if (onCloseRef.current) onCloseRef.current();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [ticketData, sendInitToIframe, onMatchComplete]);

  if (!gameId) return null;

  // 1. Mostrar primero el menú y lobby interactivo con pilotos reales y reglas
  if (viewMode === 'LOBBY') {
    return (
      <GameLobbyView
        gameId={gameId}
        lobbyData={lobbyData}
        loading={loadingLobby}
        onStartMatch={() => {
          if (!ticketRef.current || !ticketRef.current.success) {
            if (onRequireAuthRef.current) onRequireAuthRef.current();
            if (onCloseRef.current) onCloseRef.current();
            return;
          }
          try { sessionStorage.setItem('playwin_active_arena', gameId); } catch (_) {}
          setViewMode('ARENA');
        }}
        onClose={onClose}
      />
    );
  }

  // 2. Solo tras pulsar "BUSCAR RIVAL 1v1", abrir la arena de juego
  const gameUrl = GAME_URLS[gameId] || GAME_URLS['carreras'];
  const gameTitle = GAME_TITLES[gameId] || 'Duelo 1v1';

  return (
    <div className="game-iframe-wrapper">
      <div className="game-iframe-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="brand-dot"></span>
          <span style={{ fontWeight: 800, fontSize: '15px' }}>{gameTitle} — Modo Competitivo 1v1</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              background: 'rgba(210, 105, 26, 0.2)',
              color: 'var(--orange)',
              padding: '2px 8px',
              borderRadius: '999px',
            }}
          >
            ARENA EN VIVO
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setViewMode('LOBBY')}
            className="btn-pill-light"
            style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700 }}
          >
            📋 Ver Reglas / Controles
          </button>
          <button
            onClick={() => {
              try { sessionStorage.removeItem('playwin_active_arena'); } catch (_) {}
              onMatchComplete();
              onClose();
            }}
            className="btn-pill-light"
            style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 700 }}
          >
            ✕ Cerrar Partida
          </button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src={gameUrl}
        className="game-iframe-element"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        title={gameTitle}
        onLoad={() => {
          const t = ticketRef.current || ticketData;
          if (t) sendInitToIframe(t);
        }}
      />
    </div>
  );
}
