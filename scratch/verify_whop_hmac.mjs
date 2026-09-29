/**
 * Prueba unitaria aislada de la verificación HMAC del webhook de Whop.
 * No necesita servidor: reproduce exactamente la lógica de la ruta.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const envLocal = fs.readFileSync('apps/hub/.env.local', 'utf8');
const match = envLocal.match(/WHOP_WEBHOOK_SECRET="([^"]*)"/);
const secret = match ? match[1] : null;

if (!secret) {
  console.log('❌ No hay WHOP_WEBHOOK_SECRET configurado en apps/hub/.env.local');
  process.exit(1);
}

console.log(`Secreto leído de .env.local: "${secret}"\n`);

// Réplica de la función signatureMatches() de la ruta
function signatureMatches(provided, expected) {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const body = JSON.stringify({ action: 'payment.succeeded', data: { id: 'x', email: 'a@b.test' } });
const expectedDigest = crypto.createHmac('sha256', secret).update(body).digest('hex');
const wrongDigest = crypto.createHmac('sha256', 'secreto-equivocado').update(body).digest('hex');
const shortDigest = expectedDigest.slice(0, 20);

const cases = [
  ['firma correcta', expectedDigest, true],
  ['firma incorrecta', wrongDigest, false],
  ['firma truncada (distinta longitud)', shortDigest, false],
  ['firma vacía', '', false],
  ['firma del cuerpo de OTRO payload', crypto.createHmac('sha256', secret).update('otro-cuerpo').digest('hex'), false],
];

let allOk = true;
for (const [nombre, firma, esperado] of cases) {
  const resultado = signatureMatches(firma, expectedDigest);
  const ok = resultado === esperado;
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '❌'} ${nombre.padEnd(38)} → ${resultado ? 'ACEPTADA' : 'rechazada'} (esperado: ${esperado ? 'ACEPTADA' : 'rechazada'})`);
}

console.log(`\n${allOk ? '✅ Verificación HMAC correcta en todos los casos' : '❌ Hay fallos en la verificación'}`);
process.exit(allOk ? 0 : 1);
