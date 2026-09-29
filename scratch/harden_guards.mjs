/**
 * Hace los guardianes del ciclo de partida ROBUSTOS frente a un SDK cacheado.
 *
 * Problema detectado (BUG-026): el navegador puede servir una copia vieja de
 * playwin-bridge.js sin `canStartLocally`. Entonces:
 *
 *   if (window.PlayWin && !window.PlayWin.canStartLocally()) return;
 *                              ^^^^^^^^^^^^^^^^^^^^^^^ undefined
 *   !undefined === true  ->  BLOQUEA EL ARRANQUE, incluso el legítimo del
 *                            servidor (onMatchLive). La partida empieza en el
 *                            servidor y los dos coches se quedan quietos.
 *
 * La versión robusta comprueba que la función EXISTE y que además devuelve false:
 *
 *   const sinArbitro = () => !window.PlayWin
 *     || typeof window.PlayWin.canStartLocally !== 'function'
 *     || !window.PlayWin.canStartLocally();
 *
 * Así, con un SDK viejo (sin la función) el arranque del servidor SÍ funciona:
 * se degrada al comportamiento anterior en lugar de romperse.
 */
import fs from 'node:fs';

/** Motores y su expresión de guardián a sustituir. */
const MOTORES = [
  {
    archivo: 'apps/hub/public/games/carreras/script.js',
    buscar: 'if (window.PlayWin && !window.PlayWin.canStartLocally()) return;',
    reemplazo: 'if (!sinArbitroDelServidor()) return;',
    ancla: "    if (k === 'enter') {",
  },
  {
    archivo: 'apps/hub/public/games/space/script.js',
    buscar: `        var puedeArrancarLocal = function () {
            return !window.PlayWin || (typeof window.PlayWin.canStartLocally === 'function' && window.PlayWin.canStartLocally());
        };`,
    reemplazo: `        var sinArbitroDelServidor = function () {
            if (!window.PlayWin) return true;
            if (typeof window.PlayWin.canStartLocally !== 'function') return false;
            return !window.PlayWin.canStartLocally();
        };`,
    ancla: null,
  },
  {
    archivo: 'apps/hub/public/games/flapy-flapy/script.js',
    buscar: `    const puedeArrancarLocal = () =>
        !window.PlayWin || (typeof window.PlayWin.canStartLocally === 'function' && window.PlayWin.canStartLocally());`,
    reemplazo: `    const sinArbitroDelServidor = () =>
        !window.PlayWin ||
        (typeof window.PlayWin.canStartLocally === 'function' && !window.PlayWin.canStartLocally());`,
    ancla: null,
  },
];

let ok = 0;
let fallos = 0;

for (const { archivo, buscar, reemplazo } of MOTORES) {
  if (!fs.existsSync(archivo)) {
    console.log(`  ⚠️  ${archivo}: no existe`);
    fallos++;
    continue;
  }

  let contenido = fs.readFileSync(archivo, 'utf8');

  // Normaliza finales de línea para que el reemplazo funcione con CRLF o LF.
  const teniaCRLF = contenido.includes('\r\n');
  if (teniaCRLF) contenido = contenido.replace(/\r\n/g, '\n');

  if (!contenido.includes(buscar)) {
    if (contenido.includes('sinArbitroDelServidor')) {
      console.log(`  ✅ ${archivo.split('/').pop()}: ya estaba actualizado`);
      ok++;
    } else {
      console.log(`  ❌ ${archivo.split('/').pop()}: no se encontró el guardián a sustituir`);
      fallos++;
    }
    continue;
  }

  contenido = contenido.replace(buscar, reemplazo);

  // Renombra los usos del helper antiguo en space y flapy-flapy.
  contenido = contenido.replace(/\bpuedeArrancarLocal\(\)/g, 'sinArbitroDelServidor()');

  if (teniaCRLF) contenido = contenido.replace(/\n/g, '\r\n');
  fs.writeFileSync(archivo, contenido);
  console.log(`  ✅ ${archivo.split('/').pop()}: guardián robusto aplicado`);
  ok++;
}

console.log(`\nActualizados: ${ok} · Fallos: ${fallos}`);
process.exit(fallos === 0 ? 0 : 1);
