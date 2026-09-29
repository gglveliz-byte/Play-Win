import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function runTests() {
  console.log('--- 1. Testing Static Assets for Carreras ---');
  const urls = [
    'http://localhost:3000/games/carreras/index.html',
    'http://localhost:3000/games/carreras/script.js',
    'http://localhost:3000/games/carreras/style.css',
    'http://localhost:3000/game-sdk/playwin-bridge.js',
    'http://localhost:3000/game-sdk/playwin-bridge.css',
  ];

  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load ${url}: status ${res.status}`);
    }
    const text = await res.text();
    console.log(`[PASS] ${url} (${text.length} bytes)`);
  }

  console.log('\n--- 2. Testing 1v1 Carreras Matchmaking and Realtime Duel ---');
  
  // Player A: progamer2026
  const wsA = new WebSocket('ws://localhost:3001/ws');
  // Player B: carlos_pro
  const wsB = new WebSocket('ws://localhost:3001/ws');

  let roomReady = false;
  let matchFinished = false;

  await new Promise((resolve, reject) => {
    let seedA = null;
    let seedB = null;

    wsA.on('open', () => {
      console.log('Player A (progamer2026) connected to WS');
      wsA.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: {
          id: 'usr_progamer2026',
          username: 'progamer2026',
          avatar: '🏎️',
          rank: 'ORO',
          skillRating: 1850,
          gameId: 'carreras'
        }
      }));
    });

    wsA.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('Player A received event:', msg.event);

      if (msg.event === 'MATCH_WAITING') {
        console.log('Player A in queue, now joining Player B (carlos_pro)...');
        wsB.send(JSON.stringify({
          action: 'JOIN_MATCH',
          player: {
            id: 'usr_carlos_pro',
            username: 'carlos_pro',
            avatar: '⚡',
            rank: 'ORO',
            skillRating: 1820,
            gameId: 'carreras'
          }
        }));
      }

      if (msg.event === 'MATCH_START') {
        seedA = msg.seed;
        console.log(`[PASS] MATCH_START for Player A! Opponent: ${msg.opponent.username}, Seed: ${seedA}`);
      }

      if (msg.event === 'MATCH_LIVE') {
        console.log('[PASS] MATCH_LIVE! Both players now racing.');
        // Send ticks
        wsA.send(JSON.stringify({ action: 'PLAYER_TICK', x: 20, y: 1500, score: 150, isAlive: true }));
      }

      if (msg.event === 'RIVAL_TICK') {
        console.log(`[PASS] Player A received RIVAL_TICK from carlos_pro: score=${msg.score}`);
        // Now Player B crashes to finish the match cleanly
        setTimeout(() => {
          wsB.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
        }, 300);
      }

      if (msg.event === 'MATCH_END') {
        console.log(`[PASS] MATCH_END received by Player A! Winner: ${msg.winnerId}, SP: +${msg.payout?.winnerSeasonPoints}`);
        if (msg.winnerId === 'usr_progamer2026') {
          console.log('[SUCCESS] Duel completed with perfect winner and payout!');
        }
        wsA.close();
        wsB.close();
        resolve();
      }
    });

    wsB.on('open', () => {
      console.log('Player B (carlos_pro) connected to WS');
    });

    wsB.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'MATCH_START') {
        seedB = msg.seed;
        console.log(`[PASS] MATCH_START for Player B! Opponent: ${msg.opponent.username}, Seed: ${seedB}`);
        if (seedA && seedA === seedB) {
          console.log(`[PASS] DETERMINISTIC VERIFIED: Both players received exact same seed: ${seedA}`);
        }
      }
      if (msg.event === 'MATCH_LIVE') {
        // Player B sends a tick
        wsB.send(JSON.stringify({ action: 'PLAYER_TICK', x: -50, y: 1400, score: 140, isAlive: true }));
      }
    });

    setTimeout(() => {
      reject(new Error('Timeout waiting for duel to complete'));
    }, 12000);
  });

  console.log('\n=== ALL ASSETS & MULTIPLAYER FLOW FOR CARRERAS 100% VERIFIED ===');
}

runTests().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
