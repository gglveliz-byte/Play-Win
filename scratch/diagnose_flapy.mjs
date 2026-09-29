/** Diagnóstico: por qué flapy-flapy sigue marcándose como violación. */
import fs from 'node:fs';

const archivo = 'apps/hub/public/games/flapy-flapy/script.js';
const contenido = fs.readFileSync(archivo, 'utf8');
const lineas = contenido.split('\n');

const GUARDIAN = /canStartLocally/;
const ARRANQUE = /(startRace\(\)|startGame\(\))/;

// 1. Detección de nombres guardián
const nombres = new Set(['canStartLocally']);
for (let i = 0; i < lineas.length; i++) {
  const decl = lineas[i].match(/(?:const|let|var|function)\s+(\w+)/);
  if (!decl) continue;
  const bloque = lineas.slice(i, i + 4).join('\n');
  if (GUARDIAN.test(bloque)) nombres.add(decl[1]);
}
console.log('Nombres guardián detectados:', [...nombres].join(', '));

const guardianRegex = new RegExp(`(${[...nombres].join('|')})`);

// 2. Evaluar cada arranque
console.log('\nArranques encontrados:');
for (let i = 0; i < lineas.length; i++) {
  if (!ARRANQUE.test(lineas[i])) continue;
  if (/function\s+\w*[Ss]tart/.test(lineas[i])) {
    console.log(`  L${i + 1}: (definición, ignorada)`);
    continue;
  }
  const contexto = lineas.slice(Math.max(0, i - 3), i).join('\n');
  const esOnMatchLive = /onMatchLive/.test(contexto);
  const tieneGuardian = guardianRegex.test(contexto);
  console.log(`  L${i + 1}: ${lineas[i].trim().slice(0, 60)}`);
  console.log(`      onMatchLive=${esOnMatchLive}  guardián=${tieneGuardian}`);
  if (!esOnMatchLive && !tieneGuardian) {
    console.log(`      CONTEXTO:\n${contexto.split('\n').map((l) => '        ' + l).join('\n')}`);
  }
}
