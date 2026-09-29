/**
 * Comprueba que el Hub sirve TODOS los ficheros de Sky Runner 3D y que el HTML
 * los referencia en el orden correcto. Un módulo que devuelva 404 rompe el juego
 * entero sin ningún mensaje.
 *
 * Uso: node scripts/check-sky-served.mjs
 */
const HUB = 'http://localhost:3000';
const JUEGO = 'sky';

const FICHEROS = [
  'index.html',
  'style.css',
  'script.js',
  'js/game.js',
  'js/renderer.js',
  'js/prng.js',
  'js/audio.js',
  'js/physics.js',
  'js/debug.js',
];

console.log('\n═══ SKY RUNNER 3D · FICHEROS SERVIDOS POR EL HUB ═══\n');

let fallos = 0;
for (const f of FICHEROS) {
  try {
    const r = await fetch(`${HUB}/games/${JUEGO}/${f}`, { signal: AbortSignal.timeout(8000) });
    const cuerpo = await r.text();
    const ok = r.status === 200 && cuerpo.length > 0;
    if (!ok) fallos++;
    console.log(`  ${ok ? '✅' : '❌'} ${f.padEnd(16)} HTTP ${r.status} · ${cuerpo.length} bytes`);
  } catch (err) {
    fallos++;
    console.log(`  ❌ ${f.padEnd(16)} ${err.message}`);
  }
}

// ── El HTML debe cargar el SDK y el juego en el orden correcto ──────────────
console.log('\n  Orden de carga declarado en el HTML:');
try {
  const html = await fetch(`${HUB}/games/${JUEGO}/index.html`, { signal: AbortSignal.timeout(8000) }).then((r) => r.text());

  const requisitos = [
    ['playwin-bridge-ui.js', 'módulo de pantallas del SDK'],
    ['playwin-bridge-status.js', 'módulo de avisos del SDK'],
    ['playwin-bridge-connection.js', 'módulo de conexión del SDK'],
    ['playwin-bridge.js', 'puente del SDK'],
    ['type="module"', 'el juego es un módulo ES (usa import)'],
    ['game-canvas', 'el lienzo que el motor busca'],
    ['btn-touch-left', 'control táctil izquierdo'],
    ['btn-touch-right', 'control táctil derecho'],
    ['btn-touch-jump', 'control táctil de salto'],
  ];

  for (const [aguja, descripcion] of requisitos) {
    const hay = html.includes(aguja);
    if (!hay) fallos++;
    console.log(`    ${hay ? '✅' : '❌'} ${descripcion}`);
  }

  // El SDK debe ir ANTES que el juego.
  const posPuente = html.indexOf('playwin-bridge.js');
  const posJuego = html.indexOf('script.js');
  const ordenOk = posPuente !== -1 && posJuego !== -1 && posPuente < posJuego;
  if (!ordenOk) fallos++;
  console.log(`    ${ordenOk ? '✅' : '❌'} el SDK se carga antes que el juego`);
} catch (err) {
  fallos++;
  console.log(`    ❌ no se pudo leer el HTML: ${err.message}`);
}

console.log(`\n  ${fallos === 0 ? '✅ Sky Runner 3D se sirve correctamente' : `❌ ${fallos} problema(s)`}\n`);
// Salir marcando el código en lugar de forzar process.exit(): cerrar a lo bruto
// mientras fetch aún tiene descriptores abiertos provoca un fallo de libuv en Windows.
process.exitCode = fallos === 0 ? 0 : 1;
