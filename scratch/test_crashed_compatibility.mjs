import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function testScenario() {
  console.log('=== TEST: COMPATIBILIDAD PLAYER_CRASHED EN CARRERAS (HIGHER DISTANCE WINS) ===\n');

  const resA = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'progamer2026', password: 'PlayWin123!' })
  });
  const dataA = await resA.json();
  const cookieA = resA.headers.get('set-cookie');

  const resB = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'carlos_pro', password: 'PlayWin123!' })
  });
  const dataB = await resB.json();
  const cookieB = resB.headers.get('set-cookie');

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

  const wsA = new WebSocket('ws://localhost:3001/ws');
  const wsB = new WebSocket('ws://localhost:3001/ws');

  await new Promise((resolve, reject) => {
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
        wsA.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 350, score: 35, isAlive: true }));
      }

      if (msg.event === 'MATCH_END') {
        console.log(`[MATCH_END] Ganador: ${msg.winnerId}, Resumen: ${msg.summary}`);
        if (msg.winnerId === ticketB.player.id) {
          console.log('✅ [ÉXITO] carlos_pro con 109m ganó a pesar de que el evento fue PLAYER_CRASHED.');
        } else {
          console.error('❌ [FALLO] No ganó el de mayor distancia.');
        }
        wsA.close();
        wsB.close();
        resolve();
      }
    });

    wsB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'MATCH_LIVE') {
        wsB.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 1090, score: 109, isAlive: true }));
        setTimeout(() => {
          wsB.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
        }, 500);
      }
    });

    setTimeout(() => reject(new Error('Timeout')), 10000);
  });
}

testScenario().catch(console.error);
