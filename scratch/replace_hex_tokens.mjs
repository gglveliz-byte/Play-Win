/**
 * Sustituye los colores HEX sueltos por los tokens semánticos del sistema.
 * Solo trata los colores de ESTADO (éxito, peligro, acento). El blanco de texto
 * sobre fondos oscuros se mapea a --on-dark.
 */
import fs from 'node:fs';
import path from 'node:path';

const COMPONENTS = 'apps/hub/src/components';

/** Mapa de reemplazo: valor literal → token. */
const REEMPLAZOS = [
  // Verdes de éxito (había cuatro tonos distintos en el código)
  ["'#1b8a36'", "'var(--success)'"],
  ["'#22c55e'", "'var(--success)'"],
  ["'#16a34a'", "'var(--success)'"],
  ["'#059669'", "'var(--success)'"],
  // Rojos de peligro
  ["'#dc2626'", "'var(--danger)'"],
  ["'#ef4444'", "'var(--danger)'"],
  // Naranja claro legible sobre oscuro (estaba fuera de la paleta)
  ["'#ffb366'", "'var(--accent-on-dark)'"],
  // Blanco de texto sobre superficies oscuras o de color
  ["'#fff'", "'var(--on-dark)'"],
  ["'#ffffff'", "'var(--on-dark)'"],
];

const archivos = fs.readdirSync(COMPONENTS).filter((f) => f.endsWith('.tsx'));
let totalCambios = 0;

for (const archivo of archivos) {
  const ruta = path.join(COMPONENTS, archivo);
  let contenido = fs.readFileSync(ruta, 'utf8');
  let cambios = 0;

  for (const [de, a] of REEMPLAZOS) {
    const antes = contenido;
    contenido = contenido.split(de).join(a);
    if (contenido !== antes) {
      cambios += (antes.match(new RegExp(de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    }
  }

  if (cambios > 0) {
    fs.writeFileSync(ruta, contenido);
    console.log(`  ${archivo.padEnd(26)} ${cambios} reemplazo(s)`);
    totalCambios += cambios;
  }
}

console.log(`\nTotal: ${totalCambios} colores sustituidos por tokens.`);

// Verificación: no deben quedar HEX de estado
const restantes = [];
for (const archivo of archivos) {
  const contenido = fs.readFileSync(path.join(COMPONENTS, archivo), 'utf8');
  const matches = contenido.match(/#(ef4444|1b8a36|ffb366|059669|22c55e|16a34a|dc2626|ffffff|fff)\b/g);
  if (matches) restantes.push(`${archivo}: ${[...new Set(matches)].join(', ')}`);
}
console.log(restantes.length === 0 ? '\n✅ No quedan HEX de estado en los componentes' : `\n❌ Restantes:\n  ${restantes.join('\n  ')}`);
