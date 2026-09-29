/**
 * Comprueba que el SDK SERVIDO por el Hub contiene los arreglos críticos.
 * Si falta alguno, el navegador está ejecutando una versión antigua.
 */
const ARREGLOS = [
  { nombre: 'BUG-029: manejador de mensajes persistente', patron: /messageHandler/ },
  { nombre: 'BUG-030: stopWaitingNotice definida', patron: /function stopWaitingNotice/ },
  { nombre: 'Blindaje del procesador de mensajes', patron: /fallo al procesar el evento/ },
  { nombre: 'Guardián del ciclo (canStartLocally)', patron: /canStartLocally/ },
  { nombre: 'Pantalla de servidor no disponible', patron: /pw-screen-offline/ },
];

console.log('═══ SDK SERVIDO POR EL HUB ═══\n');

const ficheros = await Promise.all(
  ['playwin-bridge.js', 'playwin-bridge-connection.js', 'playwin-bridge-status.js', 'playwin-bridge-ui.js'].map(async (f) => {
    const r = await fetch(`http://localhost:3000/game-sdk/${f}`, { signal: AbortSignal.timeout(8000) });
    return { f, codigo: await r.text(), estado: r.status };
  })
);

for (const { f, codigo, estado } of ficheros) {
  console.log(`  ${f.padEnd(32)} HTTP ${estado} · ${codigo.length} bytes`);
}

const bridge = ficheros.find((x) => x.f === 'playwin-bridge.js')?.codigo || '';
const conexion = ficheros.find((x) => x.f === 'playwin-bridge-connection.js')?.codigo || '';
const todo = bridge + conexion;

console.log('\n═══ ¿ESTÁN LOS ARREGLOS? ═══\n');
let faltan = 0;
for (const { nombre, patron } of ARREGLOS) {
  const hay = patron.test(todo);
  if (!hay) faltan++;
  console.log(`  ${hay ? '✅' : '❌'} ${nombre}`);
}

// La versión de caché declarada dentro del propio código.
const v = bridge.match(/const SDK_VERSION = (\d+)/);
console.log(`\n  Versión del SDK servido: ${v ? 'v' + v[1] : '(no declarada)'}`);

console.log(
  `\n  ${faltan === 0 ? '✅ El SDK servido está actualizado' : `❌ Faltan ${faltan} arreglos: el navegador ejecuta código viejo`}\n`
);
