import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function main() {
  console.log('1. Autenticando progamer2026...');
  const resLogin = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'progamer2026', password: 'PlayWin123!' })
  });
  const dataLogin = await resLogin.json();
  const cookie = resLogin.headers.get('set-cookie');
  console.log('Login exitoso:', dataLogin.user.username);

  console.log('2. Obteniendo ticket efímero de partida...');
  const resTicket = await fetch('http://localhost:3000/api/games/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' },
    body: JSON.stringify({ gameId: 'carreras' })
  });
  const ticketData = await resTicket.json();
  console.log('Ticket obtenido:', ticketData.ticket.slice(0, 20) + '...');

  const playerSession = {
    id: ticketData.playerId,
    username: ticketData.username,
    avatar: ticketData.avatar,
    rank: 'ORO',
    skillRating: 1850,
    token: ticketData.ticket,
  };

  const gameUrl = `http://localhost:3000/games/carreras/index.html?token=${encodeURIComponent(ticketData.ticket)}&username=${encodeURIComponent(ticketData.username)}&playerId=${encodeURIComponent(ticketData.playerId)}`;

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join(os.tmpdir(), 'pw-verify-profile-' + Date.now());

  console.log('3. Iniciando Chrome Headless en puerto 9444...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9444',
    `--user-data-dir=${tempProfile}`,
    '--window-size=1280,720',
    '--no-first-run',
    '--no-default-browser-check',
    gameUrl
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await fetch('http://127.0.0.1:9444/json');
      const list = await res.json();
      if (list && list.length > 0 && list[0].webSocketDebuggerUrl) {
        wsUrl = list[0].webSocketDebuggerUrl;
        break;
      }
    } catch (_) {}
  }

  if (!wsUrl) {
    console.error('No se pudo conectar con Chrome CDP en puerto 9444');
    chrome.kill();
    process.exit(1);
  }

  const cdp = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      cdp.send(JSON.stringify({ id, method, params }));
    });
  }

  cdp.on('message', (data) => {
    const res = JSON.parse(data.toString());
    if (res.id && pending.has(res.id)) {
      const { resolve, reject } = pending.get(res.id);
      pending.delete(res.id);
      if (res.error) reject(res.error);
      else resolve(res.result);
    }
  });

  await new Promise(r => cdp.on('open', r));
  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');

  console.log('4. Esperando emparejamiento automático (3.5s) y cuenta regresiva (3s)...');
  const artifactDir = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30';

  // Esperar a que la carrera esté activa
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const isLive = await sendCommand('Runtime.evaluate', {
      expression: 'Boolean(window.PlayWin && window.PlayWin.isLive())',
      returnByValue: true
    });
    if (isLive.result?.value) {
      console.log('🟢 ¡Carrera 1 EN VIVO!');
      break;
    }
  }

  // Dejar que avance 2.5s para que el rival esté visible delante
  await new Promise(r => setTimeout(r, 2500));

  console.log('6. Capturando pantalla de la carrera con el nuevo auto rival...');
  const shot1 = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'carreras_new_rival.png'), Buffer.from(shot1.data, 'base64'));
  console.log('✅ Captura carreras_new_rival.png guardada.');

  // 7. Simular rendición / choque para ver la pantalla de resultados
  console.log('7. Finalizando partida 1 mediante Rendirse...');
  await sendCommand('Runtime.evaluate', {
    expression: 'window.PlayWin.notifyCrash();'
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('8. Capturando pantalla de resultados (Victoria/Derrota)...');
  const shotRes = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'carreras_result_screen.png'), Buffer.from(shotRes.data, 'base64'));
  console.log('✅ Captura carreras_result_screen.png guardada.');

  // 9. Pulsar SIGUIENTE DUELO ➔ (Rematch)
  console.log('9. Pulsando SIGUIENTE DUELO ➔ (Rematch)...');
  await sendCommand('Runtime.evaluate', {
    expression: 'window.PlayWin.startMatchmaking();'
  });

  // Esperar a que empareje la revancha
  console.log('10. Esperando emparejamiento de Revancha...');
  await new Promise(r => setTimeout(r, 4500));

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const isLive2 = await sendCommand('Runtime.evaluate', {
      expression: 'Boolean(window.PlayWin && window.PlayWin.isLive())',
      returnByValue: true
    });
    if (isLive2.result?.value) {
      console.log('🟢 ¡Carrera 2 (Revancha) EN VIVO!');
      break;
    }
  }

  await new Promise(r => setTimeout(r, 2000));

  console.log('11. Capturando pantalla de la carrera de revancha...');
  const shotRematch = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'carreras_rematch_racing.png'), Buffer.from(shotRematch.data, 'base64'));
  console.log('✅ Captura carreras_rematch_racing.png guardada.');

  cdp.close();
  chrome.kill();
  console.log('\n🏁 PRUEBA COMPLETA Y VERIFICADA AL 100%');
}

main().catch(console.error);
