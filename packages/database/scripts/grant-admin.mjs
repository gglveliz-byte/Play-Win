/**
 * PLAY WIN — CONCESIÓN DE PERMISOS DE ADMINISTRADOR
 * ==============================================================================
 * El panel /admin y la API /api/admin/metrics exigen `users.is_admin = TRUE`.
 * Por seguridad NINGÚN usuario es administrador por defecto: hay que concederlo
 * explícitamente con este script.
 *
 * Uso (desde la raíz del repositorio):
 *   node --env-file=.env.test packages/database/scripts/grant-admin.mjs <usuario|email>
 *
 * Ejemplos:
 *   node --env-file=.env.test packages/database/scripts/grant-admin.mjs gglveliz
 *   node --env-file=.env.test packages/database/scripts/grant-admin.mjs admin@playwin.gg
 *
 * Para revocar:
 *   node --env-file=.env.test packages/database/scripts/grant-admin.mjs gglveliz --revoke
 * ==============================================================================
 */

import pg from 'pg';

const [, , identifier, flag] = process.argv;
const revoke = flag === '--revoke';

if (!identifier) {
  console.error(
    'Falta el identificador.\n' +
      '  Uso: node --env-file=.env.test packages/database/scripts/grant-admin.mjs <usuario|email> [--revoke]'
  );
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Carga el entorno con --env-file=.env.test');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

try {
  const res = await pool.query(
    `UPDATE users SET is_admin = $2, updated_at = NOW()
     WHERE username = $1 OR LOWER(email) = LOWER($1)
     RETURNING id, username, email, is_admin;`,
    [identifier, !revoke]
  );

  if (res.rows.length === 0) {
    console.error(`No se encontró ningún usuario con username o email "${identifier}".`);
    process.exitCode = 1;
  } else {
    const u = res.rows[0];
    console.log(
      `${revoke ? 'Permisos REVOCADOS' : 'Permisos CONCEDIDOS'} para ${u.username} <${u.email}> · is_admin = ${u.is_admin}`
    );
  }
} catch (err) {
  console.error('Error al actualizar permisos:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
