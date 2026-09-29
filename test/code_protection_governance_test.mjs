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

console.log('--- 1. Auditoría de Límites de Tamaño (<350L estándar, <800L techo máximo) ---');

runAudit('Ningún archivo estándar de frontend o backend supera las 350 líneas', () => {
  const violations = [];
  for (const file of allCodeFiles) {
    // Los motores legacy preexistentes en public/games se auditan por separado
    if (file.includes('public/games/')) continue;
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

console.log(`\n🏁 Resultado Final de Auditoría: ${passCount}/${totalTests} pruebas aprobadas.`);
if (passCount === totalTests) {
  console.log('✨ [GOBERNANZA Y PROTECCIÓN DE CÓDIGO: 100% CUMPLIDA] El repositorio cumple estrictamente todas las normas.\n');
} else {
  console.error('⚠️ Se detectaron incumplimientos de gobernanza de código.');
  process.exit(1);
}
