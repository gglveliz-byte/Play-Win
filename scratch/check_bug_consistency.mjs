/**
 * Verificador de consistencia del registro de bugs.
 * Extrae el estado real de cada entrada de AUDITORIA_BUGS.md y valida la aritmética.
 */
import fs from 'node:fs';

const raw = fs.readFileSync('AUDITORIA_BUGS.md', 'utf8');

const abiertos = [];
const parciales = [];
const resueltos = [];
const faltantes = [];

for (let n = 1; n <= 45; n++) {
  const id = `BUG-${String(n).padStart(3, '0')}`;
  // Los encabezados varían en nivel (### o ####) y pueden llevar un emoji de
  // severidad delante, así que se busca el id como encabezado, no el prefijo.
  const reEncabezado = new RegExp(`^#{3,4}\\s*(?:[^\\w\\s]+\\s*)?${id}\\b`, 'm');
  const match = raw.match(reEncabezado);
  if (!match) {
    faltantes.push(id);
    continue;
  }
  const idx = match.index;
  const tramo = raw.slice(idx, idx + 700);
  const m = tramo.match(/\|\s*\*\*Estado\*\*\s*\|\s*([^\n|]+)/);
  const estado = m ? m[1].trim() : '(SIN FILA DE ESTADO)';

  // Se clasifica por MARCADOR (❌ / ⚠️ / ✅), no por texto: un estado como
  // "ABIERTO (documentado como resuelto en la bitácora)" contiene la palabra
  // "resuelto" pero sigue abierto.
  if (estado.includes('✅')) resueltos.push({ id, estado });
  else if (estado.includes('⚠️')) parciales.push({ id, estado });
  else if (estado.includes('❌')) abiertos.push({ id, estado });
  else faltantes.push(id);
}

console.log('=== ENTRADAS DETECTADAS ===\n');
console.log(`ABIERTOS (${abiertos.length}):`);
for (const b of abiertos) console.log(`  ${b.id}  ${b.estado}`);
console.log(`\nPARCIALES (${parciales.length}):`);
for (const b of parciales) console.log(`  ${b.id}  ${b.estado}`);
console.log(`\nRESUELTOS (${resueltos.length}):`);
for (const b of resueltos) console.log(`  ${b.id}  ${b.estado}`);
console.log(`\nSIN SECCIÓN O SIN ESTADO (${faltantes.length}): ${faltantes.join(', ')}`);

const total = abiertos.length + parciales.length + resueltos.length;
console.log(`\n${'='.repeat(60)}`);
console.log(`TOTAL CATALOGADO : ${total}`);
console.log(`  Abiertos       : ${abiertos.length}`);
console.log(`  Parciales      : ${parciales.length}`);
console.log(`  Resueltos      : ${resueltos.length}`);
console.log(`${'='.repeat(60)}`);

// Formato A (resumen con resueltos primero):
//   "**24 bugs catalogados = 22 resueltos · 2 abiertos · 0 parciales.**"
const formatoA = raw.match(
  /\*\*(\d+) bugs catalogados\s*=\s*(\d+) resueltos\s*·\s*(\d+) abiertos?\s*·\s*(\d+) parciales?\.\*\*/
);
// Formato B (resumen desglosado por severidad):
//   "**21 bugs catalogados** = **13 abiertos** + **2 parciales** + **6 resueltos**"
const formatoB = raw.match(
  /\*\*(\d+) bugs catalogados\*\*\s*=\s*\*\*(\d+) abiertos\*\*\s*\+\s*\*\*(\d+) parciales\*\*\s*\+\s*\*\*(\d+) resueltos\*\*/
);

if (formatoA) {
  // Grupos: 1=total, 2=resueltos, 3=abiertos, 4=parciales
  const dTotal = Number(formatoA[1]);
  const dResueltos = Number(formatoA[2]);
  const dAbiertos = Number(formatoA[3]);
  const dParciales = Number(formatoA[4]);
  console.log(`\nLa tabla declara: ${dTotal} = ${dResueltos} resueltos · ${dAbiertos} abiertos · ${dParciales} parciales`);
  console.log(`Realidad        : ${total} = ${resueltos.length} resueltos · ${abiertos.length} abiertos · ${parciales.length} parciales`);
  const ok =
    dTotal === total &&
    dResueltos === resueltos.length &&
    dAbiertos === abiertos.length &&
    dParciales === parciales.length;
  console.log(ok ? '\n✅ CONTEO CONSISTENTE' : '\n❌ INCONSISTENCIA entre la tabla y las entradas');
  process.exit(ok ? 0 : 1);
}

if (formatoB) {
  // Grupos: 1=total, 2=abiertos, 3=parciales, 4=resueltos
  const dTotal = Number(formatoB[1]);
  const dAbiertos = Number(formatoB[2]);
  const dParciales = Number(formatoB[3]);
  const dResueltos = Number(formatoB[4]);
  console.log(`\nLa tabla declara: ${dTotal} = ${dAbiertos} abiertos + ${dParciales} parciales + ${dResueltos} resueltos`);
  console.log(`Realidad        : ${total} = ${abiertos.length} abiertos + ${parciales.length} parciales + ${resueltos.length} resueltos`);
  const ok =
    dTotal === total &&
    dAbiertos === abiertos.length &&
    dParciales === parciales.length &&
    dResueltos === resueltos.length;
  console.log(ok ? '\n✅ CONTEO CONSISTENTE' : '\n❌ INCONSISTENCIA entre la tabla y las entradas');
  process.exit(ok ? 0 : 1);
}

console.log('\n⚠️  No se encontró una frase de resumen reconocible.');
process.exit(2);
