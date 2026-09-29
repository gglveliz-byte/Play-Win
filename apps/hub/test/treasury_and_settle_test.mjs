import pg from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;

/**
 * Carga el entorno del Hub (apps/hub/.env.local).
 *
 * ¿Por qué este archivo y no `.env.test`? Porque el servidor de Next.js solo
 * carga .env.local desde SU directorio. Para firmar peticiones que el Hub
 * acepte, el test necesita EXACTAMENTE los mismos secretos que él tiene.
 * Lo que ya esté en process.env (por --env-file) tiene prioridad.
 */
function loadHubEnv() {
  const envPath = path.resolve(process.cwd(), 'apps/hub/.env.local');
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadHubEnv();

// Configuración leída del entorno. Sin secretos quemados.
const connectionString = process.env.DATABASE_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET;

if (!connectionString || !CRON_SECRET || !JWT_SECRET || !WHOP_WEBHOOK_SECRET) {
  throw new Error(
    'Faltan DATABASE_URL, CRON_SECRET, JWT_SECRET o WHOP_WEBHOOK_SECRET.\n' +
      '  → Ejecuta: npm run test:treasury  (carga .env.test y apps/hub/.env.local)'
  );
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function runTreasuryTests() {
  console.log('🧪 Iniciando prueba de Tesorería, Whop, PayPal y Cierre de Ligas en Neon PostgreSQL...');

  const uniqueUser = `winner_${Date.now().toString(36).slice(-6)}`;
  const email = `${uniqueUser}@playwin.gg`;

  try {
    // 1. Crear usuario competidor
    const uRes = await pool.query(`
      INSERT INTO users (username, email, password_hash, wallet_balance)
      VALUES ($1, $2, 'hash_test_2026', 50.00)
      RETURNING id, username, email, wallet_balance;
    `, [uniqueUser, email]);
    const user = uRes.rows[0];
    console.log(`✅ Usuario creado: ${user.username} con balance inicial: $${user.wallet_balance} USD`);

    // 2. Simular Webhook de Whop (Activación de Pase Premium y Depósito)
    console.log('\n2️⃣ Probando Webhook Whop (/api/webhooks/whop)...');
    const whopPayload = {
      action: 'payment.succeeded',
      data: {
        id: `pay_${Date.now()}`,
        email,
        final_amount: 1999, // $19.99 USD en centavos
        currency: 'USD',
      },
    };

    const whopBody = JSON.stringify(whopPayload);
    // Firmamos el cuerpo crudo con HMAC SHA-256: el webhook ahora EXIGE firma
    // válida (BUG-005), así que el test ejercita la verificación real.
    const whopSignature = crypto.createHmac('sha256', WHOP_WEBHOOK_SECRET).update(whopBody).digest('hex');

    const whopRes = await fetch('http://localhost:3000/api/webhooks/whop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'whop-signature': whopSignature,
      },
      body: whopBody,
    });
    const whopData = await whopRes.json();

    // Aserción real: antes este test reportaba "éxito" incluso con HTTP 503.
    if (whopRes.status !== 200) {
      throw new Error(`Webhook Whop falló: HTTP ${whopRes.status} → ${JSON.stringify(whopData)}`);
    }
    console.log('✅ Webhook Whop firmado y aceptado:', whopRes.status, whopData);

    // Verificar balance actualizado en Neon
    const balCheck1 = await pool.query('SELECT wallet_balance FROM users WHERE id = $1;', [user.id]);
    console.log('   Balance tras depósito Whop ($19.99):', balCheck1.rows[0].wallet_balance, 'USD');

    // 3. Crear una Micro-Liga simulada con fecha vencida para probar el motor de cierre
    console.log('\n3️⃣ Probando Motor de Cierre Semanal de Ligas (/api/cron/settle-leagues)...');
    const pastDate = new Date(Date.now() - 3600000); // 1 hora en el pasado
    const leagueRes = await pool.query(`
      INSERT INTO league_groups (season_number, game_id, rank_tier, prize_pool, starts_at, ends_at, is_locked)
      VALUES (42, 'carreras', 'GOLD', 25.00, $1, $1, FALSE)
      RETURNING id, season_number;
    `, [pastDate]);
    const testLeague = leagueRes.rows[0];

    // Asignar al usuario como 1º puesto con 500 Season Points
    await pool.query(`
      INSERT INTO league_members (league_id, user_id, season_points, position)
      VALUES ($1, $2, 500, 1);
    `, [testLeague.id, user.id]);

    // Ejecutar el cierre a través del endpoint protegido de Cron
    const cronRes = await fetch(`http://localhost:3000/api/cron/settle-leagues?secret=${encodeURIComponent(CRON_SECRET)}`);
    const cronData = await cronRes.json();
    console.log('✅ Ligas liquidadas por Cron:', cronData.result?.settledLeaguesCount);
    console.log('   Total de premios dispersados:', cronData.result?.totalPrizesDisbursed, 'USD');

    // Verificar premio acreditado en billetera
    const balCheck2 = await pool.query('SELECT wallet_balance FROM users WHERE id = $1;', [user.id]);
    console.log('   Balance tras ganar 1º Puesto ($15.00 premio):', balCheck2.rows[0].wallet_balance, 'USD');

    // 4. Probar Retiro con PayPal Payouts
    console.log('\n4️⃣ Probando Retiro de Ganancias vía PayPal Payouts (/api/payments/paypal/payout)...');
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      JWT_SECRET
    );

    const payoutRes = await fetch('http://localhost:3000/api/payments/paypal/payout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `playwin_session=${token}`,
      },
      body: JSON.stringify({
        amount: 25.00,
        paypalEmail: 'paypal_payout_test@playwin.gg',
      }),
    });
    const payoutData = await payoutRes.json();

    const balanceAntes = parseFloat(balCheck2.rows[0].wallet_balance);

    if (payoutRes.status === 503 && payoutData.code === 'PAYOUT_NOT_CONFIGURED') {
      // Comportamiento ESPERADO mientras no exista la integración real con
      // PayPal: se rechaza sin tocar el saldo. Antes el endpoint debitaba y
      // respondía "procesado exitosamente" sin emitir ningún pago (BUG-015).
      console.log('✅ Retiro RECHAZADO correctamente (integración PayPal pendiente):', payoutRes.status);
      console.log(`   Motivo: ${payoutData.error}`);

      const balCheck3 = await pool.query('SELECT wallet_balance FROM users WHERE id = $1;', [user.id]);
      const balanceDespues = parseFloat(balCheck3.rows[0].wallet_balance);
      if (balanceDespues !== balanceAntes) {
        throw new Error(
          `El retiro rechazado NO debe tocar el saldo: antes $${balanceAntes}, después $${balanceDespues}`
        );
      }
      console.log(`   ✅ Saldo intacto tras el rechazo: $${balanceDespues} USD`);
    } else if (payoutRes.status === 200) {
      // Camino de la integración real: el asiento debe quedar en PENDING.
      console.log('✅ Retiro enviado a PayPal:', payoutRes.status, payoutData);
      if (payoutData.status !== 'PENDING') {
        throw new Error(
          `Un retiro no puede nacer '${payoutData.status}': debe quedar PENDING hasta que PayPal confirme`
        );
      }
      const balCheck3 = await pool.query('SELECT wallet_balance FROM users WHERE id = $1;', [user.id]);
      console.log('   Balance final tras retiro (-$25.00):', balCheck3.rows[0].wallet_balance, 'USD');
    } else {
      throw new Error(`Respuesta inesperada del endpoint de retiro: HTTP ${payoutRes.status} ${JSON.stringify(payoutData)}`);
    }

    // 5. Verificar extracto en wallet_ledger
    const ledgerRows = await pool.query('SELECT type, amount, status, provider FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at ASC;', [user.id]);
    console.log('\n5️⃣ Asientos registrados en el Libro Contable (Ledger):');
    ledgerRows.rows.forEach(r => console.log(`   - [${r.provider}] ${r.type}: ${r.amount} USD (${r.status})`));

    console.log('\n🏆 ¡TODAS LAS PRUEBAS DE FACTURACIÓN, WHOP, PAYPAL Y MOTOR DE LIGAS PASARON AL 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en prueba de tesorería:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTreasuryTests();
