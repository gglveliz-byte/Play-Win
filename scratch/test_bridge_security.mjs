import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

console.log('Testing bridge security...');

const code = fs.readFileSync('packages/game-sdk/playwin-bridge.js', 'utf8');

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

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

assert.ok(sandbox.window.PlayWin, 'PlayWin must be defined');
assert.ok(Object.isFrozen(sandbox.window.PlayWin), 'PlayWin must be frozen');

// Test 1: Intento de reescribir método
const origSendTick = sandbox.window.PlayWin.sendTick;
try {
  sandbox.window.PlayWin.sendTick = () => console.log('HACKED');
} catch (e) {}
assert.equal(sandbox.window.PlayWin.sendTick, origSendTick, 'sendTick should not be overwritable');

// Test 2: Intento de mutar estado del jugador vía getPlayer()
const player = sandbox.window.PlayWin.getPlayer();
player.username = 'HACKER_NAME';
assert.notEqual(sandbox.window.PlayWin.getPlayer().username, 'HACKER_NAME', 'getPlayer() must return an immutable clone');

// Test 3: Intento de mutar estado del oponente vía getOpponentState()
const opp = sandbox.window.PlayWin.getOpponentState();
opp.score = 999999;
assert.notEqual(sandbox.window.PlayWin.getOpponentState().score, 999999, 'getOpponentState() must return an immutable clone');

// Test 4: Variables internas no expuestas
assert.equal(sandbox.window.socket, undefined);
assert.equal(sandbox.window.isMatchLive, undefined);
assert.equal(sandbox.window.currentSeed, undefined);
assert.equal(sandbox.window.opponentState, undefined);

console.log('Bridge security tests passed 100%!');
