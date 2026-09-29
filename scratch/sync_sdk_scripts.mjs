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

/**
 * VERSIÓN DE CACHÉ — súbela cuando cambies cualquier fichero del SDK.
 *
 * Sin esto, el navegador reutiliza la copia antigua de playwin-bridge.js y se
 * ejecuta código que ya no existe en el repositorio. Costó una sesión entera de
 * depuración descubrirlo, así que la versión va en la URL de los 4 scripts.
 */
const VERSION = '4';
const Q = `?v=${VERSION}`;
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
    console.log(`  ${juego.padEnd(12)} ⚠️  sin index.html (juego no operativo)`);
    continue;
  }

  let html = fs.readFileSync(ruta, 'utf8');

  // sky/index.html existe pero está vacío: la página no puede cargar el SDK.
  // Se avisa en lugar de fingir que se ha sincronizado.
  if (html.trim().length === 0) {
    console.log(`  ${juego.padEnd(12)} ⚠️  index.html VACÍO (0 bytes): juego no operativo`);
    continue;
  }

  // Quita cualquier inserción previa (con o sin ?v=) para no duplicar.
  html = html.replace(/[ \t]*<script src="\/game-sdk\/playwin-bridge-(ui|status|connection)\.js(\?v=[^"]*)?"><\/script>\r?\n?/g, '');

  // Quita un ?v= antiguo del bridge para reescribirlo con la versión actual.
  html = html.replace(/<script src="\/game-sdk\/playwin-bridge\.js(\?v=[^"]*)?"><\/script>/g, TAG_BRIDGE);

  if (!html.includes(TAG_BRIDGE)) {
    console.log(`  ${juego.padEnd(12)} ❌ no carga el bridge, revisar a mano`);
    continue;
  }

  const etiquetas = SOPORTE.map((n) => `<script src="/game-sdk/${n}${Q}"></script>`).join('\n  ');
  html = html.replace(TAG_BRIDGE, `${etiquetas}\n  <script src="/game-sdk/${BRIDGE}${Q}"></script>`);
  fs.writeFileSync(ruta, html);
  console.log(`  ${juego.padEnd(12)} ✅ 3 scripts de soporte + bridge con ?v=${VERSION}`);
  juegosTocados++;
}

console.log(`\nFicheros sincronizados: ${ficherosCopiados} · Juegos actualizados: ${juegosTocados}`);
