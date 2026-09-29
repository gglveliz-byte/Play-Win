import assert from 'node:assert';
import { detectCollusion, isSelfMatchAllowed } from '../src/anticheat.js';

/**
 * ============================================================================
 * PRUEBA DE DETECCIÓN DE COLUSIÓN (collusion_spec.js)
 * ============================================================================
 * `detectCollusion` tenía COBERTURA CERO: ninguna suite la invocaba, así que un
 * fallo en esa lógica habría llegado a producción sin detectarse (BUG-014).
 *
 * Además dependía de `NODE_ENV` en lugar de una bandera explícita, lo que hacía
 * el comportamiento implícito e imposible de probar en ambos sentidos (BUG-011).
 * ============================================================================
 */

let fallos = 0;
function check(nombre, fn) {
  try {
    fn();
    console.log(`✅ ${nombre}`);
  } catch (err) {
    fallos++;
    console.error(`❌ ${nombre}: ${err.message}`);
  }
}

console.log('🧪 [Collusion] Verificando detección de colusión y cuentas espejo...\n');

const cuentaA = { player: { id: 'user_a', username: 'alfa' }, ip: '203.0.113.10' };
const cuentaB = { player: { id: 'user_b', username: 'beta' }, ip: '203.0.113.10' };
const cuentaC = { player: { id: 'user_c', username: 'gamma' }, ip: '198.51.100.77' };

// ── Forzamos el modo estricto: sin la bandera de auto-emparejamiento ─────────
const banderaOriginal = process.env.ALLOW_SELF_MATCH;
delete process.env.ALLOW_SELF_MATCH;

console.log('--- Modo estricto (ALLOW_SELF_MATCH sin definir) ---');

check('La misma cuenta contra sí misma es SIEMPRE colusión', () => {
  const r = detectCollusion(cuentaA, { ...cuentaA, ip: '198.51.100.99' });
  assert.strictEqual(r.isCollusion, true, 'debería detectarse SAME_ACCOUNT_MATCH');
  assert.strictEqual(r.reason, 'SAME_ACCOUNT_MATCH');
});

check('Dos cuentas desde la MISMA IP son colusión', () => {
  const r = detectCollusion(cuentaA, cuentaB);
  assert.strictEqual(r.isCollusion, true, 'debería detectarse SAME_IP_COLLUSION');
  assert.strictEqual(r.reason, 'SAME_IP_COLLUSION');
});

check('Dos cuentas desde IPs DISTINTAS no son colusión', () => {
  const r = detectCollusion(cuentaA, cuentaC);
  assert.strictEqual(r.isCollusion, false, 'no debería marcarse colusión');
});

check('La misma cuenta y misma IP reporta el motivo de CUENTA (tiene prioridad)', () => {
  const r = detectCollusion(cuentaA, { ...cuentaA });
  assert.strictEqual(r.reason, 'SAME_ACCOUNT_MATCH');
});

check('IP de bucle local no se marca como colusión entre cuentas distintas', () => {
  const localA = { player: { id: 'user_a', username: 'alfa' }, ip: '127.0.0.1' };
  const localB = { player: { id: 'user_b', username: 'beta' }, ip: '127.0.0.1' };
  const r = detectCollusion(localA, localB);
  assert.strictEqual(r.isCollusion, false, 'el bucle local no debe bloquear el desarrollo');
});

check('IPv6 de bucle local tampoco se marca', () => {
  const v6a = { player: { id: 'user_a', username: 'alfa' }, ip: '::1' };
  const v6b = { player: { id: 'user_b', username: 'beta' }, ip: '::1' };
  assert.strictEqual(detectCollusion(v6a, v6b).isCollusion, false);
});

check('IP ausente no provoca un falso positivo', () => {
  const sinIpA = { player: { id: 'user_a', username: 'alfa' } };
  const sinIpB = { player: { id: 'user_b', username: 'beta' } };
  assert.strictEqual(detectCollusion(sinIpA, sinIpB).isCollusion, false);
});

// ── Modo permisivo: la bandera explícita habilita el auto-emparejamiento ────
console.log('\n--- Modo permisivo (ALLOW_SELF_MATCH=true) ---');

process.env.ALLOW_SELF_MATCH = 'true';

check('isSelfMatchAllowed() refleja la bandera', () => {
  assert.strictEqual(isSelfMatchAllowed(), true);
});

check('Con la bandera activa, la misma IP deja de bloquearse', () => {
  const r = detectCollusion(cuentaA, cuentaB);
  assert.strictEqual(r.isCollusion, false, 'la bandera debe permitir mismo IP');
});

check('Con la bandera activa, la MISMA CUENTA sigue siendo colusión', () => {
  const r = detectCollusion(cuentaA, { ...cuentaA, ip: '198.51.100.99' });
  assert.strictEqual(r.isCollusion, true, 'la bandera nunca debe permitir jugar contra uno mismo');
  assert.strictEqual(r.reason, 'SAME_ACCOUNT_MATCH');
});

// ── Restaurar el entorno ────────────────────────────────────────────────────
if (banderaOriginal === undefined) delete process.env.ALLOW_SELF_MATCH;
else process.env.ALLOW_SELF_MATCH = banderaOriginal;

console.log(
  `\n${fallos === 0 ? '🎉 DETECCIÓN DE COLUSIÓN VERIFICADA AL 100%' : `❌ ${fallos} comprobaciones fallaron`}`
);
process.exit(fallos === 0 ? 0 : 1);
