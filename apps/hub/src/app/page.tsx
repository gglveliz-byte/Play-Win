'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { AuthModal } from '@/components/AuthModal';
import { GameCard } from '@/components/GameCard';
import { LeagueStandings } from '@/components/LeagueStandings';
import { GameLauncherModal } from '@/components/GameLauncherModal';
import { WalletView } from '@/components/WalletView';
import { PassportView } from '@/components/PassportView';

const GAMES = [
  {
    id: 'carreras',
    title: 'Speed Horizon 3D',
    subtitle: 'Carreras 1v1 a alta velocidad en autopista costera.',
    image: '/images/games/carreras.jpg',
    badge: '3D RACING',
  },
  {
    id: 'flapy-flapy',
    title: 'Bati Vuelo 1v1',
    subtitle: 'Duelo arcade de precisión en cavernas oscuras.',
    image: '/images/games/flapy-flapy.jpg',
    badge: 'PRECISION TAP',
  },
  {
    id: 'space',
    title: 'Fuerza Espacial',
    subtitle: 'Batalla de cazas estelares y esquive de asteroides.',
    image: '/images/games/space.jpg',
    badge: 'ARCADE SHMUP',
  },
  {
    id: 'sky',
    title: 'Sky Runner 3D',
    subtitle: 'Salto sobre plataformas en el abismo del hiperespacio.',
    image: '/images/games/sky.jpg',
    badge: '3D RUNNER',
  },
];

export default function HubPage() {
  const [activeTab, setActiveTab] = useState('games');
  const [user, setUser] = useState<any>(null);
  const [passports, setPassports] = useState<any[]>([]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchSession();
    try {
      const savedGame = sessionStorage.getItem('playwin_active_game_id');
      if (savedGame) setActiveGameId(savedGame);
    } catch (_) {}
  }, []);

  const handleMatchComplete = () => {
    fetchSession();
    setRefreshKey((k) => k + 1);
  };

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        setUser(data.user);
        setPassports(data.passports || []);
      } else {
        setUser(null);
        setPassports([]);
      }
    } catch (err) {
      console.error('[Session fetch error]', err);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' });
    setUser(null);
    setPassports([]);
  };

  const getPassportForGame = (gameId: string) => {
    return passports.find((p) => p.game_id === gameId);
  };

  const totalSeasonPoints = passports.reduce((sum, p) => sum + (p.season_points || 0), 0);
  const totalWins = passports.reduce((sum, p) => sum + (p.wins || 0), 0);

  const handleLaunchGame = (gameId: string) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    setActiveGameId(gameId);
    try { sessionStorage.setItem('playwin_active_game_id', gameId); } catch (_) {}
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }} suppressHydrationWarning>
      {/* Navegación Flotante en Píldora */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      {/* Hero Header con Branding Oficial y Banner Cinematográfico */}
      <section className="hero-card" style={{ padding: '36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ maxWidth: '640px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--pill-light)', padding: '5px 14px 5px 6px', borderRadius: '999px', border: '1px solid var(--line)', marginBottom: '14px' }}>
              <img src="/images/logo.jpg" alt="Logo" style={{ width: '22px', height: '22px', borderRadius: '6px', objectFit: 'cover' }} />
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '1px' }}>
                CIRCUITO OFICIAL ESPORTS • TEMPORADA 1
              </span>
            </div>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1, margin: '6px 0 16px' }}>
              Compite en Duelos 1v1 y Gana Premios Semanales
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: '24px' }}>
              Sistema de micro-ligas cerradas de 10 jugadores. Partidas sincronizadas en tiempo real con rivales fantasma y árbitro anti-trampas en el servidor.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleLaunchGame('carreras')}
                className="btn-pill-3d btn-pill-primary"
              >
                Duelo Rápido (Carreras 3D) ➔
              </button>
              <button
                onClick={() => setActiveTab('leagues')}
                className="btn-pill-3d btn-pill-dark"
              >
                Ver Mi Micro-Liga
              </button>
            </div>
          </div>

          {/* Tarjeta de Resumen Rápido del Jugador */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.75)',
            border: '1px solid var(--line)',
            borderRadius: '22px',
            padding: '24px 28px',
            minWidth: '280px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.04)',
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--mute)', letterSpacing: '1px' }}>
              {user ? `PILOTO: ${user.username.toUpperCase()}` : 'ESTADO: MODO COMPETITIVO'}
            </span>
            <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--ink)', margin: '4px 0 16px' }}>
              +{totalSeasonPoints} <span style={{ fontSize: '14px', color: 'var(--orange)' }}>SP</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--mute)' }}>Victorias Oficiales:</span>
                <strong style={{ color: 'var(--ink)' }}>{totalWins}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--mute)' }}>División:</span>
                <strong style={{ color: 'var(--ink)' }}>Micro-Liga Semanal</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--mute)' }}>Premio en Juego:</span>
                <strong style={{ color: 'var(--orange)' }}>$25.00 USD</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Banner Panorámico de la Arena eSports */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '200px',
          borderRadius: '20px',
          overflow: 'hidden',
          marginTop: '28px',
          border: '1px solid var(--line)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.07)',
        }}>
          <img
            src="/images/hero-banner.jpg"
            alt="Arena eSports Play Win"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(12,12,14,0.85) 0%, rgba(12,12,14,0.4) 60%, rgba(12,12,14,0.8) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            flexWrap: 'wrap',
            gap: '16px',
          }}>
            <div>
              <span style={{
                background: 'var(--orange)',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 900,
                padding: '3px 8px',
                borderRadius: '4px',
                letterSpacing: '1px',
              }}>
                ARENA OFICIAL 1v1
              </span>
              <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: 900, margin: '6px 0 2px' }}>
                Duelos Multijugador Sincronizados en Tiempo Real
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', margin: 0 }}>
                4 títulos arcade con servidores autoritativos, física idéntica por semilla PRNG y cero trampas.
              </p>
            </div>
            <button
              onClick={() => handleLaunchGame('carreras')}
              className="btn-pill-3d btn-pill-primary"
              style={{ padding: '10px 22px', fontSize: '13px' }}
            >
              Comenzar a Competir ➔
            </button>
          </div>
        </div>
      </section>

      {/* Contenido según Pestaña Activa */}
      <section style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', flex: 1 }}>
        {activeTab === 'games' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ink)' }}>Juegos Oficiales de la Liga</h2>
              <p style={{ fontSize: '14px', color: 'var(--mute)' }}>Selecciona un título para iniciar tu emparejamiento 1v1 en vivo.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '22px' }}>
              {GAMES.map((game) => (
                <GameCard
                  key={game.id}
                  gameId={game.id}
                  title={game.title}
                  subtitle={game.subtitle}
                  image={game.image}
                  badge={game.badge}
                  passport={getPassportForGame(game.id)}
                  onLaunch={(gId) => handleLaunchGame(gId)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'leagues' && (
          <LeagueStandings
            currentUserId={user?.id}
            onLaunchGame={(gId) => handleLaunchGame(gId)}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === 'passport' && (
          <PassportView
            user={user}
            passports={passports}
            onOpenAuth={() => setIsAuthOpen(true)}
            onLaunchGame={(gId) => handleLaunchGame(gId)}
          />
        )}

        {activeTab === 'wallet' && (
          <WalletView
            user={user}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}
      </section>

      {/* Modal de Autenticación */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => fetchSession()}
      />

      {/* Launcher de Juego en Iframe Seguro con Handshake */}
      <GameLauncherModal
        gameId={activeGameId}
        onClose={() => {
          setActiveGameId(null);
          try {
            sessionStorage.removeItem('playwin_active_game_id');
            sessionStorage.removeItem('playwin_active_arena');
          } catch (_) {}
        }}
        onMatchComplete={() => {
          handleMatchComplete();
          try {
            sessionStorage.removeItem('playwin_active_game_id');
            sessionStorage.removeItem('playwin_active_arena');
          } catch (_) {}
        }}
        onRequireAuth={() => setIsAuthOpen(true)}
      />
    </main>
  );
}
