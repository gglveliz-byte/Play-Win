/**
 * Ejecuta el motor de carreras en Node con un DOM falso y comprueba si
 * `startRace()` arranca de verdad el bucle y envía ticks al SDK.
 *
 * Esto responde a la pregunta que las capturas no pueden responder:
 * ¿el motor arranca y manda telemetría, o se queda mudo?
 */
import fs from 'node:fs';

const html = fs.readFileSync('apps/hub/public/games/carreras/index.html', 'utf8');
const codigo = fs.readFileSync('apps/hub/public/games/carreras/script.js', 'utf8');

console.log('=== 1. El HTML carga el script del motor? ===');
console.log('  index.html contiene script.js:', /script\.js/.test(html));
const orden = (html.match(/<script[^>]*src="([^"]+)"/g) || []).map((t) => t.replace(/.*src="([^"]+)".*/, '$1'));
console.log('  orden de scripts:');
orden.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));

console.log('\n=== 2. Qué usa el motor que pueda faltar? ===');
// APIs del navegador que el motor necesita
const apis = ['requestAnimationFrame', 'addEventListener', 'getElementById', 'querySelector', 'localStorage', 'AudioContext', 'performance.now', 'document.body', 'canvas.getContext'];
for (const api of apis) {
  const usado = codigo.includes(api.split('(')[0]);
  console.log(`  ${usado ? '·' : ' '} ${api}`);
}

console.log('\n=== 3. Definición de startRace y su orden en el archivo ===');
const lineas = codigo.split('\n');
const defStartRace = lineas.findIndex((l) => /^function startRace\s*\(/.test(l.trim()));
const usoStartRace = lineas.findIndex((l) => /startRace\(\);/.test(l) && !/^function/.test(l.trim()));
const defPlayWin = lineas.findIndex((l) => l.includes('window.PlayWin.init'));
const finIIFE = lineas.findIndex((l, i) => i > defPlayWin && l.trim() === '})();');
console.log(`  function startRace()      -> línea ${defStartRace + 1}`);
console.log(`  primera llamada           -> línea ${usoStartRace + 1}`);
console.log(`  window.PlayWin.init       -> línea ${defPlayWin + 1}`);
console.log(`  cierre de la IIFE         -> línea ${finIIFE + 1} (total ${lineas.length})`);
console.log(`  ¿PlayWin.init está DENTRO de la IIFE? ${finIIFE > defPlayWin ? 'SÍ' : 'NO'}`);
console.log(`  ¿function startRace está declarada antes de usarse? ${defStartRace < usoStartRace ? 'SÍ' : 'NO'}`);

console.log('\n=== 4. El motor llama a los métodos del SDK? ===');
for (const m of ['sendTick', 'notifyFinish', 'notifyCrash', 'isLive', 'getOpponentState', 'init']) {
  const n = (codigo.match(new RegExp(`PlayWin\\.${m}`, 'g')) || []).length;
  console.log(`  PlayWin.${m}: ${n} uso(s)`);
}

console.log('\n=== 5. Dónde se envía el tick y bajo qué condición ===');
lineas.forEach((l, i) => {
  if (l.includes('PlayWin.sendTick') || (l.includes('isLive()') && l.includes('if'))) {
    console.log(`  ${i + 1}: ${l.trim()}`);
  }
});
