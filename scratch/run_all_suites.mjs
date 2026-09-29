/**
 * Runner de suites con timeout por suite y salida en vivo.
 * Se ejecuta desde la raíz del repositorio para que npm encuentre package.json.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const SUITES = [
  ['test:governance', 60_000],
  ['test:db', 90_000],
  ['test:duel', 90_000],
  ['test:anticheat', 90_000],
  ['test:cyber', 90_000],
  ['test:treasury', 120_000],
  ['test:email', 120_000],
  ['test:history', 90_000],
  ['test:e2e', 150_000],
];

const ROOT = process.cwd();

function runSuite(script, timeoutMs) {
  return new Promise((resolve) => {
    // shell:true es necesario en Windows para resolver npm.cmd
    const child = spawn('npm', ['run', script], {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let settled = false;
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ script, status: 'TIMEOUT', code: null, output });
    }, timeoutMs);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ script, status: code === 0 ? 'PASS' : 'FAIL', code, output });
    });
  });
}

console.log(`Ejecutando ${SUITES.length} suites desde ${ROOT}\n${'─'.repeat(72)}`);

const results = [];
for (const [script, timeout] of SUITES) {
  process.stdout.write(`${script.padEnd(18)} ... `);
  const r = await runSuite(script, timeout);
  results.push(r);
  const icon = r.status === 'PASS' ? '✅' : r.status === 'TIMEOUT' ? '⏱️' : '❌';
  console.log(`${icon} ${r.status}${r.code !== null ? ` (exit ${r.code})` : ''}`);
}

console.log('\n' + '═'.repeat(72));
console.log('RESUMEN');
console.log('═'.repeat(72));
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'TIMEOUT' ? '⏱️' : '❌';
  console.log(`  ${icon} ${r.script.padEnd(18)} ${r.status}`);
}

const fallidas = results.filter((r) => r.status !== 'PASS');
console.log(`\n  Aprobadas: ${results.length - fallidas.length}/${results.length}`);

if (fallidas.length > 0) {
  console.log('\n' + '═'.repeat(72));
  console.log('DETALLE DE LAS FALLIDAS');
  console.log('═'.repeat(72));
  for (const r of fallidas) {
    console.log(`\n───── ${r.script} (${r.status}) ─────`);
    const lines = r.output
      .split(/\r?\n/)
      .filter((l) => l.trim() && !/SECURITY WARNING|sslmode|libpq|trace-warnings|prepare for this change|current behavior|docs\/current/.test(l));
    console.log(lines.slice(-25).join('\n'));
  }
}

process.exit(fallidas.length > 0 ? 1 : 0);
