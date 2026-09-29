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

for (let n = 1; n <= 25; n++) {
  const id = `BUG-${String(n).padStart(3, '0')}`;
  const idx = raw.indexOf(`### ${id}`);
  if (idx < 0) {
    faltantes.push(id);
    continue;
  }
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

// Validar contra lo que declara la tabla resumen del documento.
// Acepta dos formatos: el detallado (abiertos + parciales + resueltos) y el de
// cierre final (solo resueltos cuando ya no queda nada pendiente).
const detallado = raw.match(
  /\*\*(\d+) bugs catalogados\*\*\s*=\s*\*\*(\d+) abiertos\*\*\s*\+\s*\*\*(\d+) parciales\*\*\s*\+\s*\*\*(\d+) resueltos\*\*/
);
const cerrado = raw.match(/\*\*(\d+) bugs catalogados\s*=\s*(\d+) resueltos\s*·\s*(\d+) abiertos\s*·\s*(\d+) parciales\.\*\*/);

if (detallado) {
  const [, dTotal, dAbiertos, dParciales, dResueltos] = detallado.map(Number);
  console.log(`\nLa tabla declara: ${dTotal} = ${dAbiertos} abiertos + ${dParciales} parciales + ${dResueltos} resueltos`);
  console.log(`Realidad        : ${total} = ${abiertos.length} abiertos + ${parciales.length} parciales + ${resueltos.length} resueltos`);
  const ok =
    dTotal === total &&
    dAbiertos === abiertos.length &&
    dParciales === parciales.length &&
    dResueltos === resueltos.length;
  console.log(ok ? '\n✅ CONTEO CONSISTENTE' : '\n❌ INCONSISTENCIA');
  process.exit(ok ? 0 : 1);
}

if (cerrado) {
  const [, dTotal, dResueltos, dAbiertos, dParciales] = cerrado.map(Number);
  console.log(`\nLa tabla declara: ${dTotal} catalogados = ${dResueltos} resueltos · ${dAbiertos} abiertos · ${dParciales} parciales`);
  console.log(`Realidad        : ${total} catalogados = ${resueltos.length} resueltos · ${abiertos.length} abiertos · ${parciales.length} parciales`);
  const ok =
    dTotal === total &&
    dResueltos === resueltos.length &&
    dAbiertos === abiertos.length &&
    dParciales === parciales.length;
  console.log(ok ? '\n✅ CONTEO CONSISTENTE' : '\n❌ INCONSISTENCIA');
  process.exit(ok ? 0 : 1);
}

console.log('\n⚠️  No se encontró una frase de resumen reconocible.');
process.exit(2);
