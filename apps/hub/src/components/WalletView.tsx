'use client';

import React, { useState, useEffect } from 'react';

interface WalletViewProps {
  user: any;
  onOpenAuth: () => void;
}

export function WalletView({ user, onOpenAuth }: WalletViewProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/transactions');
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error('[Transactions error]', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="hero-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h2 style={{ fontSize: '26px', fontWeight: 900, marginBottom: '12px' }}>Billetera y Premios eSports</h2>
        <p style={{ color: 'var(--mute)', marginBottom: '24px' }}>Inicia sesión para gestionar tus fondos, retiros PayPal y pases de temporada.</p>
        <button onClick={onOpenAuth} className="btn-pill-3d btn-pill-primary">Iniciar Sesión ➔</button>
      </div>
    );
  }

  const balance = parseFloat(user.wallet_balance || 0).toFixed(2);

  const formatMethod = (provider: string) => {
    if (provider === 'WHOP') return 'Suscripción / Tarjeta';
    if (provider === 'PAYPAL') return 'PayPal Payout';
    if (provider === 'SYSTEM') return 'Bolsa de Premios';
    return provider;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {/* Tarjeta de Saldo */}
        <div className="warm-card">
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '1px' }}>SALDO DISPONIBLE</span>
          <div style={{ fontSize: '42px', fontWeight: 900, color: 'var(--ink)', margin: '8px 0 16px' }}>
            ${balance} <span style={{ fontSize: '16px', color: 'var(--mute)' }}>USD</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--mute)', marginBottom: '20px' }}>
            Fondos acumulados por victorias en Micro-Ligas semanales.
          </p>
          <button className="btn-pill-3d btn-pill-primary" style={{ width: '100%' }}>
            Solicitar Retiro PayPal ➔
          </button>
        </div>

        {/* Pase de Temporada */}
        <div className="warm-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1px' }}>PASE DE TEMPORADA</span>
            <span style={{ background: '#22c55e', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '999px' }}>ACTIVO</span>
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Play Win Pro Pass</h3>
          <p style={{ fontSize: '13px', color: 'var(--mute)', marginBottom: '20px' }}>
            Acceso ilimitado a Micro-Ligas premiadas semanales sin cuota de entrada por partida.
          </p>
          <button className="btn-pill-3d btn-pill-dark" style={{ width: '100%' }}>
            Gestionar Suscripción Pro
          </button>
        </div>

        {/* Pasarela PayPal Payouts */}
        <div className="warm-card">
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1px' }}>DISPERSIÓN AUTOMÁTICA</span>
          <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '8px 0' }}>Retiros PayPal</h3>
          <p style={{ fontSize: '13px', color: 'var(--mute)', marginBottom: '14px' }}>
            Los premios del domingo a las 23:59 UTC se transfieren a tu correo oficial:
          </p>
          <div style={{ background: 'var(--pill-light)', padding: '10px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
            {user.paypal_email || user.email}
          </div>
          <button className="btn-pill-3d btn-pill-light" style={{ width: '100%' }}>
            Actualizar Correo PayPal
          </button>
        </div>
      </div>

      {/* Historial de Movimientos */}
      <div className="hero-card">
        <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '16px' }}>Historial Oficial de Premios y Transacciones</h3>
        {loading ? (
          <p style={{ color: 'var(--mute)' }}>Cargando movimientos de cuenta...</p>
        ) : transactions.length === 0 ? (
          <p style={{ color: 'var(--mute)' }}>Aún no registras transacciones en tu cuenta.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', color: 'var(--mute)', fontSize: '11px', fontWeight: 800 }}>
                  <th style={{ padding: '10px 14px' }}>FECHA</th>
                  <th style={{ padding: '10px 14px' }}>CONCEPTO</th>
                  <th style={{ padding: '10px 14px' }}>MÉTODO</th>
                  <th style={{ padding: '10px 14px' }}>MONTO</th>
                  <th style={{ padding: '10px 14px' }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 14px' }} suppressHydrationWarning>{new Date(tx.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 700 }}>{tx.type}</td>
                    <td style={{ padding: '12px 14px' }}>{formatMethod(tx.provider)}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: tx.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} {tx.currency}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: '#22c55e', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', fontWeight: 800 }}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
