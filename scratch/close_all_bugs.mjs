/**
 * Fija el estado final de cada bug tras el bloque 3 (motor, datos y acabado).
 */
import fs from 'node:fs';

const FILE = 'AUDITORIA_BUGS.md';

const ESTADOS = {
  'BUG-001': 'resuelto',
  'BUG-002': 'resuelto',
  'BUG-003': 'resuelto',
  'BUG-004': 'resuelto',
  'BUG-005': 'resuelto',
  'BUG-006': 'resuelto',
  'BUG-007': 'resuelto',
  'BUG-008': 'resuelto',
  'BUG-009': 'resuelto',
  'BUG-010': 'resuelto',
  'BUG-011': 'resuelto',
  'BUG-012': 'resuelto',
  'BUG-013': 'resuelto',
  'BUG-014': 'resuelto',
  'BUG-015': 'resuelto',
  'BUG-016': 'resuelto',
  'BUG-017': 'resuelto',
  'BUG-018': 'resuelto',
  'BUG-019': 'resuelto',
  'BUG-020': 'resuelto',
  'BUG-021': 'resuelto',
};

const TEXTO = {
  resuelto: '| **Estado** | ✅ **RESUELTO** el 2026-09-29 |',
  abierto: '| **Estado** | ❌ ABIERTO |',
  parcial: '| **Estado** | ⚠️ PARCIAL |',
};

let raw = fs.readFileSync(FILE, 'utf8');
const cambios = [];

for (const [id, estado] of Object.entries(ESTADOS)) {
  const idx = raw.indexOf(`### ${id}`);
  if (idx < 0) {
    cambios.push(`${id}: SECCIÓN NO ENCONTRADA`);
    continue;
  }
  const siguiente = raw.indexOf('\n### BUG-', idx + 4);
  const fin = siguiente < 0 ? raw.length : siguiente;
  const bloque = raw.slice(idx, fin);

  const match = bloque.match(/\|\s*\*\*Estado\*\*\s*\|[^\n]*\|/);
  if (!match) {
    cambios.push(`${id}: SIN FILA DE ESTADO`);
    continue;
  }
  if (match[0].trim() === TEXTO[estado]) continue;
  raw = raw.slice(0, idx) + bloque.replace(match[0], TEXTO[estado]) + raw.slice(fin);
  cambios.push(`${id} → ${estado}`);
}

fs.writeFileSync(FILE, raw);
console.log(cambios.length ? `Actualizados: ${cambios.join(', ')}` : 'Sin cambios necesarios');

const abiertos = (raw.match(/^\| \*\*Estado\*\* \| ❌/gm) || []).length;
const parciales = (raw.match(/^\| \*\*Estado\*\* \| ⚠️/gm) || []).length;
const resueltos = (raw.match(/^\| \*\*Estado\*\* \| ✅/gm) || []).length;
console.log(`\nRecuento: ${abiertos} abiertos · ${parciales} parciales · ${resueltos} resueltos · total ${abiertos + parciales + resueltos}`);
