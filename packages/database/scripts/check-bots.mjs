/**
 * ¿Son los rivales de división cuentas de la base de datos, o personas?
 * Solo lectura.
 */
import pg from 'pg';

const BOTS = ['carlos_pro', 'alex_pro', 'novato_esports', 'valkyria_99', 'titan_speed'];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const res = await pool.query(
  `SELECT u.username, u.email, u.password_hash, u.created_at,
     (SELECT COUNT(*)::int FROM game_passports p WHERE p.user_id = u.id) AS pasaportes,
     (SELECT COUNT(*)::int FROM league_members m WHERE m.user_id = u.id) AS ligas,
     (SELECT COUNT(*)::int FROM match_records r WHERE r.player1_id = u.id OR r.player2_id = u.id) AS partidas
   FROM users u WHERE u.username = ANY($1) ORDER BY u.username;`,
  [BOTS]
);

console.log('\n=== ¿SON BOTS O PERSONAS? ===\n');
console.log('  USUARIO            CONTRASEÑA                       PASAP  LIGAS  PARTIDAS  CREADO');
for (const u of res.rows) {
  const esMotor = u.password_hash === 'ephemeral_guest_token_hash';
  console.log(
    `  ${String(u.username).padEnd(18)} ${String(esMotor ? 'SIN CONTRASEÑA (creado por el motor)' : u.password_hash.slice(0, 24) + '…').padEnd(32)} ${String(u.pasaportes).padStart(5)} ${String(u.ligas).padStart(6)} ${String(u.partidas).padStart(9)}  ${String(u.created_at).slice(0, 16)}`
  );
}

const bots = res.rows.filter((u) => u.password_hash === 'ephemeral_guest_token_hash');
const personas = res.rows.filter((u) => u.password_hash !== 'ephemeral_guest_token_hash');
console.log(`\n  Creadas por el motor de duelos (sin contraseña): ${bots.length}`);
console.log(`  Con contraseña (se registraron de verdad):       ${personas.length}`);
if (personas.length > 0) {
  for (const p of personas) console.log(`     → ${p.username} <${p.email}> · pasaportes: ${p.pasaportes} · partidas: ${p.partidas}`);
}
console.log('');

await pool.end();
