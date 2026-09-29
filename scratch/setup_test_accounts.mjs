import bcrypt from '../apps/hub/node_modules/bcryptjs/index.js';
import { pool } from '../packages/database/src/index.js';

async function setupAccounts() {
  console.log('🔧 Configurando cuentas de prueba con contraseñas conocidas...');
  const password = 'PlayWin123!';
  const hash = await bcrypt.hash(password, 10);

  const accounts = [
    {
      username: 'progamer2026',
      email: 'progamer2026@playwin.gg',
      wallet: 25.00,
      description: 'Jugador Pro con 2 victorias oficiales e historial de duelos en el Pasaporte',
    },
    {
      username: 'carlos_pro',
      email: 'carlos@playwin.gg',
      wallet: 15.00,
      description: 'Rival oficial para duelos y emparejamiento 1v1',
    },
    {
      username: 'alex_pro',
      email: 'alex@playwin.gg',
      wallet: 59.99,
      description: 'Ganador de Liga Semanal con saldo listo para probar Retiros por PayPal Payouts',
    },
    {
      username: 'novato_esports',
      email: 'novato@playwin.gg',
      wallet: 0.00,
      description: 'Cuenta limpia sin historial para probar onboarding y primer combate',
    },
  ];

  for (const acc of accounts) {
    const check = await pool.query('SELECT id FROM users WHERE username = $1', [acc.username]);
    if (check.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (username, email, password_hash, wallet_balance, is_verified) VALUES ($1, $2, $3, $4, true)',
        [acc.username, acc.email, hash, acc.wallet]
      );
      console.log(`✅ Creada cuenta: ${acc.username} (${acc.email})`);
    } else {
      await pool.query(
        'UPDATE users SET password_hash = $1, wallet_balance = $2, is_verified = true WHERE username = $3',
        [hash, acc.wallet, acc.username]
      );
      console.log(`🔄 Actualizada cuenta: ${acc.username} (${acc.email})`);
    }
  }

  console.log('\n🎉 ¡TODAS LAS CUENTAS QUEDARON ACTIVAS Y VERIFICADAS!');
  console.log(`🔑 Contraseña unificada: ${password}`);
  await pool.end();
}

setupAccounts().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
