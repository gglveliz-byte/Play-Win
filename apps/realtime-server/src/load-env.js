/**
 * PLAY WIN REALTIME — CARGADOR DE VARIABLES DE ENTORNO (load-env.js)
 * ==============================================================================
 * Carga la raíz del monorepo `.env` en process.env sin dependencias externas.
 *
 * ¿Por qué existe? El servidor de duelos leía JWT_SECRET con un valor por
 * defecto quemado en el código (BUG-002). Al eliminar ese fallback, el proceso
 * necesita una fuente real de configuración. Node no carga `.env`
 * automáticamente y el paquete `dotenv` no está instalado, así que este módulo
 * hace el trabajo en 20 líneas.
 *
 * REGLA: este módulo debe importarse ANTES que cualquier módulo que lea
 * process.env (ver src/server.js).
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Ruta del `.env` en la raíz del monorepo: apps/realtime-server/src → ../../../.env */
const ROOT_ENV_PATH = path.resolve(HERE, '../../../.env');

/**
 * Parsea un archivo .env y vuelca sus claves en process.env.
 * No sobreescribe variables ya presentes en el entorno real (el entorno del
 * sistema siempre gana, igual que hace dotenv por defecto).
 */
function loadEnvFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { loaded: false, path: filePath, count: 0 };
  }

  let count = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = line.slice(separatorIndex + 1).trim();

    // Quitar comillas envolventes (simples o dobles)
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
      count++;
    }
  }

  return { loaded: true, path: filePath, count };
}

const result = loadEnvFile(ROOT_ENV_PATH);

if (!result.loaded) {
  console.warn(
    `⚠️  [PlayWin Realtime] No se encontró ${ROOT_ENV_PATH}.\n` +
      '    El servidor arrancará solo si JWT_SECRET ya está en el entorno del sistema.'
  );
}

export { loadEnvFile, ROOT_ENV_PATH, result as envLoadResult };
