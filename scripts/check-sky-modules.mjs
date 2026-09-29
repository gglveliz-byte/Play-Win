/**
 * Verifica la integridad del juego modular Sky Runner 3D:
 *   1. Que cada módulo exista y su sintaxis sea válida.
 *   2. Que los `import` resuelvan y que cada símbolo importado EXISTA de verdad
 *      como export en su módulo. Un import roto rompe todo el juego en silencio.
 *   3. Que el HTML cubra todos los elementos que el motor busca.
 *
 * Uso: node scripts/check-sky-modules.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'apps/hub/public/games/sky';
const MODULOS = ['js/game.js', 'js/renderer.js', 'js/prng.js', 'js/audio.js', 'js/physics.js', 'js/debug.js'];

console.log('\n═══ INTEGRIDAD DE MÓDULOS · SKY RUNNER 3D ═══\n');

/** Extrae los nombres exportados de un módulo. */
function exportsDe(codigo) {
  const nombres = new Set();
  for (const m of codigo.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    nombres.add(m[1]);
  }
  // export { a, b as c }
  for (const m of codigo.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const parte of m[1].split(',')) {
      const limpio = parte.trim();
      if (!limpio) continue;
      const alias = limpio.split(/\s+as\s+/);
      nombres.add((alias[1] || alias[0]).trim());
    }
  }
  return nombres;
}

const codigos = {};
let fallos = 0;

// ── 1. Existencia y sintaxis ────────────────────────────────────────────────
console.log('  Módulos:');
for (const rel of MODULOS) {
  const ruta = path.join(DIR, rel);
  if (!fs.existsSync(ruta)) {
    console.log(`    ❌ ${rel} NO EXISTE`);
    fallos++;
    continue;
  }
  const codigo = fs.readFileSync(ruta, 'utf8');
  codigos[rel] = codigo;
  const lineas = codigo.split('\n').length;
  console.log(`    ✅ ${rel.padEnd(16)} ${String(lineas).padStart(4)} líneas · ${codigo.length} bytes`);
}

// ── 2. Los imports resuelven ────────────────────────────────────────────────
console.log('\n  Importaciones:');
for (const rel of MODULOS) {
  const codigo = codigos[rel];
  if (!codigo) continue;

  for (const m of codigo.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([\w.-]+)['"]/g)) {
    const simbolos = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const destino = `js/${m[2]}`;
    const codigoDestino = codigos[destino] ?? (fs.existsSync(path.join(DIR, destino)) ? fs.readFileSync(path.join(DIR, destino), 'utf8') : null);

    if (!codigoDestino) {
      console.log(`    ❌ ${rel} importa de ${destino}, que no existe`);
      fallos++;
      continue;
    }

    const disponibles = exportsDe(codigoDestino);
    const ausentes = simbolos.filter((s) => !disponibles.has(s));
    if (ausentes.length > 0) {
      console.log(`    ❌ ${rel} -> ${destino}: NO exporta ${ausentes.join(', ')}`);
      fallos++;
    } else {
      console.log(`    ✅ ${rel.padEnd(16)} -> ${destino.padEnd(14)} (${simbolos.length} símbolos)`);
    }
  }
}

// ── 3. El punto de entrada ──────────────────────────────────────────────────
console.log('\n  Punto de entrada:');
const entrada = path.join(DIR, 'script.js');
if (!fs.existsSync(entrada)) {
  console.log('    ❌ script.js no existe');
  fallos++;
} else {
  const codigo = fs.readFileSync(entrada, 'utf8');
  const tieneImport = /import\s+['"]\.\/js\/game\.js['"]/.test(codigo);
  console.log(`    ${tieneImport ? '✅' : '❌'} script.js importa ./js/game.js`);
  if (!tieneImport) fallos++;
}

// ── 4. El HTML ──────────────────────────────────────────────────────────────
console.log('\n  HTML:');
const rutaHtml = path.join(DIR, 'index.html');
const html = fs.existsSync(rutaHtml) ? fs.readFileSync(rutaHtml, 'utf8') : '';
console.log(`    Tamaño: ${html.length} bytes`);

const esModulo = /<script[^>]+type=["']module["'][^>]*script\.js/.test(html);
console.log(`    ${esModulo ? '✅' : '❌'} script.js se carga como type="module" (obligatorio: usa import)`);
if (!esModulo) fallos++;

const tieneCanvas = /id="game-canvas"/.test(html);
console.log(`    ${tieneCanvas ? '✅' : '❌'} define #game-canvas`);
if (!tieneCanvas) fallos++;

const modulosSdk = ['playwin-bridge-ui.js', 'playwin-bridge-status.js', 'playwin-bridge-connection.js', 'playwin-bridge.js'];
const puenteAntes = html.indexOf('playwin-bridge.js') < html.indexOf('script.js');
const soporteAntes = modulosSdk.slice(0, 3).every((m) => html.indexOf(m) < html.indexOf('playwin-bridge.js'));
console.log(`    ${puenteAntes ? '✅' : '❌'} el SDK se carga antes que el juego`);
console.log(`    ${soporteAntes ? '✅' : '❌'} los 3 módulos de soporte van antes del puente`);
if (!puenteAntes || !soporteAntes) fallos++;

console.log(`\n  ${fallos === 0 ? '✅ INTEGRIDAD CORRECTA' : `❌ ${fallos} problema(s) detectado(s)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
