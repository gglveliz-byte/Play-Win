'use client';

import React, { useState, useEffect } from 'react';
import { GAMES, LEAGUE_PRIZE_POOL, PRIZE_SPLIT } from '@playwin/database';

interface LeagueStandingsProps {
  currentUserId?: string;
  onLaunchGame: (gameId: string) => void;
  refreshKey?: number;
}

export function LeagueStandings({ currentUserId, onLaunchGame, refreshKey }: LeagueStandingsProps) {
  const [selectedGame, setSelectedGame] = useState('carreras');
  const [leagueData, setLeagueData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeague(selectedGame);
  }, [selectedGame, refreshKey]);

  const fetchLeague = async (gameId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leagues?gameId=${gameId}`);
      const data = await res.json();
      if (data.success) {
        setLeagueData(data.league);
      }
    } catch (err) {
      console.error('[League fetch error]', err);
    } finally {
      setLoading(false);
    }
  };

  const standings = leagueData?.standings || [];

  return (
    <div className="hero-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            MICRO-LIGAS SEMANALES CERRADAS
          </span>
          <h2 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--ink)' }}>
            Tabla de Posición Oficial (Grupo de 10)
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--mute)' }}>
            Bolsa de premios semanal: <strong>${LEAGUE_PRIZE_POOL.toFixed(2)} USD</strong> (${PRIZE_SPLIT[1].toFixed(2)} al 1º, ${PRIZE_SPLIT[2].toFixed(2)} al 2º, ${PRIZE_SPLIT[3].toFixed(2)} al 3º)
          </p>
        </div>

        {/* Selector de Juego */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--pill-light)', padding: '4px', borderRadius: '999px', border: '1px solid var(--line)' }}>
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGame(g.id)}
              className={`nav-link ${selectedGame === g.id ? 'active' : ''}`}
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Banner Oficial del Campeonato Semanal con Trofeo y Medallas */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '180px',
        borderRadius: '18px',
        overflow: 'hidden',
        marginBottom: '24px',
        border: '1px solid var(--line)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)',
      }}>
        <img
          src="/images/league-banner.jpg"
          alt="Play Win Weekly League Championship"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(12,12,14,0.15) 0%, rgba(12,12,14,0.85) 100%)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '18px 24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--orange)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              BOLSA DE PREMIOS GARANTIZADA: ${LEAGUE_PRIZE_POOL.toFixed(2)} USD
            </span>
            <div style={{ color: 'var(--on-dark)', fontSize: '15px', fontWeight: 800 }}>
              🥇 1º Puesto: ${PRIZE_SPLIT[1].toFixed(2)} USD • 🥈 2º Puesto: ${PRIZE_SPLIT[2].toFixed(2)} USD • 🥉 3º Puesto: ${PRIZE_SPLIT[3].toFixed(2)} USD
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            color: 'var(--on-dark)',
            fontSize: '11px',
            fontWeight: 800,
            padding: '5px 14px',
            borderRadius: '999px',
            border: '1px solid rgba(255,255,255,0.25)',
          }}>
            ✓ Liquidación Automática los Domingos vía PayPal
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--mute)' }}>
          Cargando clasificación de la liga en tiempo real...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)', color: 'var(--mute)', fontSize: '11px', fontWeight: 800 }}>
                <th style={{ padding: '12px 16px' }}>POS</th>
                <th style={{ padding: '12px 16px' }}>JUGADOR</th>
                <th style={{ padding: '12px 16px' }}>SEASON POINTS</th>
                <th style={{ padding: '12px 16px' }}>PREMIO ESTIMADO</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACCIÓN</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((member: any, idx: number) => {
                const isMe = member.user_id === currentUserId;
                const rank = idx + 1;
                // Los importes salen de las constantes compartidas: antes estaban
                // escritos a mano aquí y en otros cinco archivos (BUG-008).
                const importePremio = (PRIZE_SPLIT as Record<number, number>)[rank];
                const prize = importePremio ? `$${importePremio.toFixed(2)} USD (${rank}º)` : '-';

                return (
                  <tr
                    key={member.user_id}
                    style={{
                      borderBottom: '1px solid var(--line)',
                      background: isMe ? 'rgba(210, 105, 26, 0.08)' : 'transparent',
                      fontWeight: isMe ? 800 : 500,
                    }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: rank <= 3 ? 'var(--ink)' : 'var(--pill-light)',
                        color: rank <= 3 ? 'var(--on-dark)' : 'var(--ink)',
                        fontSize: '12px',
                        fontWeight: 800,
                      }}>
                        {rank}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: isMe ? 'var(--orange)' : 'var(--pill-light)',
                          color: isMe ? 'var(--on-dark)' : 'var(--ink)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '11px',
                          border: '1px solid var(--line)',
                        }}>
                          {member.username.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{member.username} {isMe && <span style={{ color: 'var(--orange)', fontSize: '11px' }}>(Tú)</span>}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--orange)', fontWeight: 800 }}>
                      +{member.season_points} SP
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: rank <= 3 ? 'var(--ink)' : 'var(--mute)' }}>
                      {prize}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {isMe ? (
                        <button
                          onClick={() => onLaunchGame(selectedGame)}
                          className="btn-pill-3d btn-pill-primary"
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                          Sumar +100 SP ➔
                        </button>
                      ) : (
                        <span style={{ color: 'var(--mute)', fontSize: '12px' }}>Rival activo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
