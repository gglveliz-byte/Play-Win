import pg from 'pg';
const { Pool } = pg;

/**
 * Pool de conexiones creado de forma PEREZOSA.
 *
 * ⚠️ Por qué perezoso y no al importar el módulo:
 * Este paquete exporta también CONSTANTES de negocio (divisas, premios, deltas
 * de MMR, catálogo de juegos) que consumen componentes de CLIENTE. Si la
 * validación de DATABASE_URL se ejecutara al importar, cualquier componente
 * cliente que importara una constante rompería la página, porque en el navegador
 * esa variable no existe.
 *
 * La cadena se sigue leyendo EXCLUSIVAMENTE del entorno: no hay valor por
 * defecto. Un fallback silencioso a un secreto quemado causó el BUG-002.
 * El error aparece ahora en la primera consulta real, con mensaje accionable.
 *
 * Al ejecutar scripts de este paquete hay que cargar el entorno:
 *   node --env-file=../../.env src/migrate.js
 */
let poolInstance = null;

/** Devuelve el pool, creándolo en el primer uso. */
export function getPool() {
  if (poolInstance) return poolInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      '[PlayWin Database] Falta la variable de entorno obligatoria "DATABASE_URL".\n' +
        '  → Cárgala con: node --env-file=../../.env <script>\n' +
        '  → Plantilla de referencia: .env.example'
    );
  }

  poolInstance = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return poolInstance;
}

/**
 * Acceso directo al pool, creándolo si hace falta.
 *
 * Es una FUNCIÓN a propósito: el pool se crea de forma perezosa (ver arriba),
 * así que hay que pedirlo en el momento de usarlo. Los consumidores escriben
 * `getPool().query(...)` en lugar de `pool.query(...)`.
 */

/**
 * Ejecuta una consulta SQL en el pool
 * @param {string} text - Consulta SQL parametrizada
 * @param {Array<any>} [params] - Parámetros
 */
export async function query(text, params = []) {
  const res = await getPool().query(text, params);
  return res;
}

/**
 * Ejecuta un bloque dentro de una transacción atómica
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Servicios de Negocio de Producción
export { userService } from './services/users.js';
export { passportService } from './services/passports.js';
export { matchService } from './services/matches.js';
export { leagueService } from './services/leagues.js';
export { ledgerService } from './services/ledger.js';

// Constantes de negocio compartidas (única fuente de verdad)
export {
  LEDGER_TYPES,
  LEDGER_PROVIDERS,
  LEDGER_STATUS,
  LEAGUE_PRIZE_POOL,
  PRIZE_SPLIT,
  MMR_DELTAS,
  MMR_MID_RANGE,
  MMR_LOW_RANGE,
  SEASON_POINTS,
  INITIAL_SKILL_RATING,
  RANK_TIERS,
  RANK_TIER_THRESHOLDS,
  resolveRankTier,
  GAMES,
  GAME_IDS,
  RECONNECT_GRACE_MS,
  GHOST_MATCH_TIMEOUT_MS,
} from './constants.js';
