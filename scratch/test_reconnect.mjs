import assert from 'node:assert';
import { ReconnectManager } from '../apps/realtime-server/src/match-reconnect.js';

async function testReconnect() {
  console.log('🧪 Probando ReconnectManager...');
  const rm = new ReconnectManager(200); // 200ms para test rápido

  let forfeitCalled = false;
  rm.schedule('player_1', 'room_123', () => {
    forfeitCalled = true;
  });

  assert.strictEqual(rm.isPending('player_1'), true, 'El jugador debe estar en pending');
  const entry = rm.cancel('player_1');
  assert.strictEqual(entry.roomId, 'room_123', 'Debe retornar la sala cancelada');
  assert.strictEqual(rm.isPending('player_1'), false, 'Ya no debe estar en pending');

  // Esperar más de 200ms para asegurar que NO se llame onForfeit
  await new Promise(r => setTimeout(r, 250));
  assert.strictEqual(forfeitCalled, false, 'No se debió llamar forfeit tras cancelar');

  // Ahora probar expiración real
  rm.schedule('player_2', 'room_456', () => {
    forfeitCalled = true;
  });
  await new Promise(r => setTimeout(r, 260));
  assert.strictEqual(forfeitCalled, true, 'Se debió llamar forfeit tras expirar los 200ms');
  assert.strictEqual(rm.isPending('player_2'), false, 'Debe removerse de pending tras expirar');

  console.log('✅ ReconnectManager: 100% aprobado!');
}

testReconnect().catch(err => {
  console.error('❌ Error en test:', err);
  process.exit(1);
});
