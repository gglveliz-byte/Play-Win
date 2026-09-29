/**
 * Comprueba, con los servidores del usuario en marcha, dos cosas:
 *   1. Que el Hub sirve el HTML de space CON las pantallas reconstruidas.
 *   2. Si la sala en vivo avanza (los marcadores suben) o está congelada.
 */
const JUEGO = process.argv[2] || 'space';

const IDS = [
  'screen_title',
  'screen_gameover',
  'screen_pause',
  'btn_start',
  'btn_restart',
  'btn_menu',
  'btn_resume',
  'final_score',
  'final_best',
  'final_wave',
  'final_speed',
  'final_combo',
  'new_record_badge',
  'menu_best_val',
];

console.log('═══ HTML SERVIDO POR EL HUB ═══');
try {
  const html = await fetch(`http://localhost:3000/games/${JUEGO}/index.html`, { signal: AbortSignal.timeout(8000) }).then((r) => r.text());
  console.log(`  ${html.length} bytes`);
  let presentes = 0;
  for (const id of IDS) {
    const hay = html.includes(`id="${id}"`);
    if (hay) presentes++;
    console.log(`  ${hay ? '✅' : '❌'} ${id}`);
  }
  console.log(`\n  ${presentes}/${IDS.length} pantallas y botones presentes`);
} catch (err) {
  console.log(`  ❌ ${err.message}`);
}

console.log('\n═══ SALA EN VIVO (12 s de observación) ═══');
let previo = null;
for (let i = 0; i < 4; i++) {
  try {
    const h = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
    const sala = h.duels.rooms[0];
    if (!sala) {
      console.log(`  [${i}] sin salas activas (cola: ${h.duels.waitingPlayersTotal})`);
    } else {
      const marca = `${sala.scoreA}/${sala.scoreB}`;
      const avanzo = previo !== null && previo !== marca;
      console.log(
        `  [${i}] ${sala.gameId} [${sala.status}] ${sala.playerA} ${sala.scoreA} vs ${sala.scoreB} ${sala.playerB}` +
          (previo === null ? '' : avanzo ? '  ← AVANZA' : '  ← SIN CAMBIO')
      );
      previo = marca;
    }
  } catch (err) {
    console.log(`  [${i}] error: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
console.log('');
