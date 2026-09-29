/** Fija el estado final tras el Hito C.3: los 3 bugs abiertos quedan resueltos. */
import fs from 'node:fs';

const FILE = 'AUDITORIA_BUGS.md';
const ESTADOS = {
  'BUG-022': 'resuelto',
  'BUG-024': 'resuelto',
  'BUG-025': 'resuelto',
};
const TEXTO = {
  resuelto: '| **Estado** | ✅ **RESUELTO** el 2026-09-29 |',
  abierto: '| **Estado** | ❌ **ABIERTO** |',
};

let raw = fs.readFileSync(FILE, 'utf8');
const cambios = [];

for (const [id, estado] of Object.entries(ESTADOS)) {
  const re = new RegExp(`^#{3,4}\\s*(?:[^\\w\\s]+\\s*)?${id}\\b`, 'm');
  const m = raw.match(re);
  if (!m) {
    cambios.push(`${id}: SECCIÓN NO ENCONTRADA`);
    continue;
  }
  const idx = m.index;
  const siguiente = raw.slice(idx + 4).search(/^#{3,4}\s*(?:[^\w\s]+\s*)?BUG-\d{3}\b/m);
  const fin = siguiente < 0 ? raw.length : idx + 4 + siguiente;
  const bloque = raw.slice(idx, fin);

  const fila = bloque.match(/\|\s*\*\*Estado\*\*\s*\|[^\n]*\|/);
  if (!fila) {
    cambios.push(`${id}: SIN FILA DE ESTADO`);
    continue;
  }
  if (fila[0].trim() === TEXTO[estado].trim()) continue;
  raw = raw.slice(0, idx) + bloque.replace(fila[0], TEXTO[estado]) + raw.slice(fin);
  cambios.push(`${id} → ${estado}`);
}

fs.writeFileSync(FILE, raw);
console.log(cambios.length ? `Actualizados: ${cambios.join(', ')}` : 'Sin cambios');

const abiertos = (raw.match(/^\| \*\*Estado\*\* \| ❌/gm) || []).length;
const parciales = (raw.match(/^\| \*\*Estado\*\* \| ⚠️/gm) || []).length;
const resueltos = (raw.match(/^\| \*\*Estado\*\* \| ✅/gm) || []).length;
console.log(`Recuento: ${abiertos} abiertos · ${parciales} parciales · ${resueltos} resueltos · total ${abiertos + parciales + resueltos}`);
