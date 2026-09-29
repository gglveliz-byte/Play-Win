/**
 * PLAY WIN - SPACE ANTI-CHEAT UNIT TESTS (space_anticheat_spec.js)
 * 16 casos: bounds config, retrograde, speedhack, X-teleport, Y-teleport (noclip), OOB Y, OOB X, first-tick.
 */
import { validateTickPhysics, GAME_PHYSICS_BOUNDS } from '../src/anticheat.js';

const GAME_ID = 'space';
const NOW = Date.now();
const MATCH_START = NOW - 10000;

function tick(x, y, score, off = 0)  { return { x, y, score, timestamp: NOW + off }; }
function last(x, y, score, off = -50){ return { x, y, score, timestamp: NOW + off }; }

const bounds = GAME_PHYSICS_BOUNDS[GAME_ID];
let passed = 0, failed = 0;
function assert(label, condition, detail = '') {
  if (condition) { console.log(`  OK  ${label}`); passed++; }
  else           { console.error(`  FAIL  ${label}${detail ? ' | '+detail : ''}`); failed++; }
}

console.log('== SPACE ANTI-CHEAT TESTS ==');

// A – Bounds correctos
assert('maxScoreDeltaPerSec <= 15000',  bounds.maxScoreDeltaPerSec <= 15000,  `got ${bounds.maxScoreDeltaPerSec}`);
assert('maxPositionJump <= 1200',       bounds.maxPositionJump <= 1200,       `got ${bounds.maxPositionJump}`);
assert('maxPlayerX >= 2500',            bounds.maxPlayerX >= 2500,            `got ${bounds.maxPlayerX}`);
assert('maxPlayerY >= 1400',            bounds.maxPlayerY >= 1400,            `got ${bounds.maxPlayerY}`);

// B – Retrograde score
{ const r = validateTickPhysics(GAME_ID, last(50,300,500), tick(50,300,400), MATCH_START);
  assert('score decreciente -> RETROGRADE', !r.valid && r.reason==='SCORE_RETROGRADE_ANOMALY'); }

// C – Speedhack
{ const r = validateTickPhysics(GAME_ID, last(50,300,0), tick(50,300,20000), MATCH_START);
  assert('20.000 pts en 50ms -> SPEEDHACK', !r.valid && r.reason==='SPEEDHACK_SCORE_OVERFLOW'); }
{ const r = validateTickPhysics(GAME_ID, last(50,300,0), tick(50,300,1200), MATCH_START);
  assert('1.200 pts en 50ms -> valido', r.valid, r.reason); }
{ const r = validateTickPhysics(GAME_ID, last(50,300,0), tick(50,300,999999), MATCH_START);
  assert('macro 999.999 pts en 10s -> SPEEDHACK', !r.valid && r.reason==='SPEEDHACK_SCORE_OVERFLOW'); }

// D – X teleport
{ const r = validateTickPhysics(GAME_ID, last(100,300,0), tick(1600,300,0), MATCH_START);
  assert('xDelta 1500px en 50ms -> TELEPORT', !r.valid && r.reason==='TELEPORT_POSITION_ANOMALY', r.reason); }
{ const r = validateTickPhysics(GAME_ID, last(100,300,0), tick(900,300,0), MATCH_START);
  assert('xDelta 800px en 50ms -> valido', r.valid, r.reason); }
{ const r = validateTickPhysics(GAME_ID, last(100,300,0), tick(3200,300,0), MATCH_START);
  assert('x absoluto 3200 -> TELEPORT', !r.valid && r.reason==='TELEPORT_POSITION_ANOMALY', r.reason); }

// E – Y noclip (NUEVO)
{ const r = validateTickPhysics(GAME_ID, last(50,100,0), tick(50,1600,0), MATCH_START);
  assert('yDelta 1500px en 50ms -> TELEPORT', !r.valid && r.reason==='TELEPORT_POSITION_ANOMALY', r.reason); }
{ const r = validateTickPhysics(GAME_ID, last(50,100,0), tick(50,700,0), MATCH_START);
  assert('yDelta 600px en 50ms -> valido', r.valid, r.reason); }
{ const r = validateTickPhysics(GAME_ID, last(50,100,0), tick(50,-100,0), MATCH_START);
  assert('y=-100 (ceil) -> OUT_OF_BOUNDS', !r.valid && r.reason==='OUT_OF_BOUNDS_ANOMALY', r.reason); }
{ const r = validateTickPhysics(GAME_ID, last(50,1900,0), tick(50,2000,0), MATCH_START);
  assert('y=2000 (floor) -> OUT_OF_BOUNDS', !r.valid && r.reason==='OUT_OF_BOUNDS_ANOMALY', r.reason); }
{ const r = validateTickPhysics(GAME_ID, last(50,100,0), tick(50,-49,0), MATCH_START);
  assert('y=-49 (margen techo) -> valido', r.valid, r.reason); }

// F – First tick
{ const r = validateTickPhysics(GAME_ID, null, tick(50,300,0), MATCH_START);
  assert('primer tick null -> valido', r.valid); }
{ const r = validateTickPhysics(GAME_ID, {x:0,y:0,score:0,timestamp:NOW-50}, tick(50,300,0), MATCH_START);
  assert('tick (0,0,0) -> valido', r.valid); }

console.log(`\n== ${passed} pasaron / ${failed} fallaron ==`);
if (failed > 0) process.exit(1);
