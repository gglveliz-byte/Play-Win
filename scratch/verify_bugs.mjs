import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Verificador de bugs — PostgreSQL (SOLO LECTURA) + inspección de código.
 * La raíz del repo se ancla desde la ubicación del propio script, así funciona
 * sin importar desde qué carpeta se ejecute.
 */

// La raíz del repo se localiza subiendo hasta encontrar el package.json con `workspaces`.
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        if (JSON.parse(fs.readFileSync(candidate, 'utf8')).workspaces) return dir;
      } catch { /* package.json ilegible: seguir subiendo */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const p = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(p(rel));
const read = (rel) => fs.readFileSync(p(rel), 'utf8');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Falta DATABASE_URL. Ejecuta este script desde packages/database con `node --env-file=../../.env.test <script>`,\n' +
      'o expórtala en el entorno.'
  );
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });

const results = [];
function verdict(id, title, status, evidence) {
  results.push({ id, title, status, evidence });
  const icon = status === 'CONFIRMADO' ? '🔴' : status === 'FALSO POSITIVO' ? '✅' : '🟡';
  console.log(`${icon} ${id} [${status}] ${title}\n     ${evidence}`);
}

async function tryQuery(sql, params = []) {
  try {
    return { ok: true, rows: (await pool.query(sql, params)).rows };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

console.log(`ROOT = ${ROOT}\n${'─'.repeat(72)}`);

// ═══ BASE DE DATOS ═══════════════════════════════════════════════════════════

// BUG-004a/b: columnas inexistentes
{
  const bad = await tryQuery(`SELECT entry_type, COUNT(*) FROM wallet_ledger GROUP BY entry_type;`);
  const good = await tryQuery(`SELECT type, COUNT(*) FROM wallet_ledger GROUP BY type;`);
  verdict('BUG-004a', 'admin/metrics usa wallet_ledger.entry_type',
    !bad.ok && good.ok ? 'CONFIRMADO' : 'FALSO POSITIVO',
    !bad.ok ? `entry_type → "${bad.error}" | type → OK (${good.rows.length} tipos)` : 'entry_type SÍ existe');

  const badT = await tryQuery(`SELECT tier FROM league_groups LIMIT 1;`);
  const goodT = await tryQuery(`SELECT rank_tier FROM league_groups LIMIT 1;`);
  verdict('BUG-004b', 'admin/metrics usa league_groups.tier',
    !badT.ok && goodT.ok ? 'CONFIRMADO' : 'FALSO POSITIVO',
    !badT.ok ? `tier → "${badT.error}" | rank_tier → OK` : 'tier SÍ existe');
}

// BUG-004c: tipos de ledger que el panel busca
{
  const r = await tryQuery(`SELECT DISTINCT type FROM wallet_ledger ORDER BY type;`);
  const tipos = r.ok ? r.rows.map((x) => x.type) : [];
  const buscados = ['WHOP_DEPOSIT', 'LEAGUE_PRIZE'];
  const faltan = buscados.filter((t) => !tipos.includes(t));
  verdict('BUG-004c', 'Tipos que el panel consulta nunca se escriben',
    faltan.length === buscados.length ? 'CONFIRMADO' : 'PARCIAL',
    `En la BD: [${tipos.join(', ')}] · El panel busca: [${buscados.join(', ')}] · Faltan: [${faltan.join(', ')}]`);
}

// BUG-018-league-engine: ¿el sharding por MMR produce diversidad de divisiones?
{
  const r = await tryQuery(`SELECT rank_tier, COUNT(*)::int AS n FROM game_passports GROUP BY rank_tier;`);
  const tiers = r.ok ? r.rows : [];
  const soloBronce = tiers.length === 1 && tiers[0].rank_tier === 'BRONZE';
  const total = tiers.reduce((a, x) => a + x.n, 0);
  verdict('MMR-SHARDING', 'Todos los pasaportes caen en BRONZE (mapeo MMR→división ausente)',
    soloBronce && total > 5 ? 'CONFIRMADO' : 'PARCIAL',
    `${total} pasaportes en total · distribución: ${JSON.stringify(tiers)}`);
}

// BUG-011-ish: ¿is_locked se usa como "sellado a los 10"?
{
  const r = await tryQuery(`SELECT is_locked, COUNT(*)::int AS n FROM league_groups GROUP BY is_locked;`);
  const ocu = await tryQuery(`
    SELECT g.is_locked, COUNT(m.user_id)::int AS miembros
    FROM league_groups g LEFT JOIN league_members m ON m.league_id = g.id
    GROUP BY g.id, g.is_locked ORDER BY miembros DESC LIMIT 5;`);
  verdict('SELLADO-10', 'is_locked NO se activa al llegar a 10 miembros',
    ocu.ok && ocu.rows.some((x) => x.miembros >= 1 && x.is_locked === false) ? 'CONFIRMADO' : 'PARCIAL',
    `is_locked: ${JSON.stringify(r.rows)} · Ocupación top: ${JSON.stringify(ocu.rows)}`);
}

// Esquema: ¿existe ledger_entries?
{
  const r = await tryQuery(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;`);
  const names = r.ok ? r.rows.map((x) => x.table_name) : [];
  verdict('ESQUEMA', 'Tablas reales (¿existe ledger_entries?)',
    !names.includes('ledger_entries') ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `${names.length} tablas: ${names.join(', ')}`);
}

// ═══ CÓDIGO (rutas ancladas a ROOT) ══════════════════════════════════════════

// BUG-002: secretos quemados
{
  const files = [
    'apps/hub/src/lib/db/index.ts',
    'packages/database/src/index.js',
    'apps/hub/src/lib/auth.ts',
    'apps/realtime-server/src/anticheat.js',
    'apps/hub/src/app/api/webhooks/whop/route.ts',
    'apps/hub/src/app/api/cron/settle-leagues/route.ts',
  ];
  // Los patrones se construyen por concatenación a propósito: así este propio
  // archivo no contiene los secretos literales y no se marca a sí mismo.
  const patrones = [
    [new RegExp('npg_' + '[A-Za-z0-9]{6,}'), 'contraseña Neon'],
    [new RegExp('playwin_production' + '_jwt_secret'), 'JWT_SECRET'],
    [new RegExp('whop_webhook' + '_secret_production'), 'WHOP_SECRET'],
    [new RegExp('playwin_cron' + '_secret_settle'), 'CRON_SECRET'],
  ];
  const found = [];
  for (const f of files) {
    if (!exists(f)) { found.push(`${f}: (archivo no encontrado)`); continue; }
    const c = read(f);
    for (const [re, etiqueta] of patrones) {
      if (re.test(c)) found.push(`${f} → ${etiqueta}`);
    }
  }
  const reales = found.filter((x) => !x.includes('no encontrado'));
  verdict('BUG-002', 'Credenciales de producción quemadas en el código fuente',
    reales.length > 0 ? 'CONFIRMADO' : 'FALSO POSITIVO',
    reales.length ? reales.join('\n     ') : `sin coincidencias. Detalle: ${found.join(' | ')}`);

  const hubEnv = exists('apps/hub/.env.local') || exists('apps/hub/.env');
  verdict('BUG-002b', 'El Hub no tiene .env propio → usa los fallbacks quemados',
    !hubEnv ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `.env.local=${exists('apps/hub/.env.local')} · .env=${exists('apps/hub/.env')} · raíz .env=${exists('.env')}`);
}

// BUG-016: server.js sin --env-file ni manejo de EADDRINUSE
{
  const pkg = JSON.parse(read('apps/realtime-server/package.json'));
  const scripts = JSON.stringify(pkg.scripts || {});
  const tieneDotenv = !!(pkg.dependencies?.dotenv || pkg.devDependencies?.dotenv);
  const usaEnvFile = /--env-file/.test(scripts);
  const src = read('apps/realtime-server/src/server.js');
  const manejaError = /\.on\(\s*['"]error['"]/.test(src);
  verdict('BUG-016', 'server.js no carga .env ni maneja EADDRINUSE',
    !tieneDotenv && !usaEnvFile && !manejaError ? 'CONFIRMADO' : 'PARCIAL',
    `dotenv=${tieneDotenv} · --env-file=${usaEnvFile} · on('error')=${manejaError} · scripts=${scripts}`);
}

// BUG-003: capa de datos duplicada
{
  const svc = ['users', 'passports', 'matches', 'leagues', 'ledger'];
  const dup = svc.filter((n) => exists(`apps/hub/src/lib/db/${n}.ts`) && exists(`packages/database/src/services/${n}.js`));
  const hubPkg = JSON.parse(read('apps/hub/package.json'));
  const declara = !!hubPkg.dependencies?.['@playwin/database'];
  let importa = false;
  for (const dir of ['apps/hub/src/lib/db', 'apps/hub/src/app/api', 'apps/hub/src/components', 'apps/hub/src/lib']) {
    const walk = (d) => {
      if (!exists(d)) return;
      for (const it of fs.readdirSync(p(d))) {
        const rel = `${d}/${it}`;
        if (fs.statSync(p(rel)).isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(it) && read(rel).includes('@playwin/database')) importa = true;
      }
    };
    walk(dir);
  }
  verdict('BUG-003', 'Capa de datos duplicada Hub ↔ packages/database',
    dup.length === 5 && declara && !importa ? 'CONFIRMADO' : 'PARCIAL',
    `${dup.length}/5 servicios duplicados · declara la dep=${declara} · la importa=${importa}`);
}

// BUG-010: sin rate limiting en auth
{
  const dirs = ['apps/hub/src/app/api/auth', 'apps/hub/src/lib'];
  let hits = [];
  const walk = (d) => {
    if (!exists(d)) return;
    for (const it of fs.readdirSync(p(d))) {
      const rel = `${d}/${it}`;
      if (fs.statSync(p(rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(it)) {
        const c = read(rel);
        if (/rateLimit|rate_limit|rate-limit|tooManyRequests|429/.test(c)) hits.push(rel);
      }
    }
  };
  dirs.forEach(walk);
  verdict('BUG-010', 'Sin rate limiting en las rutas de autenticación',
    hits.length === 0 ? 'CONFIRMADO' : 'PARCIAL',
    hits.length ? `Archivos con rate limiting: ${hits.join(', ')}` : 'Cero referencias a rateLimit/429 en api/auth y lib');
}

// BUG-011: detectCollusion con guarda de NODE_ENV
{
  const src = read('apps/realtime-server/src/anticheat.js');
  const i = src.indexOf('SAME_IP_COLLUSION');
  const ventana = src.slice(Math.max(0, i - 320), i);
  const gated = /NODE_ENV\s*===\s*'production'/.test(ventana);
  verdict('BUG-011', 'detectCollusion (misma IP) solo activa en producción',
    gated ? 'CONFIRMADO' : 'FALSO POSITIVO',
    gated ? "La guarda NODE_ENV === 'production' precede a SAME_IP_COLLUSION" : 'no se halló la guarda');
}

// BUG-001 (estático): el webhook de PayPal no verifica firma
{
  const src = read('apps/hub/src/app/api/webhooks/paypal/route.ts');
  const verifica = /verify-webhook-signature|paypal-transmission|PAYPAL_WEBHOOK_ID|verifySignature/i.test(src);
  const acredita = /PAYMENT\.CAPTURE\.COMPLETED/.test(src) && /recordTransaction/.test(src);
  verdict('BUG-001', 'Webhook de PayPal acredita saldo sin verificar firma',
    !verifica && acredita ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `verifica firma=${verifica} · acredita saldo=${acredita}`);

  const wsrc = read('apps/hub/src/app/api/webhooks/whop/route.ts');
  const cond = /NODE_ENV\s*===\s*'production'\s*&&\s*signature/.test(wsrc);
  const timing = /timingSafeEqual/.test(wsrc);
  verdict('BUG-005', 'HMAC de Whop eludible (firma opcional + comparación no constante)',
    cond && !timing ? 'CONFIRMADO' : 'PARCIAL',
    `firma condicionada a NODE_ENV && signature=${cond} · usa timingSafeEqual=${timing}`);
}

// BUG-018-prevención
{
  const gov = read('test/code_protection_governance_test.mjs');
  const leeSkills = /SKILL\.md|\.agents\/skills|agents\\\\skills/i.test(gov);
  verdict('BUG-018P', 'No existe prueba de sincronía de skills',
    !leeSkills ? 'CONFIRMADO' : 'FALSO POSITIVO',
    leeSkills ? 'el test sí referencia las skills' : 'el test de gobernanza nunca lee .agents/skills');
}

// BUG-015: payout no llama a PayPal
{
  const src = read('apps/hub/src/app/api/payments/paypal/payout/route.ts');
  const llamaApi = /api-m\.paypal\.com|api\.paypal\.com|payments\/payouts/.test(src);
  verdict('BUG-015', 'payout debita saldo sin llamar a la API de PayPal',
    !llamaApi ? 'CONFIRMADO' : 'FALSO POSITIVO',
    `invoca la API de PayPal=${llamaApi}`);
}

console.log('\n' + '═'.repeat(72));
const counts = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
console.log('RESUMEN:', JSON.stringify(counts));
console.log('═'.repeat(72));

await pool.end();
