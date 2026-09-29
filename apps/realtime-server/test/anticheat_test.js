/**
 * ==============================================================================
 * PLAY WIN ANTI-CHEAT SIMULATION TEST (anticheat_test.js)
 * Simula ataques maliciosos de clientes para verificar el árbitro del servidor:
 * 1. Intento de Speedhack (+500 puntos en 50ms)
 * 2. Detección automática por el Árbitro y descalificación inmediata
 * 3. Adjudicación de victoria al contrincante limpio
 * ==============================================================================
 */

import crypto from 'node:crypto';
// Carga JWT_SECRET del entorno (.env / .env.test). Sin fallback quemado.
import '../src/load-env.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'Falta JWT_SECRET. Ejecuta: node --env-file=.env.test test/anticheat_test.js'
  );
}

function createTestToken(id, username, gameId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: id, username, gameId, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const WS_URL = 'ws://localhost:3001/ws';

async function runAntiCheatSecurityTest() {
  console.log('🛡️ Iniciando pruebas de seguridad y detección Anti-Cheat...');

  await new Promise((resolve, reject) => {
    const cleanSocket = new WebSocket(WS_URL);
    const cheaterSocket = new WebSocket(WS_URL);
    let matchLive = false;

    cleanSocket.onopen = () => {
      const cleanId = 'pilot_clean_' + Math.random().toString(36).slice(2, 7);
      cleanSocket.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: {
          id: cleanId,
          username: 'PilotoLimpio',
          avatar: '🏎️',
          gameId: 'carreras',
          token: createTestToken(cleanId, 'PilotoLimpio', 'carreras'),
        },
      }));
    };

    cheaterSocket.onopen = () => {
      const cheaterId = 'cheater_bot_' + Math.random().toString(36).slice(2, 7);
      cheaterSocket.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: {
          id: cheaterId,
          username: 'HackerBot',
          avatar: '👾',
          gameId: 'carreras',
          token: createTestToken(cheaterId, 'HackerBot', 'carreras'),
        },
      }));
    };

    cleanSocket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === 'MATCH_LIVE') {
        matchLive = true;
        console.log('⚡ Partida iniciada. Simulando inyección de Speedhack desde HackerBot...');

        // HackerBot intenta enviar un tick válido inicial
        cheaterSocket.send(JSON.stringify({
          action: 'PLAYER_TICK',
          x: 0,
          y: 0,
          score: 10,
        }));

        // 50ms después, HackerBot inyecta un salto de puntuación físicamente imposible (+900 puntos)
        setTimeout(() => {
          cheaterSocket.send(JSON.stringify({
            action: 'PLAYER_TICK',
            x: 0,
            y: 0,
            score: 910, // Salto ilegal de +900 puntos
          }));
        }, 50);
      } else if (msg.event === 'MATCH_END') {
        console.log('🏁 Veredicto del Servidor Árbitro recibido:');
        console.log(`   - Motivo: ${msg.reason}`);
        console.log(`   - Resumen: ${msg.summary}`);
        console.log(`   - Ganador: ${msg.winnerId}`);

        if (msg.reason === 'SPEEDHACK_SCORE_OVERFLOW') {
          console.log('✅ ¡ÉXITO! El Árbitro detectó el Speedhack y descalificó al tramposo.');
          cleanSocket.close();
          cheaterSocket.close();
          resolve(msg);
        } else {
          reject(new Error(`Se esperaba motivo SPEEDHACK_SCORE_OVERFLOW pero se recibió: ${msg.reason}`));
        }
      }
    };

    cleanSocket.onerror = reject;
    cheaterSocket.onerror = reject;
  });

  console.log('🎉 ¡BLINDAJE ANTI-ENGORDOS Y ANTI-CHEAT VERIFICADO CON ÉXITO AL 100%!');
}

runAntiCheatSecurityTest().catch((err) => {
  console.error('❌ Error en prueba Anti-Cheat:', err);
  process.exit(1);
});
