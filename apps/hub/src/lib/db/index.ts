import pg from 'pg';
import { serverConfig } from '../config';
const { Pool } = pg;

// Pool de conexiones de alta disponibilidad optimizado para Neon Serverless.
// La cadena de conexión se lee del entorno (.env.local) de forma perezosa:
// si falta DATABASE_URL, el error aparece al ejecutar la primera consulta
// con un mensaje accionable en lugar de caer a un secreto quemado.
let poolInstance: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: serverConfig.databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return poolInstance;
}

export async function query(text: string, params: any[] = []) {
  return getPool().query(text, params);
}

export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
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

// Re-exportación de servicios de producción
export { userService } from './users';
export { passportService } from './passports';
export { matchService } from './matches';
export { leagueService } from './leagues';
export { ledgerService } from './ledger';
export { settleEngine } from './settle';
