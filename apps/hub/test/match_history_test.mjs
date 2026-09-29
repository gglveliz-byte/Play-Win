import { userService, matchService, passportService } from '../../../packages/database/src/index.js';

async function runMatchHistoryTest() {
  console.log('🧪 Iniciando prueba de API y Servicio de Historial de Partidas en Neon PostgreSQL...\n');

  const rand = Math.random().toString(36).substring(7);
  const p1Username = `pilot_hist_${rand}`;
  const p2Username = `rival_hist_${rand}`;

  // 1. Crear 2 usuarios
  console.log('1️⃣ Creando 2 pilotos en Neon DB...');
  const user1 = await userService.createUser({
    username: p1Username,
    email: `${p1Username}@playwin.gg`,
    passwordHash: 'hashed_pw_test',
  });
  const user2 = await userService.createUser({
    username: p2Username,
    email: `${p2Username}@playwin.gg`,
    passwordHash: 'hashed_pw_test',
  });
  console.log(`✅ Piloto 1 creado: ${user1.username} (${user1.id})`);
  console.log(`✅ Piloto 2 creado: ${user2.username} (${user2.id})`);

  // 2. Registrar una partida 1v1
  console.log('\n2️⃣ Registrando partida oficial 1v1 en match_records...');
  const match = await matchService.recordMatch({
    roomId: `room_${rand}`,
    gameId: 'carreras',
    player1Id: user1.id,
    player2Id: user2.id,
    winnerId: user1.id,
    p1Score: 840,
    p2Score: 610,
    seed: 987654321,
    finishReason: 'OPPONENT_CRASH',
    durationMs: 42500,
    p1PointsDelta: 100,
    p2PointsDelta: 20,
  });
  console.log(`✅ Partida registrada con ID: ${match.id}`);

  // 3. Consultar historial de Piloto 1 (Ganador)
  console.log('\n3️⃣ Consultando historial de duelos de Piloto 1 (Ganador)...');
  const p1History = await matchService.getMatchHistory(user1.id, 10);
  if (p1History.length === 0) {
    throw new Error('❌ Error: El historial de Piloto 1 está vacío.');
  }

  const p1Match = p1History[0];
  console.log('✅ Registro recuperado para Piloto 1:');
  console.log(`   - Juego: ${p1Match.game_id}`);
  console.log(`   - Rival: ${p1Match.player2_username}`);
  console.log(`   - Marcador: ${p1Match.p1_score} vs ${p1Match.p2_score}`);
  console.log(`   - Ganador es P1: ${p1Match.winner_id === user1.id}`);
  console.log(`   - Duración: ${Math.round(p1Match.duration_ms / 1000)}s`);
  console.log(`   - Semilla Auditada: ${p1Match.seed}`);

  if (p1Match.player2_username !== p2Username) {
    throw new Error(`❌ Error: El rival esperado era ${p2Username}, pero se obtuvo ${p1Match.player2_username}`);
  }

  // 4. Consultar historial de Piloto 2 (Derrota)
  console.log('\n4️⃣ Consultando historial de duelos de Piloto 2 (Derrota)...');
  const p2History = await matchService.getMatchHistory(user2.id, 10);
  const p2Match = p2History[0];
  console.log('✅ Registro recuperado para Piloto 2:');
  console.log(`   - Rival: ${p2Match.player1_username}`);
  console.log(`   - Ganador es P2: ${p2Match.winner_id === user2.id}`);

  if (p2Match.winner_id === user2.id) {
    throw new Error('❌ Error: Piloto 2 debería figurar con derrota.');
  }

  console.log('\n🎉 ¡PRUEBA DE HISTORIAL DE PARTIDAS EN NEON DB COMPLETADA AL 100%!');
  process.exit(0);
}

runMatchHistoryTest().catch((err) => {
  console.error('\n❌ ERROR EN LA PRUEBA:', err);
  process.exit(1);
});
