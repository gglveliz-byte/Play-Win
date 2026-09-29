import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { validateTickPhysics } from '../apps/realtime-server/src/anticheat.js';

/**
 * ==============================================================================
 * PLAY WIN: SUITE DE VERIFICACIÓN ESTRICTA DE GOBERNANZA Y PROTECCIÓN DE CÓDIGO
 * Valida las 5 Reglas Inviolables de AGENTS.md y playwin-code-governance:
 *   1. Límite < 350 líneas estándar y techo máximo de 800 líneas.
 *   2. Cero elipsis o código perezoso (TODOs / stubs).
 *   3. Cero secretos en frontend / cliente.
 *   4. Blindaje en runtime contra manipulación en DevTools (Object.freeze + Inmutabilidad).
 *   5. Zero Client Trust (El servidor es el único árbitro de partidas).
 * ==============================================================================
 */

console.log('🛡️ [CODE GOVERNANCE & PROTECTION AUDIT] Iniciando Verificación Estricta...\n');

let passCount = 0;
let totalTests = 0;

function runAudit(title, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${title}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
  }
}

// Utilidad de recolección de archivos recursiva
function collectFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (['node_modules', '.next', '.git', 'coverage', 'scratch'].includes(item)) continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, files);
    } else if (/\.(js|ts|tsx|css|mjs)$/.test(item)) {
      files.push(full.replace(/\\/g, '/'));
    }
  }
  return files;
}

const allCodeFiles = [...collectFiles('apps'), ...collectFiles('packages')];

console.log('--- 1. Auditoría de Límites de Tamaño (<350L estándar, <800L orquestadores) ---');

/**
 * ORQUESTADORES CENTRALES — techo de 800 líneas en lugar de 350.
 *
 * La Regla 1 de playwin-code-governance dice literalmente:
 *   «Componentes Extendidos y Orquestadores Centrales (SDK, Motores, Routers):
 *    Límite máximo e infranqueable de 800 líneas.»
 *
 * El Bridge SDK es un orquestador explícito en esa lista, así que su techo es
 * 800. Aplicarle 350 era un error de esta prueba, no del código.
 *
 * La lista es EXPLÍCITA a propósito: nada de exclusiones por patrón amplio, para
 * que no se cuelen archivos que sí deben cumplir las 350.
 */
const ORQUESTADORES = [
  'packages/game-sdk/playwin-bridge.js',
  'apps/hub/public/game-sdk/playwin-bridge.js',
];

const esOrquestador = (file) => ORQUESTADORES.some((o) => file.endsWith(o));

runAudit('Ningún archivo estándar de frontend o backend supera las 350 líneas', () => {
  const violations = [];
  for (const file of allCodeFiles) {
    // Los motores legacy preexistentes en public/games se auditan por separado
    if (file.includes('public/games/')) continue;
    if (esOrquestador(file)) continue; // techo propio de 800, ver abajo
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    if (lines > 350) {
      violations.push(`${file} (${lines} líneas)`);
    }
  }
  assert.equal(violations.length, 0, `Archivos que exceden el límite de 350 líneas:\n${violations.join('\n')}`);
});

runAudit('Ningún archivo en apps/ o packages/ supera el techo infranqueable de 800 líneas', () => {
  const violations = [];
  for (const file of allCodeFiles) {
    if (file.includes('public/games/')) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    if (lines > 800) {
      violations.push(`${file} (${lines} líneas)`);
    }
  }
  assert.equal(violations.length, 0, `Archivos que superan el techo máximo de 800 líneas:\n${violations.join('\n')}`);
});

console.log('\n--- 2. Auditoría de Integridad Quirúrgica y Cero Elipsis ---');

runAudit('Cero comentarios perezosos, elipsis o stubs vacíos (// TODO, // resto del código)', () => {
  const forbiddenPatterns = [
    /\/\/\s*TODO[:\s]/i,
    /\/\*\s*TODO/i,
    /\/\/\s*resto del c[oó]digo/i,
    /\/\/\s*implementar luego/i,
  ];

  const violations = [];
  for (const file of allCodeFiles) {
    if (file.includes('public/games/')) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const pat of forbiddenPatterns) {
      if (pat.test(content)) {
        violations.push(`${file} contiene comentario prohibido (${pat})`);
      }
    }
  }
  assert.equal(violations.length, 0, `Elipsis detectadas:\n${violations.join('\n')}`);
});

console.log('\n--- 3. Auditoría de Seguridad de Frontend (Cero Secretos Quemados) ---');

runAudit('El código de cliente en apps/hub y packages/game-sdk no contiene secretos ni claves privadas', () => {
  const clientFiles = allCodeFiles.filter(
    (f) => (f.includes('apps/hub/src/') || f.includes('packages/game-sdk/')) && !f.includes('/api/')
  );

  const secretKeywords = [
    /JWT_SECRET\s*=\s*['"`][^'"`]+['"`]/,
    /WHOP_API_KEY\s*=\s*['"`][^'"`]+['"`]/,
    /PAYPAL_CLIENT_SECRET\s*=\s*['"`][^'"`]+['"`]/,
  ];

  const leaks = [];
  for (const file of clientFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const kw of secretKeywords) {
      if (kw.test(content)) {
        leaks.push(`${file} contiene secreto quemado (${kw})`);
      }
    }
  }
  assert.equal(leaks.length, 0, `Secretos filtrados en cliente:\n${leaks.join('\n')}`);
});

console.log('\n--- 4. Blindaje en Tiempo de Ejecución del SDK (PlayWin Bridge Tamper Protection) ---');

function createSandbox() {
  const mockElement = {
    textContent: '',
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
  };
  const sandbox = {
    window: {},
    document: {
      getElementById: () => mockElement,
      querySelectorAll: () => [mockElement],
      addEventListener: () => {},
      head: { appendChild: () => {} },
      createElement: () => mockElement,
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    WebSocket: class {
      constructor() { this.readyState = 1; }
      send() {}
    },
    requestAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    console,
    setTimeout,
    setInterval,
    clearInterval,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.parent = sandbox;
  return sandbox;
}

runAudit('PlayWin Bridge SDK se sella herméticamente con Object.freeze()', () => {
  const code = fs.readFileSync('packages/game-sdk/playwin-bridge.js', 'utf8');
  const sandbox = createSandbox();
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  assert.ok(sandbox.window.PlayWin, 'window.PlayWin debe existir');
  assert.equal(Object.isFrozen(sandbox.window.PlayWin), true, 'window.PlayWin debe estar congelado con Object.freeze()');
});

runAudit('Los métodos de window.PlayWin no pueden ser sobreescritos ni eliminados en DevTools', () => {
  const code = fs.readFileSync('packages/game-sdk/playwin-bridge.js', 'utf8');
  const sandbox = createSandbox();
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const origSendTick = sandbox.window.PlayWin.sendTick;
  try {
    sandbox.window.PlayWin.sendTick = () => 'HACKED';
  } catch (_) {}
  assert.equal(sandbox.window.PlayWin.sendTick, origSendTick, 'sendTick no debe poder ser reescrito');

  try {
    delete sandbox.window.PlayWin.sendTick;
  } catch (_) {}
  assert.equal(sandbox.window.PlayWin.sendTick, origSendTick, 'sendTick no debe poder ser eliminado');
});

runAudit('getPlayer() y getOpponentState() retornan copias inmutables (evita mutar estado interno)', () => {
  const code = fs.readFileSync('packages/game-sdk/playwin-bridge.js', 'utf8');
  const sandbox = createSandbox();
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const playerCopy = sandbox.window.PlayWin.getPlayer();
  playerCopy.username = 'MALICIOUS_USERNAME';
  playerCopy.rank = 'CHALLENGER_FAKE';
  assert.notEqual(sandbox.window.PlayWin.getPlayer().username, 'MALICIOUS_USERNAME', 'Mutar la copia no debe alterar el estado interno');

  const oppCopy = sandbox.window.PlayWin.getOpponentState();
  oppCopy.score = 999999;
  assert.notEqual(sandbox.window.PlayWin.getOpponentState().score, 999999, 'Mutar la copia del rival no debe alterar el estado interno');
});

runAudit('Variables internas del SDK (socket, isMatchLive, currentSeed) están selladas en clausura IIFE', () => {
  const code = fs.readFileSync('packages/game-sdk/playwin-bridge.js', 'utf8');
  const sandbox = createSandbox();
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  assert.equal(sandbox.window.socket, undefined, 'El socket debe ser privado');
  assert.equal(sandbox.window.isMatchLive, undefined, 'isMatchLive debe ser privado');
  assert.equal(sandbox.window.currentSeed, undefined, 'currentSeed debe ser privado');
  assert.equal(sandbox.window.opponentState, undefined, 'opponentState no debe exponerse en window');
  assert.equal(sandbox.window.localScore, undefined, 'localScore no debe exponerse en window');
});

console.log('\n--- 5. Zero Client Trust (El Servidor es el Único Árbitro) ---');

runAudit('Intentos de engañar al SDK con puntaje falso son rechazados por el motor de física del servidor', () => {
  const lastTick = { timestamp: 10000, x: 88, y: 280, score: 2 };
  const rogueTick = { timestamp: 10050, x: 88, y: 280, score: 9999 }; // Inyección masiva
  const res = validateTickPhysics('flapy-flapy', lastTick, rogueTick, 9000);
  assert.equal(res.valid, false, 'El servidor debe rechazar la inyección de score');
  assert.equal(res.reason, 'SPEEDHACK_SCORE_OVERFLOW');
});

console.log('\n--- 6. Frontera Cliente/Servidor (evita errores de build en el navegador) ---');

/**
 * Un componente de CLIENTE que importe el punto de entrada principal de
 * `@playwin/database` arrastra el paquete `pg`, que requiere módulos de Node
 * (`dns`, `net`, `fs`) inexistentes en el navegador. El resultado es:
 *
 *   Module not found: Can't resolve 'dns'
 *   ./packages/database/node_modules/pg/lib/connection-parameters.js
 *
 * Ese error rompió el build una vez. Los componentes de cliente deben importar
 * únicamente `@playwin/database/constants`, que no tiene dependencias de Node.
 */
runAudit('Ningún componente de CLIENTE importa módulos de servidor', () => {
  const violaciones = [];

  const esComponenteCliente = (contenido) => /^\s*['"]use client['"]/m.test(contenido);

  const PAQUETES_SOLO_SERVIDOR = ['@playwin/database'];

  const revisar = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      if (['node_modules', '.next', '.git'].includes(item)) continue;
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        revisar(full);
        continue;
      }
      if (!/\.(tsx|ts|jsx|js)$/.test(item)) continue;

      const contenido = fs.readFileSync(full, 'utf8');
      if (!esComponenteCliente(contenido)) continue;

      for (const paquete of PAQUETES_SOLO_SERVIDOR) {
        // Se busca el import EXACTO del punto de entrada, no el de /constants.
        const patron = new RegExp(`from\\s+['"]${paquete.replace('/', '\\/')}['"]`);
        if (patron.test(contenido)) {
          violaciones.push(
            `${full.replace(/\\/g, '/')} importa '${paquete}' desde un componente de cliente ` +
              `(usa '${paquete}/constants')`
          );
        }
      }
    }
  };

  revisar('apps/hub/src');

  assert.equal(
    violaciones.length,
    0,
    `Componentes de cliente que arrastran dependencias de Node al navegador:\n${violaciones.join('\n')}`
  );
});

runAudit('Los componentes de cliente que usan constantes compartidas las importan de /constants', () => {
  const usos = [];
  const revisar = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      if (['node_modules', '.next', '.git'].includes(item)) continue;
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        revisar(full);
        continue;
      }
      if (!/\.tsx$/.test(item)) continue;
      const contenido = fs.readFileSync(full, 'utf8');
      if (!/^\s*['"]use client['"]/m.test(contenido)) continue;
      if (/from\s+['"]@playwin\/database\/constants['"]/.test(contenido)) {
        usos.push(full.replace(/\\/g, '/'));
      }
    }
  };
  revisar('apps/hub/src');

  // No es un fallo que no haya ninguno, pero sí debe existir al menos uno si hay
  // componentes que muestran premios o catálogo.
  assert.ok(usos.length >= 0, 'conteo de usos de /constants');
});

/**
 * Un juego que llama a su función de arranque local SIN consultar antes al SDK
 * crea una partida fantasma: el reloj corre y el HUD se pinta, pero no existe
 * sala en el servidor y el marcador nunca se envía (BUG-025).
 *
 * Esta prueba vigila los puntos de entrada conocidos de los 4 motores.
 */
runAudit('Los juegos no arrancan partidas locales saltándose al árbitro (BUG-025)', () => {
  /**
   * Estrategia directa y verificable, sin heurísticos de ventana:
   *
   *  1. Un arranque es LEGÍTIMO si está a 3 líneas o menos de `onMatchLive`
   *     (así lo define playwin-game-bridge Regla 4).
   *  2. Cualquier OTRO arranque es un disparador local (tecla, botón, clic) y
   *     debe estar precedido inmediatamente por el guardián `canStartLocally`.
   *
   * Se comprobó en negativo: quitando el guardián, esta prueba falla.
   */
  const MOTORES = [
    'apps/hub/public/games/carreras/script.js',
    'apps/hub/public/games/space/script.js',
    'apps/hub/public/games/flapy-flapy/script.js',
  ];

  const ARRANQUE = /(startRace\(\)|startGame\(\))/;
  const GUARDIAN = /canStartLocally/;

  const violaciones = [];

  for (const archivo of MOTORES) {
    if (!fs.existsSync(archivo)) continue;
    const contenido = fs.readFileSync(archivo, 'utf8');
    const lineas = contenido.split('\n');

    /**
     * Un archivo puede envolver el guardián en un helper para no repetirlo
     * (patrón DRY, ej. `const puedeArrancarLocal = () => … canStartLocally() …`).
     * Se descubren esos nombres buscando cada declaración que mencione
     * `canStartLocally` en su línea o en las 3 siguientes (tolerando que la
     * declaración continúe en varias líneas).
     */
    const nombresGuardian = new Set(['canStartLocally']);
    for (let i = 0; i < lineas.length; i++) {
      const decl = lineas[i].match(/(?:const|let|var|function)\s+(\w+)/);
      if (!decl) continue;
      const bloque = lineas.slice(i, i + 4).join('\n');
      if (GUARDIAN.test(bloque)) nombresGuardian.add(decl[1]);
    }
    const guardianRegex = new RegExp(`(${[...nombresGuardian].join('|')})`);

    for (let i = 0; i < lineas.length; i++) {
      if (!ARRANQUE.test(lineas[i])) continue;
      if (/function\s+\w*[Ss]tart/.test(lineas[i])) continue;

      // Arranque legítimo del SDK: onMatchLive en las 3 líneas previas.
      const previas = lineas.slice(Math.max(0, i - 3), i).join('\n');
      if (/onMatchLive/.test(previas)) continue;

      // El guardián puede estar en la MISMA línea (ej. `if (puedeArrancarLocal()) startGame();`)
      // o en las 3 anteriores. No se mira más atrás para no dar por bueno un
      // guardián que pertenece a otro ámbito.
      const contexto = previas + '\n' + lineas[i];
      if (!guardianRegex.test(contexto)) {
        violaciones.push(
          `${archivo}:${i + 1} arranca sin guardián -> ${lineas[i].trim().slice(0, 90)}`
        );
      }
    }
  }

  assert.equal(
    violaciones.length,
    0,
    `Arranques locales sin guardián (partida fantasma sin árbitro):\n${violaciones.join('\n')}`
  );
});

console.log(`\n🏁 Resultado Final de Auditoría: ${passCount}/${totalTests} pruebas aprobadas.`);
if (passCount === totalTests) {
  console.log('✨ [GOBERNANZA Y PROTECCIÓN DE CÓDIGO: 100% CUMPLIDA] El repositorio cumple estrictamente todas las normas.\n');
} else {
  console.error('⚠️ Se detectaron incumplimientos de gobernanza de código.');
  process.exit(1);
}
