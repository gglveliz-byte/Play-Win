/**
 * Sustituye el bloque de markup inline del SDK por la llamada al módulo
 * playwin-bridge-ui.js, y avisa claramente si ese módulo no está cargado.
 */
import fs from 'node:fs';

const FILE = 'packages/game-sdk/playwin-bridge.js';
const lineas = fs.readFileSync(FILE, 'utf8').split('\n');

// Localiza el inicio del bloque (la línea que asigna container.innerHTML)
const inicio = lineas.findIndex((l) => l.includes('container.innerHTML ='));
if (inicio === -1) {
  console.error('❌ No se encontró "container.innerHTML ="');
  process.exit(1);
}

// Localiza el fin: la línea que cierra el bloque y arranca el IIFE de la UI
const fin = lineas.findIndex((l, i) => i > inicio && l.trim().endsWith("'</div></div>';"));
if (fin === -1) {
  console.error('❌ No se encontró el final del bloque de markup');
  process.exit(1);
}

console.log(`Reemplazando líneas ${inicio + 1}–${fin + 1} (${fin - inicio + 1} líneas)`);

const reemplazo = [
  '    // El markup de las 5 pantallas vive en playwin-bridge-ui.js para que este',
  '    // archivo contenga solo lógica. Debe cargarse ANTES que este script.',
  '    if (typeof window.PLAYWIN_UI_MARKUP !== \'function\') {',
  '      console.error(\'[PlayWin SDK] Falta /game-sdk/playwin-bridge-ui.js: cárgalo ANTES que playwin-bridge.js\');',
  '      return;',
  '    }',
  '    container.innerHTML = window.PLAYWIN_UI_MARKUP(currentPlayer);',
];

const resultado = [...lineas.slice(0, inicio), ...reemplazo, ...lineas.slice(fin + 1)];
fs.writeFileSync(FILE, resultado.join('\n'));

console.log(`✅ Listo. Nuevas líneas: ${resultado.length} (antes: ${lineas.length})`);
