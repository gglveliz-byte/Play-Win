'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VerifyAccountContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'LOADING' | 'SUCCESS' | 'ERROR'>('LOADING');
  const [message, setMessage] = useState('');
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('ERROR');
      setMessage('No se ha proporcionado un token de verificación.');
      return;
    }

    verifyToken(token);
  }, [token]);

  const verifyToken = async (tok: string) => {
    setStatus('LOADING');
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Token inválido.');

      setStatus('SUCCESS');
      setMessage(data.message || '¡Tu cuenta ha sido verificada exitosamente!');
    } catch (err: any) {
      setStatus('ERROR');
      setMessage(err.message);
    }
  };

  return (
    <div className="warm-card" style={{ maxWidth: '520px', width: '100%', padding: '36px', textAlign: 'center' }}>
      <div style={{ marginBottom: '16px' }}>
        <span className="brand-dot" style={{ width: '14px', height: '14px', display: 'inline-block' }}></span>
      </div>

      <h1 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--ink)', marginBottom: '8px' }}>
        Verificación de Cuenta
      </h1>

      {status === 'LOADING' && (
        <p style={{ color: 'var(--mute)', fontSize: '14px', margin: '20px 0' }}>
          Verificando credenciales de seguridad en Neon DB...
        </p>
      )}

      {status === 'SUCCESS' && (
        <div style={{ margin: '24px 0' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>🛡️</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1b8a36', marginBottom: '8px' }}>
            {message}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '24px' }}>
            Tu Pasaporte Competitivo eSports está 100% activo. Ya estás habilitado para recibir transferencias de premios por PayPal.
          </p>
          <Link href="/" className="btn-pill-3d btn-pill-primary" style={{ textDecoration: 'none', padding: '12px 30px' }}>
            Ir a la Arena y Competir ➔
          </Link>
        </div>
      )}

      {status === 'ERROR' && (
        <div style={{ margin: '20px 0' }}>
          <div style={{ fontSize: '38px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626', marginBottom: '16px' }}>
            {message}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualToken) verifyToken(manualToken);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}
          >
            <input
              type="text"
              placeholder="Pega tu token de verificación aquí"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button type="submit" className="btn-pill-3d btn-pill-dark" style={{ width: '100%' }}>
              Validar Token Manualmente
            </button>
          </form>

          <div style={{ marginTop: '20px' }}>
            <Link href="/" style={{ color: 'var(--mute)', fontSize: '13px', textDecoration: 'underline' }}>
              Volver al Hub Principal
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyAccountPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Suspense fallback={<div style={{ color: 'var(--mute)' }}>Cargando verificación...</div>}>
        <VerifyAccountContent />
      </Suspense>
    </main>
  );
}
