'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [manualToken, setManualToken] = useState(token);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const targetToken = token || manualToken;
    if (!targetToken) {
      setError('Debes proporcionar un token de recuperación válido.');
      return;
    }

    if (password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: targetToken, newPassword: password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al restablecer contraseña.');

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="warm-card" style={{ maxWidth: '480px', width: '100%', padding: '36px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <span className="brand-dot" style={{ width: '12px', height: '12px', display: 'inline-block' }}></span>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ink)', margin: '8px 0 4px' }}>
          Nueva Contraseña
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--mute)' }}>
          Ingresa tu nueva clave de acceso para tu cuenta de Play Win.
        </p>
      </div>

      {success ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>🎉</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1b8a36', marginBottom: '8px' }}>
            ¡Contraseña Actualizada con Éxito!
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '24px' }}>
            Tu contraseña ha sido actualizada en la base de datos de Neon. Ya puedes iniciar sesión con tu nueva clave.
          </p>
          <Link href="/" className="btn-pill-3d btn-pill-primary" style={{ textDecoration: 'none', display: 'inline-block', width: '100%', padding: '12px 20px' }}>
            Ir a Iniciar Sesión ➔
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          {!token && (
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                TOKEN DE RECUPERACIÓN
              </label>
              <input
                type="text"
                required
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Pega el código de 64 caracteres recibido en tu correo"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none' }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
              NUEVA CONTRASEÑA
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
              CONFIRMAR NUEVA CONTRASEÑA
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite tu nueva contraseña"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-pill-3d btn-pill-primary"
            style={{ width: '100%', marginTop: '6px' }}
          >
            {loading ? 'Actualizando...' : 'Guardar Nueva Contraseña'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <Link href="/" style={{ color: 'var(--mute)', fontSize: '12px', textDecoration: 'underline' }}>
              Cancelar y Volver al Hub
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Suspense fallback={<div style={{ color: 'var(--mute)' }}>Cargando formulario...</div>}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
