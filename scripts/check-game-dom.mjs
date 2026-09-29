/**
 * Comprueba que el HTML de un juego define todos los elementos que su motor
 * busca por id. Un id ausente no siempre rompe el juego, pero deja pantallas que
 * nunca aparecen o botones muertos — el fallo más difícil de diagnosticar.
 *
 * Uso: node scripts/check-game-dom.mjs [juego]
 */
import fs from 'node:fs';

const JUEGO = process.argv[2] || 'space';
const HUB = 'http://localhost:3000';

/**
 * Elementos que el motor busca pero que NO deben existir en partidas 1v1.
 * Se listan aquí para que la comprobación siga siendo estricta con el resto.
 */
const AUSENCIAS_INTENCIONADAS = {
  space: {
    pause_toggle: 'El SDK prohíbe la pausa local en partida (regla Zero Pause Trust)',
    btn_restart_pause: 'Con árbitro del servidor no reinicia nada: sería un botón muerto',
  },
};

const RUTA_HTML = `apps/hub/public/games/${JUEGO}/index.html`;
const RUTA_MOTOR = `apps/hub/public/games/${JUEGO}/script.js`;
const intencionados = AUSENCIAS_INTENCIONADAS[JUEGO] || {};

console.log(`\n═══ ${JUEGO.toUpperCase()} ═══\n`);

const bytesDisco = fs.existsSync(RUTA_HTML) ? fs.statSync(RUTA_HTML).size : -1;
const htmlDisco = bytesDisco > 0 ? fs.readFileSync(RUTA_HTML, 'utf8') : '';
console.log(`  Archivo en disco   : ${bytesDisco} bytes`);

let htmlServido = '';
try {
  const r = await fetch(`${HUB}/games/${JUEGO}/index.html`, { signal: AbortSignal.timeout(8000) });
  htmlServido = await r.text();
  console.log(`  Servido por el Hub : HTTP ${r.status} · ${htmlServido.length} bytes`);
} catch (err) {
  console.log(`  Servido por el Hub : ❌ ${err.message}`);
}

const html = htmlServido.length > htmlDisco.length ? htmlServido : htmlDisco;
console.log(`  Analizando el de mayor tamaño (${htmlServido.length > htmlDisco.length ? 'SERVIDO' : 'DISCO'})`);

if (!fs.existsSync(RUTA_MOTOR)) {
  console.log(`\n  ❌ No existe el motor ${RUTA_MOTOR}`);
  process.exit(1);
}

const motor = fs.readFileSync(RUTA_MOTOR, 'utf8');
const idsMotor = [...new Set([...motor.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))];
const idsHtml = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))];

const faltan = idsMotor.filter((id) => !idsHtml.includes(id));
const faltanReales = faltan.filter((id) => !intencionados[id]);
const omitidosAdrede = faltan.filter((id) => intencionados[id]);

console.log(`\n  El motor busca ${idsMotor.length} elementos · el HTML define ${idsHtml.length}`);
console.log(`  ${faltanReales.length === 0 ? '✅' : '❌'} Ausentes sin justificar: ${faltanReales.length}`);
for (const id of faltanReales) console.log(`      · ${id}`);

if (omitidosAdrede.length > 0) {
  console.log(`\n  Omitidos a propósito (${omitidosAdrede.length}):`);
  for (const id of omitidosAdrede) console.log(`      · ${id} — ${intencionados[id]}`);
}

const canvas = /<canvas/i.test(html);
console.log(`\n  <canvas>: ${canvas ? '✅ presente' : '❌ AUSENTE'}`);

console.log('  Pantallas de fin de partida:');
for (const id of ['screen_gameover', 'pw-screen-result']) {
  console.log(`    ${idsHtml.includes(id) ? '✅' : '— '} ${id}`);
}

const todoOk = faltanReales.length === 0 && canvas;
console.log(`\n  ${todoOk ? '✅ El HTML cubre el contrato del motor' : '❌ Faltan elementos'}\n`);
// Marcar el código sin forzar process.exit(): cerrar a lo bruto con descriptores
// abiertos provoca un fallo de libuv en Windows.
process.exitCode = todoOk ? 0 : 1;
