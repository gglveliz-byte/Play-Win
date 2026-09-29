import {
  userService,
  passportService,
  matchService,
  leagueService,
  ledgerService,
  pool,
} from '../src/index.js';

async function runTests() {
  console.log('🧪 Iniciando pruebas de servicios en Neon PostgreSQL...');

  try {
    // 1. Usuarios
    const p1 = await userService.ensureUser({
      username: `alex_test_${Date.now().toString(36)}`,
      email: `alex_${Date.now()}@playwin.gg`,
      avatarUrl: '⚡',
    });
    console.log('✅ Usuario 1 creado en Neon:', p1.username, p1.id);

    const p2 = await userService.ensureUser({
      username: `val_test_${Date.now().toString(36)}`,
      email: `val_${Date.now()}@playwin.gg`,
      avatarUrl: '🎯',
    });
    console.log('✅ Usuario 2 creado en Neon:', p2.username, p2.id);

    // 2. Micro-Liga de 10
    const league = await leagueService.assignPlayerToLeague(p1.id, 'carreras', 'BRONZE');
    console.log('✅ Asignación a Micro-Liga:', league.league_id);

    // 3. Pasaportes
    const pass1 = await passportService.getOrCreatePassport(p1.id, 'carreras');
    console.log('✅ Pasaporte Inicial P1:', pass1.rank_tier, 'SP:', pass1.season_points);

    // 4. Registro de Partida Atómica 1v1
    const match = await matchService.recordMatch({
      roomId: `duel_carreras_${Date.now().toString(36)}`,
      gameId: 'carreras',
      player1Id: p1.id,
      player2Id: p2.id,
      winnerId: p1.id,
      p1Score: 3450,
      p2Score: 2100,
      seed: 8492019,
      finishReason: 'OPPONENT_CRASH',
      durationMs: 35000,
      p1PointsDelta: 100,
      p2PointsDelta: 20,
    });
    console.log('✅ Partida 1v1 persistida en Neon match_records:', match.id);

    // 5. Verificar estadísticas actualizadas en Pasaporte
    const updatedPass1 = await passportService.getOrCreatePassport(p1.id, 'carreras');
    console.log('✅ Pasaporte P1 tras victoria (+100 SP):', updatedPass1.season_points, 'Wins:', updatedPass1.wins);
    if (updatedPass1.season_points !== 100 || updatedPass1.wins !== 1) {
      throw new Error('Fallo en la validación de Season Points del ganador');
    }

    // 6. Doble Libro Contable (Ledger)
    const tx = await ledgerService.recordTransaction({
      userId: p1.id,
      amount: 10.00,
      currency: 'USD',
      type: 'DEPOSIT',
      status: 'COMPLETED',
      provider: 'WHOP',
      providerTxId: `whop_sub_${Date.now()}`,
      metadata: { plan: 'pro_monthly' },
    });
    console.log('✅ Transacción registrada en wallet_ledger. Nuevo saldo:', tx.new_balance);

    console.log('\n🏆 TODAS LAS PRUEBAS DE SERVICIO EN NEON POSTGRESQL PASARON AL 100%!');
  } catch (err) {
    console.error('❌ Error en pruebas:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
