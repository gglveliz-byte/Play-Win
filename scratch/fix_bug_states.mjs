/**
 * Fija el estado de cada entrada de bug de forma determinista.
 * Evita reemplazos masivos que corrompen el conteo.
 */
import fs from 'node:fs';

const FILE = 'AUDITORIA_BUGS.md';

/** Estado final de cada bug. */
const ESTADOS = {
  'BUG-001': 'resuelto',
  'BUG-002': 'resuelto',
  'BUG-003': 'abierto',
  'BUG-004': 'resuelto',
  'BUG-005': 'resuelto',
  'BUG-006': 'resuelto',
  'BUG-007': 'resuelto',
  'BUG-008': 'abierto',
  'BUG-009': 'abierto',
  'BUG-010': 'resuelto',
  'BUG-011': 'parcial',
  'BUG-012': 'resuelto',
  'BUG-013': 'resuelto',
  'BUG-014': 'abierto',
  'BUG-015': 'parcial',
  'BUG-016': 'resuelto',
  'BUG-017': 'resuelto',
  'BUG-018': 'resuelto',
  'BUG-019': 'abierto',
  'BUG-020': 'abierto',
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
  // Limita la búsqueda al bloque de esta entrada (hasta el siguiente '### BUG-')
  const siguiente = raw.indexOf('\n### BUG-', idx + 4);
  const fin = siguiente < 0 ? raw.length : siguiente;
  const bloque = raw.slice(idx, fin);

  const match = bloque.match(/\|\s*\*\*Estado\*\*\s*\|[^\n]*\|/);
  if (!match) {
    cambios.push(`${id}: SIN FILA DE ESTADO`);
    continue;
  }
  const anterior = match[0];
  if (anterior.trim() === TEXTO[estado].trim()) {
    cambios.push(`${id}: ya correcto (${estado})`);
    continue;
  }
  raw = raw.slice(0, idx) + bloque.replace(anterior, TEXTO[estado]) + raw.slice(fin);
  cambios.push(`${id}: ${estado}`);
}

fs.writeFileSync(FILE, raw);
console.log('Cambios aplicados:');
for (const c of cambios) console.log(`  ${c}`);

// Recuento final
const abiertos = (raw.match(/^\| \*\*Estado\*\* \| ❌/gm) || []).length;
const parciales = (raw.match(/^\| \*\*Estado\*\* \| ⚠️/gm) || []).length;
const resueltos = (raw.match(/^\| \*\*Estado\*\* \| ✅/gm) || []).length;
console.log(`\nRecuento final: ${abiertos} abiertos · ${parciales} parciales · ${resueltos} resueltos · total ${abiertos + parciales + resueltos}`);
