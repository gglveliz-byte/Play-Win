'use client';

import React, { useState } from 'react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
}

const AVATARS = ['⚡', '🎮', '🏎️', '🚀', '🦇', '🔥', '👑', '💎'];

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('⚡');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'FORGOT') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al enviar enlace.');
        setSuccessMsg(data.message || 'Se ha enviado un correo con instrucciones.');
        return;
      }

      const endpoint = mode === 'REGISTER' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'REGISTER'
          ? { username, email, password, avatarUrl: avatar }
          : { identifier: username || email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar la solicitud.');
      }

      onSuccess(data.user);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera / Pestañas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          {mode !== 'FORGOT' ? (
            <div style={{ display: 'flex', gap: '6px', background: 'var(--pill-light)', padding: '3px', borderRadius: '999px' }}>
              <button
                className={`nav-link ${mode === 'LOGIN' ? 'active' : ''}`}
                onClick={() => { setMode('LOGIN'); setError(''); setSuccessMsg(''); }}
                type="button"
                style={{ padding: '6px 14px', fontSize: '12px' }}
              >
                Iniciar Sesión
              </button>
              <button
                className={`nav-link ${mode === 'REGISTER' ? 'active' : ''}`}
                onClick={() => { setMode('REGISTER'); setError(''); setSuccessMsg(''); }}
                type="button"
                style={{ padding: '6px 14px', fontSize: '12px' }}
              >
                Crear Cuenta
              </button>
            </div>
          ) : (
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--ink)' }}>
              Recuperación de Contraseña
            </div>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--mute)' }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid var(--danger)', color: 'var(--danger-strong)', padding: '10px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid var(--success)', color: 'var(--success)', padding: '12px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
            ✉️ {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'REGISTER' && (
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: '6px' }}>
                ELIGE TU AVATAR eSPORTS
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setAvatar(av)}
                    style={{
                      fontSize: '18px',
                      padding: '5px 8px',
                      borderRadius: '10px',
                      border: avatar === av ? '2px solid var(--orange)' : '1px solid var(--line)',
                      background: avatar === av ? 'var(--pill-light)' : 'var(--on-dark)',
                      cursor: 'pointer',
                    }}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode !== 'FORGOT' && (
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                {mode === 'REGISTER' ? 'NOMBRE DE USUARIO' : 'USUARIO O CORREO'}
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'REGISTER' ? 'Ej. BatiRojo99' : 'Tu alias o correo'}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--on-dark)', fontSize: '13px', outline: 'none' }}
              />
            </div>
          )}

          {(mode === 'REGISTER' || mode === 'FORGOT') && (
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                CORREO ELECTRÓNICO
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jugador@ejemplo.com"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--on-dark)', fontSize: '13px', outline: 'none' }}
              />
            </div>
          )}

          {mode !== 'FORGOT' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)' }}>
                  CONTRASEÑA
                </label>
                {mode === 'LOGIN' && (
                  <button
                    type="button"
                    onClick={() => { setMode('FORGOT'); setError(''); setSuccessMsg(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--on-dark)', fontSize: '13px', outline: 'none' }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-pill-3d btn-pill-primary"
            style={{ width: '100%', marginTop: '6px' }}
          >
            {loading ? 'Procesando...' : mode === 'REGISTER' ? 'Crear Cuenta y Pasaporte' : mode === 'FORGOT' ? 'Enviar Enlace de Recuperación' : 'Entrar a Competir'}
          </button>

          {mode === 'FORGOT' && (
            <button
              type="button"
              onClick={() => { setMode('LOGIN'); setError(''); setSuccessMsg(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--mute)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' }}
            >
              ← Volver al Inicio de Sesión
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
