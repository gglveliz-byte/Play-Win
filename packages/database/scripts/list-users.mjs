/**
 * Separa los usuarios REALES de los generados por las suites de prueba.
 * Solo lectura.
 */
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

/** Patrones de cuentas que crean las suites automáticas y el motor de duelos. */
const ES_RUIDO = /^(winner_|champ_|pilot_|rival_|player_|champion_|val_|alex_test|test_)/i;

const q = await pool.query(`
  SELECT u.username, u.email, u.wallet_balance, u.is_verified, u.is_admin, u.created_at,
    (SELECT COUNT(*)::int FROM match_records m WHERE m.player1_id = u.id OR m.player2_id = u.id) AS partidas
  FROM users u
  ORDER BY u.created_at ASC;
`);

const reales = q.rows.filter((r) => !ES_RUIDO.test(r.username));
const ruido = q.rows.filter((r) => ES_RUIDO.test(r.username));

console.log(`\n=== CUENTAS REALES (${reales.length}) ===\n`);
console.log('  USUARIO              EMAIL                          SALDO  PARTIDAS  CREADO');
for (const u of reales) {
  console.log(
    `  ${String(u.username).padEnd(20)} ${String(u.email).padEnd(30)} $${Number(u.wallet_balance).toFixed(2).padStart(7)}  ${String(u.partidas).padStart(6)}    ${String(u.created_at).slice(0, 16)}`
  );
}

console.log(`\n  Generadas por suites de prueba / motor de duelos: ${ruido.length}`);
console.log(`  TOTAL en la base de datos: ${q.rows.length}\n`);

await pool.end();
