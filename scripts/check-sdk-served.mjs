/**
 * Comprueba que el Hub sirve el SDK con la versión de caché correcta y que el
 * servidor de duelos está operativo. Sirve para confirmar de un vistazo que lo
 * que ve el navegador coincide con lo que hay en el repositorio.
 */
import fs from 'node:fs';

const VERSION_ESPERADA = '4';
const JUEGOS = ['carreras', 'flapy-flapy', 'space'];

console.log('═══ SERVIDOR DE DUELOS (:3001) ═══');
try {
  const h = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(8000) }).then((r) => r.json());
  console.log(`  EN LÍNEA · uptime ${h.uptimeSeconds}s · bots: ${(h.config || {}).ghostBotsEnabled}`);
  console.log(`  salas: ${h.duels.activeRoomCount} (humanas ${h.duels.humanMatchCount} · bot ${h.duels.ghostMatchCount}) · cola: ${h.duels.waitingPlayersTotal}`);
  for (const r of h.duels.rooms) {
    console.log(`    · ${r.roomId} [${r.status}] ${r.playerA} ${r.scoreA} vs ${r.scoreB} ${r.playerB}`);
  }
} catch (err) {
  console.log(`  ❌ NO responde: ${err.message}`);
}

console.log('\n═══ HTML SERVIDO POR EL HUB (:3000) ═══');
for (const juego of JUEGOS) {
  try {
    const html = await fetch(`http://localhost:3000/games/${juego}/index.html`, {
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.text());
    const tags = html.match(/<script src="\/game-sdk\/[^"]+"/g) || [];
    const conVersion = tags.filter((t) => t.includes(`v=${VERSION_ESPERADA}`)).length;
    const estado = tags.length === 4 && conVersion === 4 ? '✅' : '⚠️ ';
    console.log(`  ${estado} ${juego.padEnd(12)} ${tags.length} scripts · ${conVersion} con ?v=${VERSION_ESPERADA}`);
    if (tags.length !== 4) {
      for (const t of tags) console.log(`        ${t}`);
    }
  } catch (err) {
    console.log(`  ❌ ${juego}: ${err.message}`);
  }
}

console.log('\n═══ FICHEROS LOCALES vs SERVIDOS ═══');
for (const nombre of ['playwin-bridge.js', 'playwin-bridge-connection.js', 'playwin-bridge-status.js', 'playwin-bridge-ui.js', 'playwin-bridge.css']) {
  const rutaPkg = `packages/game-sdk/${nombre}`;
  const rutaHub = `apps/hub/public/game-sdk/${nombre}`;
  const iguales = fs.existsSync(rutaPkg) && fs.existsSync(rutaHub) && fs.readFileSync(rutaPkg, 'utf8') === fs.readFileSync(rutaHub, 'utf8');
  console.log(`  ${iguales ? '✅' : '❌'} ${nombre.padEnd(32)} ${iguales ? 'idénticos' : 'DIFIEREN: ejecuta npm run sync:sdk'}`);
}
