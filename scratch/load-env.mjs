/**
 * Cargador de entorno compartido para los scripts de `scratch/`.
 * Sube desde este archivo hasta la raíz del monorepo (package.json con
 * `workspaces`) y carga el `.env` que encuentre, sin dependencias externas.
 *
 * Uso:
 *   import { env } from './load-env.mjs';
 *   const secret = env('JWT_SECRET');   // lanza si falta
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        if (JSON.parse(fs.readFileSync(candidate, 'utf8')).workspaces) return dir;
      } catch {
        /* package.json ilegible: seguir subiendo */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Candidatos en orden de prioridad.
 *
 * Se leen AMBOS entornos a propósito: las suites firman peticiones para el Hub,
 * así que necesitan el mismo WHOP_WEBHOOK_SECRET / JWT_SECRET que él usa. El
 * orden importa: lo primero que se define gana (no se sobreescribe).
 */
const CANDIDATES = [
  path.join(ROOT, '.env.test'),
  path.join(ROOT, 'apps', 'hub', '.env.local'),
  path.join(ROOT, '.env'),
];

function loadFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
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
  return true;
}

for (const candidate of CANDIDATES) loadFile(candidate);

/** Devuelve una variable obligatoria o lanza con instrucciones. */
export function env(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Falta ${name}. Configúrala en .env.test (raíz del repo). Candidatos revisados:\n  ${CANDIDATES.join('\n  ')}`
    );
  }
  return value;
}

export { ROOT, CANDIDATES };
