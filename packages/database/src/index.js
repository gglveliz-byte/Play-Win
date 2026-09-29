import pg from 'pg';
const { Pool } = pg;

/**
 * Cadena de conexión leída EXCLUSIVAMENTE del entorno.
 * No existe valor por defecto: un fallback silencioso a un secreto quemado en
 * el código es lo que causó el BUG-002 / BUG-021 de la auditoría.
 *
 * Al ejecutar scripts de este paquete hay que cargar el entorno:
 *   node --env-file=../../.env src/migrate.js
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    '[PlayWin Database] Falta la variable de entorno obligatoria "DATABASE_URL".\n' +
      '  → Cárgala con: node --env-file=../../.env <script>\n' +
      '  → Plantilla de referencia: .env.example'
  );
}

// Pool de conexiones de alta disponibilidad optimizado para Neon Serverless
export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Ejecuta una consulta SQL en el pool
 * @param {string} text - Consulta SQL parametrizada
 * @param {Array<any>} [params] - Parámetros
 */
export async function query(text, params = []) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    // console.log(`[DB] ${text} (${duration}ms)`);
  }
  return res;
}

/**
 * Ejecuta un bloque dentro de una transacción atómica
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
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
