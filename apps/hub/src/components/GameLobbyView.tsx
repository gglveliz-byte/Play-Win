'use client';

import React, { useState } from 'react';
// ⚠️ Componente de CLIENTE: solo puede importar las constantes puras.
// El punto de entrada principal arrastra `pg` (requiere `dns`) y rompe el build.
import { SEASON_POINTS } from '@playwin/database/constants';

/**
 * Etiqueta de puntuación construida desde las constantes compartidas.
 * Antes decía "Ganador: +100 SP (+25 MMR) | Derrota: +20 SP (-15 MMR)", que era
 * doblemente falso: el MMR NO se mueve por un duelo (solo al cerrar la semana
 * según la posición en la liga) y los valores estaban quemados (BUG-008).
 */
const ETIQUETA_PUNTOS =
  `Ganador: +${SEASON_POINTS.WIN} SP | Derrota: +${SEASON_POINTS.LOSS} SP | El MMR se ajusta al cierre semanal, no por duelo`;

interface GameLobbyViewProps {
  gameId: string;
  lobbyData: any;
  loading: boolean;
  onStartMatch: () => void;
  onClose: () => void;
}

export function GameLobbyView({
  gameId,
  lobbyData,
  loading,
  onStartMatch,
  onClose,
}: GameLobbyViewProps) {
  const [controlTab, setControlTab] = useState<'pc' | 'mobile'>('pc');

  const game = lobbyData?.game || {
    title: 'Cargando Arena...',
    subtitle: 'Modo Competitivo 1v1',
    category: 'ESPORTS',
    coverImage: '/images/games/carreras.jpg',
    objective: 'Supera a tu oponente sin estrellarte.',
    scoring: '+1 punto por avance físico.',
    suddenDeath: 'El primer jugador en colisionar pierde inmediatamente.',
    seasonPoints: ETIQUETA_PUNTOS,
    controlsPC: [{ key: 'Teclas', label: 'Controles estándar' }],
    controlsMobile: [{ gesture: 'Táctil', label: 'Toques en pantalla' }],
  };

  const activePlayers = lobbyData?.activePlayers || [];

  return (
    <div className="modal-overlay" style={{ padding: '16px' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '920px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: 0,
          borderRadius: '26px',
          background: 'var(--card)',
        }}
      >
        {/* Banner Superior con Portada */}
        <div
          style={{
            position: 'relative',
            height: '135px',
            background: `linear-gradient(180deg, rgba(12,12,14,0.3) 0%, rgba(12,12,14,0.92) 100%), url(${game.coverImage}) center/cover no-repeat`,
            borderTopLeftRadius: '26px',
            borderTopRightRadius: '26px',
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: 'var(--on-dark)',
                background: 'rgba(210, 105, 26, 0.9)',
                padding: '3px 10px',
                borderRadius: '999px',
                letterSpacing: '1px',
              }}
            >
              {game.category}
            </span>
            <button onClick={onClose} className="btn-pill-light" style={{ padding: '5px 14px', fontSize: '12px', fontWeight: 700 }}>
              ✕ Cerrar
            </button>
          </div>

          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--on-dark)', margin: 0 }}>
              {game.title}
            </h2>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', margin: '2px 0 0' }}>
              {game.subtitle} • <span style={{ color: 'var(--accent-on-dark)', fontWeight: 700 }}>{lobbyData?.viewer?.rankTier || 'SIN DIVISIÓN'}</span>
            </p>
          </div>
        </div>

        {/* Contenido Principal */}
        <div style={{ padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--mute)' }}>
              Cargando pilotos activos y telemetría desde Neon DB...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
              {/* Columna 1: Pilotos Reales de este juego */}
              <div style={{ background: 'var(--hero-bg-1)', borderRadius: '18px', padding: '16px 18px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="brand-dot" style={{ background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }}></span>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      Pilotos Activos en este Juego
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--mute)', fontWeight: 700 }}>
                    {activePlayers.length} en división
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                  {activePlayers.map((player: any, idx: number) => (
                    <div
                      key={player.user_id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: 'var(--card)',
                        borderRadius: '10px',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: idx === 0 ? 'var(--orange)' : 'var(--mute)', width: '16px' }}>
                          #{idx + 1}
                        </span>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--pill-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                          {player.avatar_url || '🎮'}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>{player.username}</div>
                          <span style={{ fontSize: '10px', color: 'var(--mute)' }}>RATING {player.skill_rating ?? '—'} MMR</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', background: 'rgba(210, 105, 26, 0.1)', padding: '2px 8px', borderRadius: '999px' }}>
                        {player.season_points || 0} SP
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna 2: Reglas y Controles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: 'var(--hero-bg-1)', borderRadius: '18px', padding: '14px 18px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    Reglas Competitivas & Puntos
                  </span>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    <div><strong style={{ color: 'var(--ink)' }}>Objetivo:</strong> {game.objective}</div>
                    <div><strong style={{ color: 'var(--ink)' }}>Puntuación:</strong> {game.scoring}</div>
                    <div><strong style={{ color: 'var(--orange)' }}>Muerte Súbita 1v1:</strong> {game.suddenDeath}</div>
                    <div style={{ color: 'var(--mute)', fontSize: '11px' }}>{game.seasonPoints}</div>
                  </div>
                </div>

                {/* Controles */}
                <div style={{ background: 'var(--hero-bg-1)', borderRadius: '18px', padding: '14px 18px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      Guía de Controles
                    </span>
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--pill-light)', padding: '2px', borderRadius: '999px' }}>
                      <button
                        onClick={() => setControlTab('pc')}
                        style={{ border: 'none', padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', background: controlTab === 'pc' ? 'var(--pill-dark)' : 'transparent', color: controlTab === 'pc' ? 'var(--on-dark)' : 'var(--mute)' }}
                      >
                        💻 PC / Teclado
                      </button>
                      <button
                        onClick={() => setControlTab('mobile')}
                        style={{ border: 'none', padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', background: controlTab === 'mobile' ? 'var(--pill-dark)' : 'transparent', color: controlTab === 'mobile' ? 'var(--on-dark)' : 'var(--mute)' }}
                      >
                        📱 Móvil / Táctil
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {controlTab === 'pc'
                      ? game.controlsPC?.map((c: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, background: 'var(--card)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--line)', color: 'var(--ink)', minWidth: '75px', textAlign: 'center' }}>
                              {c.key}
                            </span>
                            <span style={{ color: 'var(--ink-soft)' }}>{c.label}</span>
                          </div>
                        ))
                      : game.controlsMobile?.map((c: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                            <span style={{ fontWeight: 800, background: 'rgba(210, 105, 26, 0.12)', color: 'var(--orange)', padding: '2px 6px', borderRadius: '4px', minWidth: '95px', textAlign: 'center' }}>
                              {c.gesture}
                            </span>
                            <span style={{ color: 'var(--ink-soft)' }}>{c.label}</span>
                          </div>
                        ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Acción */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge-chip">BOLSA SEMANAL: $25 USD</span>
              <span style={{ fontSize: '11px', color: 'var(--mute)' }}>Rival de tu misma división</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onClose} className="btn-pill-light" style={{ padding: '8px 18px', fontSize: '12px', fontWeight: 700 }}>
                Volver al Hub
              </button>
              <button onClick={onStartMatch} className="btn-pill-3d btn-pill-primary" style={{ padding: '8px 24px', fontSize: '13px', fontWeight: 800 }}>
                ⚔️ BUSCAR RIVAL 1v1
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
