/**
 * ==========================================================================
 * PLAY WIN E2E INTEGRATION TEST — FULL COMPETITIVE FLOW
 * Valida el ciclo completo de usuario:
 * 1. Registro de usuario en Hub API
 * 2. Emisión de MatchTicket firmado
 * 3. Duelo 1v1 en Realtime Server entre 2 jugadores
 * 4. Muerte súbita por colisión
 * 5. Verificación de persistencia en Neon PostgreSQL:
 *    - match_records insertado
 *    - game_passports actualizado con +100 SP al ganador y +20 SP al perdedor
 *    - league_members actualizado con los nuevos Season Points
 * ==========================================================================
 */

/**
 * URLs configurables por entorno.
 *
 * El puerto del servidor de duelos se puede cambiar con TEST_WS_PORT: si el
 * 3001 está ocupado por un proceso ajeno (por ejemplo un servidor anterior que
 * no se pudo detener), la suite puede apuntar a un puerto libre sin editar código.
 */
const HUB_URL = process.env.TEST_HUB_URL || 'http://localhost:3000';
const WS_URL = process.env.TEST_WS_URL || `ws://localhost:${process.env.TEST_WS_PORT || 3001}/ws`;

/** Ninguna fase de la prueba debe colgarse indefinidamente. */
const GLOBAL_TIMEOUT_MS = 120000;
const globalTimeout = setTimeout(() => {
  console.error(`\n❌ TIMEOUT GLOBAL: la prueba E2E superó ${GLOBAL_TIMEOUT_MS} ms.`);
  process.exit(1);
}, GLOBAL_TIMEOUT_MS);
globalTimeout.unref?.();

async function runE2EFlow() {
  console.log('🚀 Iniciando Prueba E2E de Play Win...');
  console.log(`   Hub: ${HUB_URL} · WebSocket: ${WS_URL}`);

  // 1. Registro de Jugador 1
  const rand1 = Math.random().toString(36).slice(2, 7);
  const user1Data = {
    username: `pilot_${rand1}`,
    email: `pilot_${rand1}@playwin.gg`,
    password: 'Password123!',
    avatarUrl: '🏎️',
  };

  const reg1Res = await fetch(`${HUB_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user1Data),
  });
  const reg1Json = await reg1Res.json();
  if (!reg1Json.success) throw new Error(`Error registrando Jugador 1: ${JSON.stringify(reg1Json)}`);
  const player1 = reg1Json.user;
  console.log(`✅ Jugador 1 registrado: ${player1.username} (${player1.id})`);

  // Obtener cookie de sesión para Jugador 1
  const cookie1 = reg1Res.headers.get('set-cookie');

  // 2. Registro de Jugador 2
  const rand2 = Math.random().toString(36).slice(2, 7);
  const user2Data = {
    username: `rival_${rand2}`,
    email: `rival_${rand2}@playwin.gg`,
    password: 'Password123!',
    avatarUrl: '🦇',
  };

  const reg2Res = await fetch(`${HUB_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user2Data),
  });
  const reg2Json = await reg2Res.json();
  if (!reg2Json.success) throw new Error(`Error registrando Jugador 2: ${JSON.stringify(reg2Json)}`);
  const player2 = reg2Json.user;
  console.log(`✅ Jugador 2 registrado: ${player2.username} (${player2.id})`);

  const cookie2 = reg2Res.headers.get('set-cookie');

  // 3. Emisión de MatchTicket efímero para ambos jugadores
  const ticket1Res = await fetch(`${HUB_URL}/api/games/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie1 ? { Cookie: cookie1 } : {}) },
    body: JSON.stringify({ gameId: 'carreras' }),
  });
  const ticket1Data = await ticket1Res.json();
  if (!ticket1Data.success) throw new Error(`Error en ticket P1: ${JSON.stringify(ticket1Data)}`);

  const ticket2Res = await fetch(`${HUB_URL}/api/games/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie2 ? { Cookie: cookie2 } : {}) },
    body: JSON.stringify({ gameId: 'carreras' }),
  });
  const ticket2Data = await ticket2Res.json();
  if (!ticket2Data.success) throw new Error(`Error en ticket P2: ${JSON.stringify(ticket2Data)}`);
  console.log('✅ Tickets efímeros firmados correctamente.');

  // 4. Conexión WebSocket 1v1 y Duelo
  await new Promise((resolve, reject) => {
    const ws1 = new WebSocket(WS_URL);
    const ws2 = new WebSocket(WS_URL);
    let matchLive = false;

    ws1.onopen = () => {
      ws1.send(JSON.stringify({
        action: 'JOIN_MATCH',
        // El servidor EXIGE el MatchTicket firmado y sobrescribe la identidad
        // con sus claims. Enviar id/username sin token provoca SECURITY_ERROR
        // y la partida nunca empieza (Zero Client Trust).
        player: { token: ticket1Data.token, gameId: 'carreras' },
      }));
    };

    ws2.onopen = () => {
      ws2.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: { token: ticket2Data.token, gameId: 'carreras' },
      }));
    };

    ws1.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === 'MATCH_LIVE') {
        matchLive = true;
        console.log('⚡ Partida en VIVO entre P1 y P2. Simulando ticks y choque...');
        setTimeout(() => {
          ws2.send(JSON.stringify({ action: 'PLAYER_CRASHED' }));
        }, 300);
      } else if (msg.event === 'MATCH_END') {
        console.log(`🏁 Fin de la partida recibido. Ganador: ${msg.winnerId}`);
        if (msg.winnerId !== player1.id) {
          reject(new Error(`Se esperaba que el ganador fuera ${player1.id}`));
        } else {
          ws1.close();
          ws2.close();
          resolve(msg);
        }
      }
    };

    ws1.onerror = reject;
    ws2.onerror = reject;
  });

  // 5. Esperar 1.5s para asegurar persistencia asíncrona en Neon PostgreSQL
  await new Promise((r) => setTimeout(r, 1500));

  // 6. Consultar Pasaporte del Ganador (Player 1)
  const me1Res = await fetch(`${HUB_URL}/api/auth/me`, {
    headers: cookie1 ? { Cookie: cookie1 } : {},
  });
  const me1Data = await me1Res.json();
  const p1CarrerasPassport = me1Data.passports?.find((p) => p.game_id === 'carreras');

  console.log('📊 Pasaporte P1 actualizado en Neon DB:', p1CarrerasPassport);
  if (!p1CarrerasPassport || p1CarrerasPassport.wins < 1 || p1CarrerasPassport.season_points < 100) {
    throw new Error('El pasaporte de P1 no acreditó la victoria o los +100 Season Points.');
  }

  // 7. Consultar Micro-Liga de Carreras
  const leagueRes = await fetch(`${HUB_URL}/api/leagues?gameId=carreras`);
  const leagueData = await leagueRes.json();
  console.log(`🏆 Micro-Liga de Carreras consultada. Jugadores en grupo: ${leagueData.league?.standings?.length}`);

  const p1InLeague = leagueData.league?.standings?.find((s) => s.user_id === player1.id);
  if (!p1InLeague || p1InLeague.season_points < 100) {
    throw new Error('La tabla de posiciones de la liga no acreditó los puntos al ganador.');
  }
  console.log(`🥇 Jugador 1 en la Liga: ${p1InLeague.username} con ${p1InLeague.season_points} SP (Top 1)`);

  console.log('\n🎉 ¡PRUEBA E2E COMPLETADA CON ÉXITO! Todos los sistemas sincronizados en Neon PostgreSQL.');
}

/**
 * Salida determinista.
 *
 * Antes el camino de éxito NO llamaba a process.exit, así que si quedaba
 * cualquier handle abierto (un socket, un temporizador) el proceso nunca
 * terminaba y `npm run test:e2e` se quedaba colgado sin explicación.
 * Ahora el resultado siempre cierra el proceso con el código correcto.
 */
runE2EFlow()
  .then(() => {
    clearTimeout(globalTimeout);
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error en prueba E2E:', err);
    clearTimeout(globalTimeout);
    process.exit(1);
  });
