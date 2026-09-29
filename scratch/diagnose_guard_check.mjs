/** Diagnóstico: por qué la comprobación BUG-025 no ve el disparador local. */
import fs from 'node:fs';

const archivo = 'apps/hub/public/games/carreras/script.js';
const lineas = fs.readFileSync(archivo, 'utf8').split('\n');

const ES_EVENTO = /(addEventListener\(|\.onclick\s*=|\.onmousedown\s*=|\.ontouchstart\s*=)/;
const ES_ARRANQUE = /(startRace\(\)|startGame\(\))/;

console.log(`Archivo: ${archivo} (${lineas.length} líneas)\n`);

for (let i = 0; i < lineas.length; i++) {
  if (!ES_ARRANQUE.test(lineas[i])) continue;

  const desde = Math.max(0, i - 12);
  const ventana = lineas.slice(desde, i + 1).join('\n');
  const esEvento = ES_EVENTO.test(ventana);
  const tieneGuardian = ventana.includes('canStartLocally');

  console.log(`L${i + 1}: ${lineas[i].trim()}`);
  console.log(`   ventana L${desde + 1}-L${i + 1}`);
  console.log(`   ¿parece manejador de evento? ${esEvento}`);
  console.log(`   ¿tiene guardián en la ventana? ${tieneGuardian}`);
  if (esEvento) {
    const lineaEvento = lineas.slice(desde, i + 1).find((l) => ES_EVENTO.test(l));
    console.log(`   -> línea que disparó ES_EVENTO: "${(lineaEvento || '').trim().slice(0, 70)}"`);
  }
  console.log('');
}
