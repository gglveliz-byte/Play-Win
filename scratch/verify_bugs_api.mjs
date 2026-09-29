/**
 * Verificador de bugs — nivel HTTP contra un Hub Next.js en ejecución.
 * Todos los sondeos son NO DESTRUCTIVOS:
 *  - Se usan correos inexistentes para que los webhooks no acrediten nada.
 *  - No se envían firmas válidas, así que un webhook correcto debe rechazar.
 *  - La ausencia de rechazo demuestra la vulnerabilidad SIN explotarla.
 *
 * Uso: node scratch/verify_bugs_api.mjs [baseUrl]
 */

const BASE = process.argv[2] || 'http://localhost:3000';
const results = [];

function verdict(id, title, status, evidence) {
  results.push({ id, title, status, evidence });
  const icon = status === 'CONFIRMADO' ? '🔴' : status === 'FALSO POSITIVO' ? '✅' : '🟡';
  console.log(`${icon} ${id} [${status}] ${title}\n     ${evidence}`);
}

async function probe(method, url, body, headers = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* respuesta no-JSON */ }
    return { status: res.status, json, text: text.slice(0, 300) };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

// ¿Está vivo el Hub?
const health = await probe('GET', `${BASE}/api/auth/me`);
if (health.status === 0) {
  console.log(`❌ No hay respuesta del Hub en ${BASE}. Arranca el Hub o pasa otra URL.`);
  console.log(`   Detalle: ${health.error}`);
  process.exit(2);
}
console.log(`Hub detectado en ${BASE} (GET /api/auth/me → ${health.status})\n${'─'.repeat(72)}`);

// ── BUG-004: /api/admin/metrics sin auth y roto ─────────────────────────────
{
  const r = await probe('GET', `${BASE}/api/admin/metrics`);
  const sinAuth = r.status === 200 || r.status === 500; // si no exige sesión, no da 401/403
  const roto = r.status === 500;
  verdict('BUG-004-API', '/api/admin/metrics responde sin autenticación',
    r.status !== 401 && r.status !== 403 ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `HTTP ${r.status} sin enviar sesión${r.json?.error ? ` · error: "${r.json.error}"` : ''}`);
  verdict('BUG-004-API2', '/api/admin/metrics devuelve 500 (columnas inexistentes)',
    roto ? 'CONFIRMADO' : 'FALSO POSITIVO',
    roto ? `HTTP 500 · ${JSON.stringify(r.json?.details || r.json).slice(0, 160)}` : `HTTP ${r.status} · ${r.text.slice(0, 140)}`);
}

// ── BUG-012: inconsistencia de códigos entre rutas protegidas ───────────────
{
  const wallet = await probe('GET', `${BASE}/api/wallet/transactions`);
  const history = await probe('GET', `${BASE}/api/matches/history`);
  const divergen = wallet.status !== history.status;
  verdict('BUG-012', 'Códigos HTTP inconsistentes sin sesión (wallet vs history)',
    divergen ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `/api/wallet/transactions → HTTP ${wallet.status} · /api/matches/history → HTTP ${history.status}`);
}

// ── BUG-001: el webhook de PayPal no exige firma ─────────────────────────────
{
  // Correo inexistente: aunque el webhook "funcione", no acredita nada real.
  const r = await probe('POST', `${BASE}/api/webhooks/paypal`, {
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: `verify_probe_${Date.now()}`,
      amount: { value: '0.01', currency_code: 'USD' },
      payer: { email_address: 'no-existe-verificacion@playwin-invalid.test' },
    },
  });
  // Sin cabeceras de firma. Un webhook correcto respondería 401.
  const rechaza = r.status === 401 || r.status === 403;
  verdict('BUG-001-API', 'PayPal webhook procesa el evento SIN cabeceras de firma',
    !rechaza ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `HTTP ${r.status} (sin paypal-transmission-*) · respuesta: ${r.text.slice(0, 150)}`);
}

// ── BUG-005: el webhook de Whop no exige firma ──────────────────────────────
{
  const r = await probe('POST', `${BASE}/api/webhooks/whop`, {
    action: 'payment.succeeded',
    data: { id: `verify_probe_${Date.now()}`, email: 'no-existe-verificacion@playwin-invalid.test', final_amount: 1 },
  });
  const rechaza = r.status === 401 || r.status === 403;
  verdict('BUG-005-API', 'Whop webhook procesa el evento SIN cabecera de firma',
    !rechaza ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `HTTP ${r.status} (sin whop-signature) · respuesta: ${r.text.slice(0, 150)}`);
}

// ── BUG-011b: el Hub no acepta una firma falsa como válida ──────────────────
{
  const r = await probe('POST', `${BASE}/api/webhooks/whop`,
    { action: 'payment.succeeded', data: { id: 'x', email: 'a@b.test' } },
    { 'whop-signature': 'firma-completamente-invalida-000' });
  const rechaza = r.status === 401 || r.status === 403;
  verdict('BUG-005b', 'El Hub rechaza una firma INVÁLIDA cuando sí se envía',
    rechaza ? 'FALSO POSITIVO' : 'CONFIRMADO',
    `HTTP ${r.status} · si NO da 401 es que la firma no se valida en absoluto`);
}

// ── BUG-007: el lobby devuelve pilotos/división fabricados ──────────────────
{
  const r = await probe('GET', `${BASE}/api/games/lobby?gameId=carreras`);
  if (r.status !== 200 || !r.json) {
    verdict('BUG-007-API', 'Lobby devuelve datos fabricados', 'PARCIAL', `HTTP ${r.status} · ${r.text.slice(0, 120)}`);
  } else {
    const body = JSON.stringify(r.json);
    const sospechosos = [];
    if (/"skillRating"\s*:\s*1850/.test(body)) sospechosos.push('skillRating 1850 hardcodeado');
    if (/DIVISIÓN ORO #3/.test(body)) sospechosos.push('divisionTier "DIVISIÓN ORO #3" hardcodeado');
    if (/"totalActiveInDivision"\s*:\s*6/.test(body)) sospechosos.push('totalActiveInDivision 6 fabricado');
    verdict('BUG-007-API', 'Lobby devuelve datos fabricados al usuario',
      sospechosos.length > 0 ? 'CONFIRMADO' : 'PARCIAL',
      sospechosos.length ? sospechosos.join(' · ') : `no se detectaron los valores fabricados · muestra: ${body.slice(0, 220)}`);
  }
}

// ── BUG-013: el registro no es atómico (verificación indirecta) ─────────────
{
  // Enviar un registro con email inválido: si falla a mitad, quedaría un usuario sin pasaporte.
  // NO lo probamos con datos reales; verificamos que el endpoint esté expuesto y su validación.
  const r = await probe('POST', `${BASE}/api/auth/register`, {
    username: 'zz', email: 'no-es-un-email', password: '123',
  });
  verdict('BUG-013-API', 'Validación del registro (prueba de robustez de entrada)',
    r.status === 400 ? 'FALSO POSITIVO' : 'PARCIAL',
    `HTTP ${r.status} con usuario corto + email inválido + password corta · ${r.text.slice(0, 160)}`);
}

console.log('\n' + '═'.repeat(72));
const counts = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
console.log('RESUMEN HTTP:', JSON.stringify(counts));
console.log('═'.repeat(72));
