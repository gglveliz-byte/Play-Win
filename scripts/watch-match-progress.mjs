/**
 * ¿La sala en vivo recibe telemetría? Distingue "el motor no arranca" de
 * "arranca pero no envía ticks" observando si los marcadores del servidor suben.
 * Solo lectura.
 */
console.log('═══ ¿AVANZA LA PARTIDA EN VIVO? ═══\n');

let lecturas = 0;
let cambios = 0;
let anterior = null;
const muestras = [];

for (let i = 0; i < 8; i++) {
  try {
    const h = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    const sala = h.duels.rooms[0];
    if (sala) {
      lecturas++;
      const clave = `${sala.scoreA}|${sala.scoreB}`;
      const cambio = anterior !== null && anterior !== clave;
      if (cambio) cambios++;
      anterior = clave;
      muestras.push(`${sala.scoreA} vs ${sala.scoreB}`);
      process.stdout.write(`  [${i * 2}s] ${sala.status} · ${sala.playerA} ${sala.scoreA} vs ${sala.scoreB} ${sala.playerB}${cambio ? '  ← AVANZA' : ''}\n`);
    } else {
      process.stdout.write(`  [${i * 2}s] sin salas activas (cola: ${h.duels.waitingPlayersTotal})\n`);
    }
  } catch (err) {
    process.stdout.write(`  [${i * 2}s] error: ${err.message}\n`);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('\n═══ VEREDICTO ═══');
console.log(`  Lecturas con sala: ${lecturas} · cambios de marcador: ${cambios}`);
if (cambios > 0) {
  console.log('  ✅ El motor arranca y ENVÍA telemetría. La vinculación funciona.');
} else if (lecturas > 0) {
  console.log('  ❌ La sala existe pero NADIE envía telemetría.');
  console.log('     El motor del juego no está llamando a sendTick():');
  console.log('     o no arrancó (onMatchLive no llegó) o el bucle está detenido.');
  console.log('     En el navegador: recarga con Ctrl+Shift+R y mira la consola (F12).');
} else {
  console.log('  · No hay partida en curso que analizar.');
}
console.log('');
