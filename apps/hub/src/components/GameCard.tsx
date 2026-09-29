'use client';

import React from 'react';

interface GameCardProps {
  gameId: string;
  title: string;
  subtitle: string;
  image?: string;
  badge: string;
  passport: any;
  onLaunch: (gameId: string) => void;
}

export function GameCard({
  gameId,
  title,
  subtitle,
  image = `/images/games/${gameId}.jpg`,
  badge,
  passport,
  onLaunch,
}: GameCardProps) {
  const wins = passport?.wins || 0;
  const losses = passport?.losses || 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const seasonPoints = passport?.season_points || 0;
  const tier = passport?.rank_tier || 'BRONZE';

  return (
    <div
      className="warm-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px',
        overflow: 'hidden',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease',
      }}
    >
      <div>
        {/* Cover Art eSports Banner */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '170px',
            borderRadius: '16px',
            overflow: 'hidden',
            marginBottom: '16px',
            background: 'var(--ink)',
          }}
        >
          <img
            src={image}
            alt={title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transition: 'transform 0.4s ease',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(12, 12, 14, 0.1) 0%, rgba(12, 12, 14, 0.75) 100%)',
            }}
          />
          {/* Badge Tag Flotante */}
          <span
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '1px',
              color: 'var(--on-dark)',
              background: 'rgba(210, 105, 26, 0.92)',
              backdropFilter: 'blur(8px)',
              padding: '4px 10px',
              borderRadius: '999px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            {badge}
          </span>
        </div>

        <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', marginBottom: '6px' }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--mute)', marginBottom: '18px', fontWeight: 500, lineHeight: 1.4 }}>
          {subtitle}
        </p>

        {/* Métricas del Pasaporte en Vivo */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            background: 'var(--pill-light)',
            padding: '12px 8px',
            borderRadius: '14px',
            border: '1px solid var(--line)',
            marginBottom: '18px',
            textAlign: 'center',
          }}
        >
          <div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--mute)', display: 'block' }}>DIVISIÓN</span>
            <strong style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: 800 }}>{tier}</strong>
          </div>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--mute)', display: 'block' }}>VICTORIAS</span>
            <strong style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: 800 }}>{wins} ({winRate}%)</strong>
          </div>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--mute)', display: 'block' }}>SEASON PTS</span>
            <strong style={{ fontSize: '12px', color: 'var(--orange)', fontWeight: 900 }}>+{seasonPoints} SP</strong>
          </div>
        </div>
      </div>

      <button
        onClick={() => onLaunch(gameId)}
        className="btn-pill-3d btn-pill-primary"
        style={{ width: '100%', padding: '12px 18px', fontSize: '13px' }}
      >
        Entrar a la Arena 1v1 ➔
      </button>
    </div>
  );
}
