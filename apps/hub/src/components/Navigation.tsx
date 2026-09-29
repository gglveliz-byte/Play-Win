'use client';

import React, { useState, useEffect } from 'react';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export function Navigation({
  activeTab,
  setActiveTab,
  user,
  onOpenAuth,
  onLogout,
}: NavigationProps) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const nextSunday = new Date();
      nextSunday.setUTCDate(now.getUTCDate() + (7 - now.getUTCDay()) % 7);
      nextSunday.setUTCHours(23, 59, 59, 999);
      if (nextSunday.getTime() <= now.getTime()) {
        nextSunday.setUTCDate(nextSunday.getUTCDate() + 7);
      }

      const diffMs = nextSunday.getTime() - now.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diffMs / (1000 * 60)) % 60);
      const secs = Math.floor((diffMs / 1000) % 60);

      setTimeLeft(`${days}d ${hours}h ${mins}m ${secs}s`);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="nav-pill-bar">
      <div
        className="brand-badge"
        onClick={() => setActiveTab('games')}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', padding: '3px 12px 3px 4px' }}
      >
        <img
          src="/images/logo.jpg"
          alt="Play Win eSports"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            objectFit: 'cover',
            boxShadow: '0 2px 8px rgba(210, 105, 26, 0.35)',
            border: '1px solid rgba(210, 105, 26, 0.4)',
          }}
        />
        <span style={{ fontWeight: 900, letterSpacing: '1px', fontSize: '13px' }}>PLAY WIN</span>
      </div>

      <div className="nav-links">
        <button
          className={`nav-link ${activeTab === 'games' ? 'active' : ''}`}
          onClick={() => setActiveTab('games')}
        >
          Juegos 1v1
        </button>
        <button
          className={`nav-link ${activeTab === 'leagues' ? 'active' : ''}`}
          onClick={() => setActiveTab('leagues')}
        >
          Micro-Ligas
        </button>
        <button
          className={`nav-link ${activeTab === 'passport' ? 'active' : ''}`}
          onClick={() => setActiveTab('passport')}
        >
          Pasaporte
        </button>
        <button
          className={`nav-link ${activeTab === 'wallet' ? 'active' : ''}`}
          onClick={() => setActiveTab('wallet')}
        >
          Billetera & Premios
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Reloj Semanal en Tiempo Real */}
        <div style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--mute)',
          background: 'var(--pill-light)',
          padding: '6px 14px',
          borderRadius: '999px',
          border: '1px solid var(--line)',
        }} suppressHydrationWarning>
          Fin de Temporada: <strong style={{ color: 'var(--ink)', fontFamily: 'monospace' }} suppressHydrationWarning>{timeLeft}</strong>
        </div>

        {/* Perfil o Botón de Autenticación */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--card)',
              padding: '4px 14px 4px 6px',
              borderRadius: '999px',
              border: '1px solid var(--line)',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--orange)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '11px',
              }}>
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>{user.username}</span>
              <span style={{
                background: 'var(--ink)',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '999px',
              }}>
                ${parseFloat(user.wallet_balance || 0).toFixed(2)}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="btn-pill-light"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        ) : (
          <button className="btn-pill-3d btn-pill-primary" onClick={onOpenAuth} style={{ padding: '8px 18px', fontSize: '13px' }}>
            Iniciar Sesión
          </button>
        )}
      </div>
    </nav>
  );
}
