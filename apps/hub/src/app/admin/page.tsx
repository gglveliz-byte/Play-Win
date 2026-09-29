'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { LEDGER_TYPES } from '@playwin/database';

/** Filas del resumen contable que devuelve /api/admin/metrics. */
interface LedgerRow {
  type: string;
  provider: string;
  count: number;
  total_amount: string | number;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/admin/metrics');
      const json = await res.json();

      // Antes se ignoraba res.ok: un 401/500 mostraba ceros en silencio,
      // indistinguible de "no hay datos" (BUG-004).
      if (!res.ok) {
        setError(json?.error || `Error HTTP ${res.status}`);
        setData(null);
        return;
      }

      setError(null);
      if (json.success) setData(json);
    } catch (err) {
      console.error('[Admin fetch error]', err);
      setError('No se pudo contactar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Suma el importe de un tipo de asiento contable.
   * La columna real es `type` (no `entry_type`) y los tipos válidos salen de
   * LEDGER_TYPES: buscar nombres inventados como 'WHOP_DEPOSIT' hacía que el
   * panel mostrara siempre $0.00.
   */
  const getLedgerTotal = (type: string) => {
    const rows: LedgerRow[] = data?.ledgerSummary ?? [];
    const total = rows
      .filter((row) => row.type === type)
      .reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    return total.toFixed(2);
  };

  return (
    <main style={{ minHeight: '100vh', padding: '24px 20px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Barra de cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="brand-dot"></span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '2px', textTransform: 'uppercase' }}>
              PLAY WIN OPERATIONAL ENGINE
            </span>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', margin: '4px 0 0' }}>
            Panel de Auditoría & Anti-Cheat
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={fetchMetrics} className="btn-pill-light" style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700 }}>
            🔄 Actualizar
          </button>
          <Link href="/" className="btn-pill-3d btn-pill-dark" style={{ textDecoration: 'none', padding: '8px 20px', fontSize: '13px' }}>
            Volver al Hub ➔
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--mute)' }}>
          Cargando telemetría en tiempo real desde Neon PostgreSQL...
        </div>
      ) : error ? (
        <div className="warm-card" style={{ borderColor: 'var(--orange)', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '2px', marginBottom: '8px' }}>
            NO SE PUDIERON CARGAR LAS MÉTRICAS
          </div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px' }}>{error}</p>
          <p style={{ fontSize: '13px', color: 'var(--mute)', margin: 0 }}>
            Este panel requiere una sesión con permisos de administrador. Concede el permiso con:
            <br />
            <code style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
              node --env-file=.env.test packages/database/scripts/grant-admin.mjs &lt;tu-usuario&gt;
            </code>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Tarjetas de Métricas Rápidas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="warm-card">
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--mute)' }}>USUARIOS TOTALES</span>
              <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', margin: '4px 0' }}>
                {data?.stats?.totalUsers || 0}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--orange)', fontWeight: 700 }}>Registrados en Neon DB</span>
            </div>

            <div className="warm-card">
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--mute)' }}>DUELOS 1v1 REGISTRADOS</span>
              <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', margin: '4px 0' }}>
                {data?.stats?.totalMatches || 0}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>100% Auditados por Árbitro</span>
            </div>

            <div className="warm-card">
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--mute)' }}>INGRESOS WHOP</span>
              <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--orange)', margin: '4px 0' }}>
                +${getLedgerTotal(LEDGER_TYPES.DEPOSIT)} <span style={{ fontSize: '13px' }}>USD</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--mute)' }}>Pases y Suscripciones</span>
            </div>

            <div className="warm-card">
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--mute)' }}>PREMIOS ENTREGADOS</span>
              <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', margin: '4px 0' }}>
                ${getLedgerTotal(LEDGER_TYPES.PRIZE_WIN)} <span style={{ fontSize: '13px' }}>USD</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--mute)' }}>Bolsas semanales de $25 USD</span>
            </div>
          </div>

          {/* Tabla de Partidas 1v1 Recientes y Telemetría */}
          <div className="hero-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>
                  Telemetría de Duelos 1v1 en Vivo (`match_records`)
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--mute)' }}>
                  Verificación de semilla matemática PRNG, duración de partida y detección de choque en el servidor.
                </p>
              </div>
              <span className="badge-chip">CERO CLIENT TRUST</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', color: 'var(--mute)', fontWeight: 800 }}>
                    <th style={{ padding: '10px 14px' }}>SALA</th>
                    <th style={{ padding: '10px 14px' }}>JUEGO</th>
                    <th style={{ padding: '10px 14px' }}>JUGADORES (P1 vs P2)</th>
                    <th style={{ padding: '10px 14px' }}>GANADOR</th>
                    <th style={{ padding: '10px 14px' }}>DURACIÓN</th>
                    <th style={{ padding: '10px 14px' }}>MOTIVO</th>
                    <th style={{ padding: '10px 14px' }}>SEMILLA</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>ESTADO</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recentMatches?.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: 'var(--mute)' }}>
                        No hay registros de partidas en Neon DB aún.
                      </td>
                    </tr>
                  ) : (
                    data?.recentMatches?.map((m: any) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700 }}>
                          {m.room_id}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: 'var(--pill-light)',
                            color: 'var(--ink)'
                          }}>
                            {m.game_id}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                          {m.player1_username} <span style={{ color: 'var(--orange)' }}>vs</span> {m.player2_username}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--orange)' }}>
                          👑 {m.winner_username || 'Empate'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--mute)' }}>
                          {(m.duration_ms / 1000).toFixed(1)}s
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700 }}>
                          {m.finish_reason}
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--mute)' }}>
                          {m.seed}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {m.finish_reason && (m.finish_reason.includes('SPEEDHACK') || m.finish_reason.includes('TELEPORT') || m.finish_reason.includes('COLLUSION') || m.finish_reason.includes('FLOOD') || m.finish_reason.includes('ANOMALY')) ? (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: '#c22d2d',
                              background: 'rgba(194, 45, 45, 0.12)',
                              padding: '3px 10px',
                              borderRadius: '999px',
                              border: '1px solid rgba(194, 45, 45, 0.3)'
                            }}>
                              🚨 Descalificado (Anti-Cheat)
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: '#1b8a36',
                              background: 'rgba(27, 138, 54, 0.1)',
                              padding: '3px 10px',
                              borderRadius: '999px'
                            }}>
                              ✓ Válida
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Micro-Ligas de 10 Activas */}
          <div className="hero-card">
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', marginBottom: '8px' }}>
              Micro-Ligas de 10 Jugadores Activas (`league_groups`)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginTop: '16px' }}>
              {data?.activeLeagues?.map((l: any) => (
                <div key={l.id} className="warm-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)' }}>{l.game_id.toUpperCase()}</span>
                    <span style={{ fontSize: '11px', fontWeight: 800, background: 'var(--pill-light)', padding: '2px 8px', borderRadius: '999px' }}>
                      TEMP #{l.season_number}
                    </span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 900, margin: '8px 0 4px' }}>
                    División {l.rank_tier}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--mute)', marginBottom: '10px' }}>
                    Ocupación: <strong style={{ color: 'var(--ink)' }}>{l.member_count} / 10 Jugadores</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--mute)' }}>
                    Cierre: {new Date(l.ends_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
