/**
 * Inserta los scripts de soporte del SDK (UI, conexión, estado) ANTES del bridge
 * en cada juego, y los sincroniza con la copia que sirve el Hub.
 *
 * Orden obligatorio:
 *   playwin-bridge-ui.js         -> markup de las pantallas
 *   playwin-bridge-status.js     -> avisos e pantalla de indisponibilidad
 *   playwin-bridge-connection.js -> ciclo de vida del WebSocket
 *   playwin-bridge.js            -> lógica del SDK (usa los tres anteriores)
 */
import fs from 'node:fs';
import path from 'node:path';

const JUEGOS = ['carreras', 'flapy-flapy', 'space', 'sky'];
const SOPORTE = ['playwin-bridge-ui.js', 'playwin-bridge-status.js', 'playwin-bridge-connection.js'];
const BRIDGE = 'playwin-bridge.js';
const TAG_BRIDGE = `<script src="/game-sdk/${BRIDGE}"></script>`;

let juegosTocados = 0;
let ficherosCopiados = 0;

// ── 1. Sincronizar los ficheros del SDK a la copia que sirve el Hub ──────────
const ORIGEN = 'packages/game-sdk';
const DESTINO = 'apps/hub/public/game-sdk';
for (const nombre of [...SOPORTE, BRIDGE, 'playwin-bridge.css']) {
  const desde = path.join(ORIGEN, nombre);
  if (!fs.existsSync(desde)) continue;
  fs.copyFileSync(desde, path.join(DESTINO, nombre));
  ficherosCopiados++;
  console.log(`  copiado  ${nombre}`);
}

// ── 2. Insertar los scripts de soporte antes del bridge en cada juego ────────
console.log('');
for (const juego of JUEGOS) {
  const ruta = path.join('apps/hub/public/games', juego, 'index.html');
  if (!fs.existsSync(ruta)) {
    console.log(`  ${juego.padEnd(12)} sin index.html`);
    continue;
  }

  let html = fs.readFileSync(ruta, 'utf8');

  // Quita cualquier inserción previa para no duplicar en ejecuciones repetidas.
  html = html.replace(/[ \t]*<script src="\/game-sdk\/playwin-bridge-(ui|status|connection)\.js"><\/script>\r?\n?/g, '');

  if (!html.includes(TAG_BRIDGE)) {
    console.log(`  ${juego.padEnd(12)} ❌ no carga el bridge, revisar a mano`);
    continue;
  }

  const etiquetas = SOPORTE.map((n) => `<script src="/game-sdk/${n}"></script>`).join('\n  ');
  html = html.replace(TAG_BRIDGE, `${etiquetas}\n  ${TAG_BRIDGE}`);
  fs.writeFileSync(ruta, html);
  console.log(`  ${juego.padEnd(12)} ✅ 3 scripts de soporte insertados`);
  juegosTocados++;
}

console.log(`\nFicheros sincronizados: ${ficherosCopiados} · Juegos actualizados: ${juegosTocados}`);
