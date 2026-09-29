import { WebSocket } from 'ws';

/**
 * Test de Verificación Quirúrgica: Duelo 1v1 en Tiempo Real
 * Valida: Conexión -> Matchmaking -> Semilla Idéntica -> Conteo 3s -> MATCH_LIVE -> Ticks -> Muerte Súbita -> Fin de Partida
 */
const WS_URL = 'ws://localhost:3001/ws';

const testGameId = `test_duel_${Date.now()}`;
console.log(`🧪 Iniciando prueba automatizada de salas 1v1 (Game: ${testGameId})...`);

const ws1 = new WebSocket(WS_URL);
let ws2 = null;

let matchStartCount = 0;
let seed1 = null;
let seed2 = null;

ws1.on('open', () => {
  console.log('✅ Cliente 1 conectado. Encolando...');
  ws1.send(
    JSON.stringify({
      action: 'JOIN_MATCH',
      player: {
        id: 'usr_test_1',
        username: 'BatiRojo',
        avatar: 'bat_red.webp',
        gameId: testGameId,
        rank: 'ORO',
      },
    })
  );
});

ws1.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.event === 'MATCH_WAITING') {
    console.log('⏳ Cliente 1 en espera de rival. Conectando Cliente 2...');
    ws2 = new WebSocket(WS_URL);

    ws2.on('open', () => {
      console.log('✅ Cliente 2 conectado. Encolando para emparejar...');
      ws2.send(
        JSON.stringify({
          action: 'JOIN_MATCH',
          player: {
            id: 'usr_test_2',
            username: 'BatiAzul',
            avatar: 'bat_blue.webp',
            gameId: testGameId,
            rank: 'ORO',
          },
        })
      );
    });

    ws2.on('message', (raw2) => {
      const msg2 = JSON.parse(raw2.toString());

      if (msg2.event === 'MATCH_START') {
        matchStartCount++;
        seed2 = msg2.seed;
        console.log(`🎯 Cliente 2 recibió MATCH_START. Semilla: ${seed2}. Rival: ${msg2.opponent.username}`);
        checkBothStarted();
      }

      if (msg2.event === 'MATCH_LIVE') {
        console.log('🏁 Partida en VIVO para Cliente 2. Enviando PLAYER_TICK...');
        ws2.send(
          JSON.stringify({
            action: 'PLAYER_TICK',
            x: 100,
            y: 250,
            score: 15,
            isAlive: true,
          })
        );
      }
    });
  }

  if (msg.event === 'MATCH_START') {
    matchStartCount++;
    seed1 = msg.seed;
    console.log(`🎯 Cliente 1 recibió MATCH_START. Semilla: ${seed1}. Rival: ${msg.opponent.username}`);
    checkBothStarted();
  }

  if (msg.event === 'MATCH_LIVE') {
    console.log('🏁 Partida en VIVO para Cliente 1.');
  }

  if (msg.event === 'RIVAL_TICK') {
    console.log(`📡 Cliente 1 recibió RIVAL_TICK desde Cliente 2 (y=${msg.y}, score=${msg.score})`);
    setTimeout(() => {
      if (ws2 && ws2.readyState === WebSocket.OPEN) {
        console.log('💥 Simulando choque de Cliente 2 (PLAYER_CRASHED)...');
        ws2.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
      }
    }, 200);
  }

  if (msg.event === 'MATCH_END') {
    console.log('🏆 Cliente 1 recibió MATCH_END:', msg.reason, '| Ganador (Neon UUID):', msg.winnerId);
    if (msg.winnerId && msg.payout.winnerSeasonPoints === 100) {
      console.log('🎉 ¡PRUEBA EXITOSA! Ambos clientes sincronizados, victoria y puntos validados al 100%.');
      ws1.close();
      if (ws2) ws2.close();
      setTimeout(() => process.exit(0), 1000); // Dar 1s para que la promesa de Neon complete
    } else {
      console.error('❌ Error en el resultado de la partida');
      process.exit(1);
    }
  }
});

function checkBothStarted() {
  if (matchStartCount === 2) {
    if (seed1 === seed2) {
      console.log(`🔒 ¡VERIFICACIÓN DE SEMILLA EXITOSA! Ambos clientes tienen la misma semilla: ${seed1}`);
    } else {
      console.error(`❌ Las semillas no coinciden: ${seed1} !== ${seed2}`);
      process.exit(1);
    }
  }
}
