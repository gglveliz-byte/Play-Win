'use client';

import React, { useState, useEffect } from 'react';
import { MatchItem, PassportViewProps, GAME_NAMES, formatTimeAgo } from './passport-types';

export function PassportView({ user, passports, onOpenAuth, onLaunchGame }: PassportViewProps) {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');

  useEffect(() => {
    if (!user) return;
    fetchMatchHistory();
  }, [user]);

  const fetchMatchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/matches/history');
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches || []);
      }
    } catch (err) {
      console.error('[Fetch Match History Error]', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalMatches = passports.reduce((sum, p) => sum + (p.total_matches || 0), 0);
  const totalWins = passports.reduce((sum, p) => sum + (p.wins || 0), 0);
  const totalSeasonPoints = passports.reduce((sum, p) => sum + (p.season_points || 0), 0);
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

  const filteredMatches = matches.filter((m) => {
    if (filter === 'WINS') return m.isWinner;
    if (filter === 'LOSSES') return !m.isWinner;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* 1. Header del Pasaporte e Identidad Competitiva */}
      <div className="hero-card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--orange), var(--orange-2))',
              color: 'var(--on-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 900,
              boxShadow: '0 8px 20px rgba(210, 105, 26, 0.35)',
            }}>
              {user ? user.username.slice(0, 2).toUpperCase() : '👤'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--ink)', margin: 0 }}>
                  {user ? user.username : 'Pasaporte Invitado'}
                </h2>
                {user?.is_verified && (
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: 'var(--success)',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: '999px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}>
                    ✓ VERIFICADO
                  </span>
                )}
              </div>
              <p style={{ fontSize: '14px', color: 'var(--mute)', margin: '4px 0 0' }}>
                {user ? `Miembro del Circuito eSports Oficial • ID: ${user.id.slice(0, 8)}` : 'Inicia sesión para registrar tu trayectoria.'}
              </p>
            </div>
          </div>

          {/* Estadísticas Rápidas de Rendimiento */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div className="warm-card" style={{ padding: '14px 20px', minWidth: '120px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mute)' }}>PUNTOS TOTALES</span>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--orange)' }}>+{totalSeasonPoints} SP</div>
            </div>
            <div className="warm-card" style={{ padding: '14px 20px', minWidth: '120px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mute)' }}>TASA VICTORIAS</span>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>{winRate}%</div>
            </div>
            <div className="warm-card" style={{ padding: '14px 20px', minWidth: '120px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mute)' }}>DUELOS 1v1</span>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>{totalMatches} ({totalWins}V)</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Resumen de Rango por Juego */}
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', marginBottom: '14px' }}>
          Divisiones y MMR por Videojuego
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {['carreras', 'flapy-flapy', 'space', 'sky'].map((gameId) => {
            const p = passports.find((item) => item.game_id === gameId);
            const gameInfo = GAME_NAMES[gameId] || { name: gameId, badge: 'ESPORTS', color: 'var(--orange)' };
            return (
              <div key={gameId} className="warm-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: gameInfo.color, letterSpacing: '1px' }}>
                    {gameInfo.badge}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    background: 'var(--pill-light)',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid var(--line)',
                  }}>
                    {p ? p.rank_tier : 'BRONZE'}
                  </span>
                </div>
                <h4 style={{ fontSize: '17px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 10px' }}>
                  {gameInfo.name}
                </h4>
                <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--ink-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mute)' }}>Skill Rating:</span>
                    <strong>{p ? p.skill_rating : 1200} MMR</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mute)' }}>Season Points:</span>
                    <strong style={{ color: 'var(--orange)' }}>+{p ? p.season_points : 0} SP</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mute)' }}>Récord:</span>
                    <span>{p ? `${p.wins}V - ${p.losses}D` : '0V - 0D'}</span>
                  </div>
                </div>
                <button
                  onClick={() => onLaunchGame(gameId)}
                  className="btn-pill-light"
                  style={{ width: '100%', marginTop: '14px', padding: '8px', fontSize: '12px' }}
                >
                  Jugar 1v1 ➔
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Feed de Historial de Partidas Detallado */}
      <div className="hero-card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', margin: 0 }}>
              Historial de Duelos Recientes
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--mute)', margin: '4px 0 0' }}>
              Registros inmutables con arbitraje en servidor, semillas deterministas y puntuaciones verificadas.
            </p>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setFilter('ALL')}
              className={`nav-link ${filter === 'ALL' ? 'active' : ''}`}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Todos ({matches.length})
            </button>
            <button
              onClick={() => setFilter('WINS')}
              className={`nav-link ${filter === 'WINS' ? 'active' : ''}`}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Victorias ({matches.filter((m) => m.isWinner).length})
            </button>
            <button
              onClick={() => setFilter('LOSSES')}
              className={`nav-link ${filter === 'LOSSES' ? 'active' : ''}`}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Derrotas ({matches.filter((m) => !m.isWinner).length})
            </button>
          </div>
        </div>

        {/* Lista de Partidas */}
        {!user ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ color: 'var(--mute)', marginBottom: '16px' }}>Inicia sesión para consultar tu historial de partidas y estadísticas de combate.</p>
            <button className="btn-pill-3d btn-pill-primary" onClick={onOpenAuth}>Iniciar Sesión</button>
          </div>
        ) : isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--mute)' }}>Cargando registros de combate...</div>
        ) : filteredMatches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: 'rgba(255,255,255,0.4)', borderRadius: '20px', border: '1px dashed var(--line)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚔️</div>
            <h4 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 6px' }}>No hay duelos registrados en este filtro</h4>
            <p style={{ fontSize: '13px', color: 'var(--mute)', marginBottom: '18px' }}>Empareja con un rival en cualquiera de los 4 títulos oficiales para sumar tus primeros puntos.</p>
            <button className="btn-pill-3d btn-pill-primary" onClick={() => onLaunchGame('carreras')}>
              Buscar Duelo Ahora
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredMatches.map((match) => {
              const gameMeta = GAME_NAMES[match.gameId] || { name: match.gameId, badge: 'ESPORTS', color: 'var(--orange)' };
              return (
                <div
                  key={match.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    padding: '16px 20px',
                    background: match.isWinner ? 'rgba(255, 255, 255, 0.85)' : 'rgba(242, 241, 238, 0.7)',
                    borderRadius: '16px',
                    border: `1px solid ${match.isWinner ? 'rgba(210, 105, 26, 0.25)' : 'var(--line)'}`,
                    boxShadow: match.isWinner ? '0 4px 12px rgba(210, 105, 26, 0.06)' : 'none',
                  }}
                >
                  {/* Resultado y Título */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '220px' }}>
                    <div style={{
                      padding: '6px 12px',
                      borderRadius: '10px',
                      fontWeight: 900,
                      fontSize: '12px',
                      letterSpacing: '0.5px',
                      background: match.isWinner ? 'var(--orange)' : 'var(--ink-soft)',
                      color: 'var(--on-dark)',
                    }}>
                      {match.isWinner ? 'VICTORIA' : 'DERROTA'}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{gameMeta.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--mute)' }} suppressHydrationWarning>{formatTimeAgo(match.createdAt)} • {match.durationSeconds}s</div>
                    </div>
                  </div>

                  {/* Rival */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '180px' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'var(--pill-light)',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}>
                      {match.opponent.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--mute)' }}>vs Rival:</span>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>@{match.opponent.username}</div>
                    </div>
                  </div>

                  {/* Marcador */}
                  <div style={{ minWidth: '140px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'monospace' }}>
                      {match.myScore} <span style={{ color: 'var(--mute)', fontSize: '12px' }}>vs</span> {match.opponentScore}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--mute)' }}>Puntaje Oficial</span>
                  </div>

                  {/* Puntos y Auditoría */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      color: match.isWinner ? 'var(--orange)' : 'var(--ink-soft)',
                      background: 'var(--pill-light)',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      border: '1px solid var(--line)',
                    }}>
                      +{match.pointsDelta} SP
                    </div>
                    <div
                      title={`Partida arbitrada en servidor. Semilla PRNG: ${match.seed}`}
                      style={{
                        fontSize: '11px',
                        color: 'var(--success)',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(16, 185, 129, 0.08)',
                        padding: '4px 10px',
                        borderRadius: '999px',
                      }}
                    >
                      🛡️ Verificada
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
