/**
 * Inserta el script del markup de UI ANTES del bridge en cada juego.
 * Sin él, el SDK avisa y no dibuja las pantallas.
 */
import fs from 'node:fs';
import path from 'node:path';

const JUEGOS = ['carreras', 'flapy-flapy', 'space', 'sky'];
const TAG_UI = '<script src="/game-sdk/playwin-bridge-ui.js"></script>';
const TAG_BRIDGE = '<script src="/game-sdk/playwin-bridge.js"></script>';

let cambios = 0;

for (const juego of JUEGOS) {
  const ruta = path.join('apps/hub/public/games', juego, 'index.html');
  if (!fs.existsSync(ruta)) {
    console.log(`  ${juego.padEnd(12)} sin index.html, omitido`);
    continue;
  }

  let contenido = fs.readFileSync(ruta, 'utf8');

  if (contenido.includes('playwin-bridge-ui.js')) {
    console.log(`  ${juego.padEnd(12)} ya lo tiene`);
    continue;
  }

  if (!contenido.includes(TAG_BRIDGE)) {
    console.log(`  ${juego.padEnd(12)} ❌ no carga el bridge, revisar a mano`);
    continue;
  }

  // La UI debe ir justo antes del bridge.
  contenido = contenido.replace(TAG_BRIDGE, `${TAG_UI}\n  ${TAG_BRIDGE}`);
  fs.writeFileSync(ruta, contenido);
  console.log(`  ${juego.padEnd(12)} ✅ añadido`);
  cambios++;
}

console.log(`\nJuegos actualizados: ${cambios}`);
