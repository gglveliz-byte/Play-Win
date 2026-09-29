import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function testScenario() {
  console.log('=== TEST: VERIFICACIÓN GANADOR POR DISTANCIA (109M VS 20M) Y FINISH ===\n');

  // 1. Iniciar sesión con Progamer
  const resA = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'progamer2026', password: 'PlayWin123!' })
  });
  const dataA = await resA.json();
  const cookieA = resA.headers.get('set-cookie');

  // 2. Iniciar sesión con Carlos Pro
  const resB = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'carlos_pro', password: 'PlayWin123!' })
  });
  const dataB = await resB.json();
  const cookieB = resB.headers.get('set-cookie');

  // 3. Obtener Tickets
  const ticketResA = await fetch('http://localhost:3000/api/games/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieA || '' },
    body: JSON.stringify({ gameId: 'carreras' })
  });
  const ticketA = await ticketResA.json();

  const ticketResB = await fetch('http://localhost:3000/api/games/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieB || '' },
    body: JSON.stringify({ gameId: 'carreras' })
  });
  const ticketB = await ticketResB.json();

  console.log(`[AUTH] Piloto A: ${ticketA.player.username} (ID: ${ticketA.player.id})`);
  console.log(`[AUTH] Piloto B: ${ticketB.player.username} (ID: ${ticketB.player.id})`);

  const wsA = new WebSocket('ws://localhost:3001/ws');
  const wsB = new WebSocket('ws://localhost:3001/ws');

  await new Promise((resolve, reject) => {
    let matchEnded = false;

    wsA.on('open', () => {
      wsA.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: { ...ticketA.player, token: ticketA.ticket, gameId: 'carreras' }
      }));
    });

    wsA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'MATCH_WAITING') {
        wsB.send(JSON.stringify({
          action: 'JOIN_MATCH',
          player: { ...ticketB.player, token: ticketB.ticket, gameId: 'carreras' }
        }));
      }

      if (msg.event === 'MATCH_LIVE') {
        console.log('[MATCH_LIVE] Duelo iniciado en pista.');
        // Progamer solo recorre 20 metros (se quedó rezagado o desenfocado)
        wsA.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 200, score: 20, isAlive: true }));
      }

      if (msg.event === 'MATCH_END') {
        console.log('\n[MATCH_END RECIBIDO POR PILOTO A]');
        console.log(`- Ganador: ${msg.winnerId}`);
        console.log(`- Razón: ${msg.reason}`);
        console.log(`- Resumen: ${msg.summary}`);
        console.log(`- Puntos ganador: +${msg.payout.winnerSeasonPoints} SP`);

        if (msg.winnerId === ticketB.player.id) {
          console.log('\n✅ [ÉXITO TOTAL] carlos_pro (109m) venció correctamente a progamer2026 (20m).');
        } else {
          console.error('\n❌ [FALLO] El jugador de menor distancia fue declarado ganador erróneamente.');
        }

        matchEnded = true;
        wsA.close();
        wsB.close();
        resolve();
      }
    });

    wsB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'MATCH_LIVE') {
        // Carlos recorre 109 metros activamente
        wsB.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 1090, score: 109, isAlive: true }));

        // Carlos termina el recorrido (tiempo agotado o meta) reportando 109m con PLAYER_FINISH
        setTimeout(() => {
          console.log('[FINISH] carlos_pro envía PLAYER_FINISH con score 109m...');
          wsB.send(JSON.stringify({ action: 'PLAYER_FINISH', score: 109 }));
        }, 500);
      }
    });

    setTimeout(() => {
      if (!matchEnded) {
        wsA.close();
        wsB.close();
        reject(new Error('Timeout esperando MATCH_END'));
      }
    }, 10000);
  });
}

testScenario().catch(console.error);
