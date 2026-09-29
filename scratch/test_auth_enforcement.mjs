import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function testAuthRules() {
  console.log('=== VERIFICANDO: SIN INICIAR SESIÓN NO SE PUEDE JUGAR ===\n');

  // PRUEBA 1: Solicitud de Ticket sin Cookie de Sesión
  console.log('1. Intentando obtener Ticket de partida sin sesión...');
  const ticketRes = await fetch('http://localhost:3000/api/games/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: 'carreras' })
  });

  const ticketData = await ticketRes.json();
  console.log(`HTTP Status: ${ticketRes.status}`);
  console.log(`Respuesta:`, ticketData);

  if (ticketRes.status === 401 && ticketData.requireLogin === true) {
    console.log('[PASS] Bloqueo HTTP 401 verificado: Ticket denegado sin sesión.\n');
  } else {
    throw new Error('FAIL: Se permitió emitir ticket sin sesión.');
  }

  // PRUEBA 2: Conexión WebSocket anónima sin token JWT
  console.log('2. Intentando unirse a cola WebSocket sin token de autenticación...');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001/ws');

    ws.on('open', () => {
      ws.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: {
          id: 'anon_123',
          username: 'HackerAnonimo',
          gameId: 'carreras'
          // Sin token
        }
      }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      console.log('Servidor respondió:', msg);
      if (msg.event === 'SECURITY_ERROR') {
        console.log('[PASS] Bloqueo de Servidor WebSocket verificado: SECURITY_ERROR emitido correctamente.\n');
        ws.close();
        resolve();
      } else {
        ws.close();
        reject(new Error(`FAIL: Servidor no bloqueó al usuario anónimo: evento ${msg.event}`));
      }
    });

    setTimeout(() => {
      ws.close();
      reject(new Error('Timeout esperando respuesta del servidor'));
    }, 4000);
  });

  // PRUEBA 3: Conexión WebSocket con token falso/manipulado
  console.log('3. Intentando unirse con token falso/manipulado...');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001/ws');

    ws.on('open', () => {
      ws.send(JSON.stringify({
        action: 'JOIN_MATCH',
        player: {
          id: 'fake_user',
          username: 'FakeUser',
          token: 'token_falso_inventado_por_cliente',
          gameId: 'carreras'
        }
      }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      console.log('Servidor respondió a token falso:', msg);
      if (msg.event === 'SECURITY_ERROR') {
        console.log('[PASS] Bloqueo de Token Falso verificado: SECURITY_ERROR emitido correctamente.\n');
        ws.close();
        resolve();
      } else {
        ws.close();
        reject(new Error(`FAIL: Servidor aceptó token falso: evento ${msg.event}`));
      }
    });

    setTimeout(() => {
      ws.close();
      reject(new Error('Timeout esperando respuesta del servidor'));
    }, 4000);
  });

  console.log('=== TODAS LAS REGLAS DE SEGURIDAD ESTRICTA APROBADAS: SIN SESIÓN NADIE PUEDE JUGAR ===');
}

testAuthRules().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
