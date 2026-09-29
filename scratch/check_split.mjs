/**
 * Valida que la división en dos partes cubra TODOS los bugs no resueltos,
 * sin duplicados ni omisiones.
 */
import fs from 'node:fs';

const raw = fs.readFileSync('AUDITORIA_BUGS.md', 'utf8');
const plan = fs.readFileSync('PLAN_DIVISION_BUGS.md', 'utf8');
const briefA = fs.readFileSync('BRIEF_PARTE_A.md', 'utf8');
const briefB = fs.readFileSync('BRIEF_PARTE_B.md', 'utf8');

// 1. Estado real de cada bug (por marcador)
const abiertos = [];
const parciales = [];
const resueltos = [];
for (let n = 1; n <= 25; n++) {
  const id = `BUG-${String(n).padStart(3, '0')}`;
  const idx = raw.indexOf(`### ${id}`);
  if (idx < 0) continue;
  const tramo = raw.slice(idx, idx + 700);
  const m = tramo.match(/\|\s*\*\*Estado\*\*\s*\|\s*([^\n|]+)/);
  const estado = m ? m[1].trim() : '';
  if (estado.includes('✅')) resueltos.push(id);
  else if (estado.includes('⚠️')) parciales.push(id);
  else abiertos.push(id);
}

const pendientes = [...abiertos, ...parciales];

// 2. Bugs listados en cada brief (sección "Tus bugs:")
function bugsEnBrief(texto) {
  const m = texto.match(/\*\*Tus bugs:\*\*\s*([^\n]+)/);
  if (!m) return [];
  return (m[1].match(/BUG-\d{3}/g) || []);
}

const enA = bugsEnBrief(briefA);
const enB = bugsEnBrief(briefB);

console.log('=== ESTADO REAL (desde AUDITORIA_BUGS.md) ===');
console.log(`  Resueltos  (${resueltos.length}): ${resueltos.join(', ')}`);
console.log(`  Abiertos   (${abiertos.length}): ${abiertos.join(', ')}`);
console.log(`  Parciales  (${parciales.length}): ${parciales.join(', ')}`);
console.log(`  PENDIENTES (${pendientes.length}): ${pendientes.join(', ')}`);

console.log('\n=== REPARTO DECLARADO EN LOS BRIEFS ===');
console.log(`  Parte A (${enA.length}): ${enA.join(', ')}`);
console.log(`  Parte B (${enB.length}): ${enB.join(', ')}`);

// 3. Validaciones
const todos = [...enA, ...enB];
const dupA = enA.filter((x, i) => enA.indexOf(x) !== i);
const dupB = enB.filter((x, i) => enB.indexOf(x) !== i);
const solapados = enA.filter((x) => enB.includes(x));
const omitidos = pendientes.filter((p) => !todos.includes(p));
const sobrantes = todos.filter((t) => !pendientes.includes(t));

console.log('\n=== VALIDACIONES ===');
const checks = [
  ['Sin duplicados dentro de A', dupA.length === 0, dupA.join(', ')],
  ['Sin duplicados dentro de B', dupB.length === 0, dupB.join(', ')],
  ['Sin solapamiento A↔B', solapados.length === 0, solapados.join(', ')],
  ['Ningún bug pendiente omitido', omitidos.length === 0, omitidos.join(', ')],
  ['Ningún bug resuelto reasignado', sobrantes.length === 0, sobrantes.join(', ')],
  ['Total repartido = pendientes', todos.length === pendientes.length, `${todos.length} vs ${pendientes.length}`],
  ['El plan menciona ambas partes', plan.includes('PARTE A') && plan.includes('PARTE B'), ''],
];

let allOk = true;
for (const [nombre, ok, detalle] of checks) {
  if (!ok) allOk = false;
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ` → ${detalle}` : ''}`);
}

// 4. El plan debe listar los mismos bugs que los briefs
const planA = (plan.match(/PARTE A[\s\S]*?(?=## 📦 PARTE B)/)?.[0].match(/BUG-\d{3}/g) || []);
const planB = (plan.match(/PARTE B[\s\S]*?(?=## 📐)/)?.[0].match(/BUG-\d{3}/g) || []);
const planAUniq = [...new Set(planA)];
const planBUniq = [...new Set(planB)];
const planCoherente =
  planAUniq.length === enA.length && planBUniq.length === enB.length &&
  planAUniq.every((x) => enA.includes(x)) && planBUniq.every((x) => enB.includes(x));
console.log(`  ${planCoherente ? '✅' : '❌'} El plan coincide con los briefs`);
if (!planCoherente) {
  allOk = false;
  console.log(`       Plan A: ${planAUniq.join(', ')}`);
  console.log(`       Plan B: ${planBUniq.join(', ')}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(allOk ? '✅ DIVISIÓN VÁLIDA Y COMPLETA' : '❌ LA DIVISIÓN TIENE PROBLEMAS');
console.log('='.repeat(60));
process.exit(allOk ? 0 : 1);
