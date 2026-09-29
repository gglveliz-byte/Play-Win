/**
 * Deja los guardianes del ciclo de partida con SEMÁNTICA POSITIVA y a prueba de
 * caché del navegador.
 *
 * El problema que resuelve (BUG-026): si el navegador sirve una copia antigua de
 * playwin-bridge.js, `canStartLocally` no existe. La comprobación ingenua
 *
 *   if (window.PlayWin && !window.PlayWin.canStartLocally()) return;
 *
 * evalúa `!undefined === true` y BLOQUEA EL ARRANQUE, incluido el legítimo del
 * servidor (`onMatchLive`). Resultado: el servidor empareja, arranca la partida…
 * y los dos coches se quedan quietos sin que nada avise.
 *
 * La forma robusta y legible:
 *
 *   const tieneArbitroDelServidor = () =>
 *     !!window.PlayWin &&
 *     typeof window.PlayWin.canStartLocally === 'function' &&
 *     !window.PlayWin.canStartLocally();
 *
 *   if (!tieneArbitroDelServidor()) return;   // sin árbitro, no se arranca solo
 *
 * Si el SDK está viejo (sin la función) devuelve false y NO bloquea: se degrada
 * al comportamiento anterior en vez de romperse.
 */
import fs from 'node:fs';

const CAMBIOS = [
  {
    archivo: 'apps/hub/public/games/carreras/script.js',
    // Se reemplaza el helper (si existe) y la guarda.
    helperViejo: null,
    guardaVieja: 'if (!sinArbitroDelServidor()) return;',
    helperNuevo: `    // ¿Manda el servidor? Si el SDK existe pero está cacheado sin
    // canStartLocally, se degrada al arranque local en vez de bloquearlo todo.
    const tieneArbitroDelServidor = () =>
        !!window.PlayWin &&
        typeof window.PlayWin.canStartLocally === 'function' &&
        !window.PlayWin.canStartLocally();`,
    guardaNueva: 'if (!tieneArbitroDelServidor()) return;',
    anclaHelper: "    if (k === 'enter') {",
  },
  {
    archivo: 'apps/hub/public/games/space/script.js',
    helperViejo: `        var sinArbitroDelServidor = function () {
            if (!window.PlayWin) return true;
            if (typeof window.PlayWin.canStartLocally !== 'function') return false;
            return !window.PlayWin.canStartLocally();
        };`,
    guardaVieja: null,
    helperNuevo: `        // ¿Manda el servidor? Con un SDK cacheado sin canStartLocally se
        // degrada al arranque local en vez de bloquearlo todo.
        var tieneArbitroDelServidor = function () {
            return !!window.PlayWin &&
                typeof window.PlayWin.canStartLocally === 'function' &&
                !window.PlayWin.canStartLocally();
        };`,
    guardaNueva: null,
    anclaHelper: "        var self = this;",
    usoViejo: 'if (sinArbitroDelServidor()) self.startGame();',
    usoNuevo: 'if (!tieneArbitroDelServidor()) self.startGame();',
  },
  {
    archivo: 'apps/hub/public/games/flapy-flapy/script.js',
    helperViejo: `    const sinArbitroDelServidor = () =>
        !window.PlayWin ||
        (typeof window.PlayWin.canStartLocally === 'function' && !window.PlayWin.canStartLocally());`,
    guardaVieja: null,
    helperNuevo: `    // ¿Manda el servidor? Con un SDK cacheado sin canStartLocally se degrada
    // al arranque local en vez de bloquearlo todo.
    const tieneArbitroDelServidor = () =>
        !!window.PlayWin &&
        typeof window.PlayWin.canStartLocally === 'function' &&
        !window.PlayWin.canStartLocally();`,
    guardaNueva: null,
    anclaHelper: '    // BUG-025: con el SDK presente la partida la arranca SOLO el servidor',
    usoViejo: 'if (sinArbitroDelServidor()) startGame();',
    usoNuevo: 'if (!tieneArbitroDelServidor()) startGame();',
  },
];

let ok = 0;
let fallos = 0;

for (const c of CAMBIOS) {
  if (!fs.existsSync(c.archivo)) {
    console.log(`  ⚠️  ${c.archivo}: no existe`);
    fallos++;
    continue;
  }

  let contenido = fs.readFileSync(c.archivo, 'utf8');
  const teniaCRLF = contenido.includes('\r\n');
  if (teniaCRLF) contenido = contenido.replace(/\r\n/g, '\n');

  const nombre = c.archivo.split('/').pop();

  if (contenido.includes('tieneArbitroDelServidor')) {
    console.log(`  ✅ ${nombre}: ya estaba con semántica positiva`);
    ok++;
    continue;
  }

  // 1. Sustituye el helper viejo (o lo elimina si existía).
  if (c.helperViejo && contenido.includes(c.helperViejo)) {
    contenido = contenido.replace(c.helperViejo, c.helperNuevo);
  } else if (c.anclaHelper && contenido.includes(c.anclaHelper)) {
    // carreras: el helper no existía, se inserta antes de la guarda.
    contenido = contenido.replace(c.anclaHelper, `${c.anclaHelper}\n${c.helperNuevo}`);
  } else {
    console.log(`  ❌ ${nombre}: no se encontró dónde insertar el helper`);
    fallos++;
    continue;
  }

  // 2. Sustituye la guarda o los usos.
  if (c.guardaVieja && contenido.includes(c.guardaVieja)) {
    contenido = contenido.replace(c.guardaVieja, c.guardaNueva);
  } else if (c.usoViejo && contenido.includes(c.usoViejo)) {
    contenido = contenido.split(c.usoViejo).join(c.usoNuevo);
  } else {
    console.log(`  ❌ ${nombre}: no se encontró la guarda ni los usos a sustituir`);
    fallos++;
    continue;
  }

  if (teniaCRLF) contenido = contenido.replace(/\n/g, '\r\n');
  fs.writeFileSync(c.archivo, contenido);
  console.log(`  ✅ ${nombre}: semántica positiva aplicada`);
  ok++;
}

console.log(`\nActualizados: ${ok} · Fallos: ${fallos}`);
process.exit(fallos === 0 ? 0 : 1);
