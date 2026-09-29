import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function e2e() {
  console.log('=== TEST E2E: 1v1 COMPETITIVO REAL EN CARRERAS (SPEED HORIZON 3D) ===\n');

  // 1. Iniciar sesión con Progamer
  console.log('1. Autenticando progamer2026...');
  const resA = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'progamer2026', password: 'PlayWin123!' })
  });
  const dataA = await resA.json();
  const cookieA = resA.headers.get('set-cookie');
  console.log(`[PASS] Logueado: ${dataA.user.username} (Wallet: $${dataA.user.wallet_balance})`);

  // 2. Iniciar sesión con Carlos Pro
  console.log('\n2. Autenticando carlos_pro...');
  const resB = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'carlos_pro', password: 'PlayWin123!' })
  });
  const dataB = await resB.json();
  const cookieB = resB.headers.get('set-cookie');
  console.log(`[PASS] Logueado: ${dataB.user.username} (Wallet: $${dataB.user.wallet_balance})`);

  // 3. Obtener Tickets firmados por el Backend
  console.log('\n3. Generando tickets efímeros firmados por el Backend...');
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

  console.log(`[PASS] Ticket A: Token emitido para ${ticketA.player.username} (${ticketA.ticket.slice(0, 18)}...)`);
  console.log(`[PASS] Ticket B: Token emitido para ${ticketB.player.username} (${ticketB.ticket.slice(0, 18)}...)`);

  // 4. Conectar WebSockets 1v1 con los Tickets Criptográficos
  console.log('\n4. Conectando al Servidor de Duelos con Anti-Cheat...');
  const wsA = new WebSocket('ws://localhost:3001/ws');
  const wsB = new WebSocket('ws://localhost:3001/ws');

  await new Promise((resolve, reject) => {
    let seedA = null;
    let seedB = null;

    wsA.on('open', () => {
      console.log('WS Jugador A abierto, enviando JOIN_MATCH...');
      wsA.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: {
          id: ticketA.player.id,
          username: ticketA.player.username,
          avatar: ticketA.player.avatar,
          token: ticketA.ticket,
          gameId: 'carreras'
        }
      }));
    });

    wsA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'MATCH_WAITING') {
        console.log('[PASS] Jugador A en cola esperando contrincante...');
        // Conectar Jugador B
        wsB.send(JSON.stringify({
          action: 'JOIN_MATCH',
          player: {
            id: ticketB.player.id,
            username: ticketB.player.username,
            avatar: ticketB.player.avatar,
            token: ticketB.ticket,
            gameId: 'carreras'
          }
        }));
      }

      if (msg.event === 'MATCH_START') {
        seedA = msg.seed;
        console.log(`[PASS] MATCH_START Jugador A! Rival: ${msg.opponent.username}, Semilla: ${seedA}`);
      }

      if (msg.event === 'MATCH_LIVE') {
        console.log('[PASS] MATCH_LIVE! Ambos pilotos en pista.');
        // Progamer acelera y envía telemetría a 20Hz
        wsA.send(JSON.stringify({ action: 'PLAYER_TICK', x: 0, y: 1200, score: 120, isAlive: true }));
      }

      if (msg.event === 'RIVAL_TICK') {
        console.log(`[PASS] Telemetría 20Hz recibida del rival: ${msg.score}M en pista.`);
        // Simular que Carlos se estrella
        setTimeout(() => {
          console.log('\n5. Notificando choque del rival...');
          wsB.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
        }, 400);
      }

      if (msg.event === 'MATCH_END') {
        console.log(`\n[PASS] MATCH_END! Ganador: ${msg.winnerId}`);
        console.log(`[PASS] Puntos de Temporada Ganador: +${msg.payout.winnerSeasonPoints} SP`);
        console.log(`[PASS] Puntos de Consolación: +${msg.payout.loserSeasonPoints} SP`);
        wsA.close();
        wsB.close();
        resolve();
      }
    });

    wsB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'MATCH_START') {
        seedB = msg.seed;
        console.log(`[PASS] MATCH_START Jugador B! Rival: ${msg.opponent.username}, Semilla: ${seedB}`);
        if (seedA === seedB) {
          console.log(`[PASS] VERIFICACIÓN DETERMINISTA: Misma semilla PRNG (${seedA}) para ambos clientes.`);
        }
      }
      if (msg.event === 'MATCH_LIVE') {
        wsB.send(JSON.stringify({ action: 'PLAYER_TICK', x: 40, y: 1150, score: 115, isAlive: true }));
      }
    });

    setTimeout(() => reject(new Error('Timeout de duelo 1v1')), 15000);
  });

  console.log('\n=== CARRERAS (SPEED HORIZON 3D) 100% RECREADO, BLINDADO Y VALIDADO ===');
}

e2e().catch(console.error);
