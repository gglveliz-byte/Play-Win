/**
 * Tokeniza los colores de las reglas NUEVAS de pantallas en space/style.css.
 * Solo toca lo que va después del marcador "PANTALLAS DEL MOTOR" para no alterar
 * las reglas preexistentes del motor (que están congeladas).
 */
import fs from 'node:fs';

const FICHERO = 'apps/hub/public/games/space/style.css';
const MARCA = 'PANTALLAS DEL MOTOR';

/** Color literal -> token oficial. */
const MAPA = {
  '#edecea': 'var(--on-dark)',
  '#94a3b8': 'var(--mute)',
  '#cbd5e1': 'var(--soft)',
  '#ffb703': 'var(--warning)',
  '#a8500f': 'var(--orange-2)',
  'rgba(255, 255, 255, 0.08)': 'var(--line-faint)',
  'rgba(255, 255, 255, 0.04)': 'var(--fill-faint)',
};

const contenido = fs.readFileSync(FICHERO, 'utf8');
const corte = contenido.indexOf(MARCA);
if (corte < 0) {
  console.error(`  ❌ No se encontró el marcador "${MARCA}"`);
  process.exit(1);
}

const cabeza = contenido.slice(0, corte);
let cola = contenido.slice(corte);
let total = 0;

for (const [literal, token] of Object.entries(MAPA)) {
  // split/join evita todo el infierno de escapar expresiones regulares.
  const partes = cola.split(literal);
  const n = partes.length - 1;
  if (n > 0) {
    cola = partes.join(token);
    total += n;
  }
}

fs.writeFileSync(FICHERO, cabeza + cola);
console.log(`  sustituciones por token: ${total}`);

// Verificación: no deben quedar HEX sueltos en la zona nueva.
const restantes = [...new Set(cola.match(/#[0-9a-fA-F]{3,8}/g) || [])];
console.log(restantes.length === 0 ? '  ✅ sin HEX sueltos en las reglas nuevas' : `  ⚠️  quedan: ${restantes.join(', ')}`);
