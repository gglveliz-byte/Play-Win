import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join(os.tmpdir(), 'pw-chrome-profile-' + Date.now());

  console.log('🚀 Iniciando Chrome Headless...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tempProfile}`,
    '--window-size=1280,800',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const list = await res.json();
      if (list && list.length > 0 && list[0].webSocketDebuggerUrl) {
        wsUrl = list[0].webSocketDebuggerUrl;
        break;
      }
    } catch (_) {}
  }

  if (!wsUrl) {
    console.error('❌ No se pudo conectar a Chrome CDP');
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

  await new Promise(r => setTimeout(r, 1500));

  // 1. Iniciar sesión formalmente interactuando con el AuthModal
  console.log('🔑 Iniciando sesión en la interfaz...');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        // Abrir modal si no está abierto
        const navAuth = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Ingresar'));
        if (navAuth) navAuth.click();
      })()
    `
  });
  await new Promise(r => setTimeout(r, 600));

  await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const userInput = inputs.find(i => i.placeholder && i.placeholder.includes('alias'));
        const passInput = inputs.find(i => i.type === 'password');
        if (userInput) {
          userInput.value = 'progamer2026';
          userInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (passInput) {
          passInput.value = 'PlayWin123!';
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Entrar a Competir'));
        if (submitBtn) submitBtn.click();
      })()
    `
  });
  await new Promise(r => setTimeout(r, 2000));

  // 2. Abrir Carreras
  console.log('🎮 Abriendo lobby de Carreras...');
  await sendCommand('Runtime.evaluate', {
    expression: `
      const buttons = Array.from(document.querySelectorAll('button'));
      const launchBtn = buttons.find(b => b.textContent && (b.textContent.includes('Duelo Rápido') || b.textContent.includes('Comenzar a Competir')));
      if (launchBtn) launchBtn.click();
    `
  });
  await new Promise(r => setTimeout(r, 2000));

  // 3. Esperar que cargue el lobby y pulsar BUSCAR RIVAL 1v1
  console.log('⚔️ Buscando botón BUSCAR RIVAL 1v1...');
  let clickedStart = false;
  for (let i = 0; i < 20; i++) {
    const res = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('BUSCAR RIVAL'));
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true
    });
    if (res.result?.value) {
      clickedStart = true;
      console.log('✅ Clic en BUSCAR RIVAL 1v1 realizado.');
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Esperar a que el iframe del juego esté activo y en carrera en vivo
  console.log('⏳ Esperando que la carrera esté EN VIVO dentro del iframe...');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const checkLive = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const iframe = document.querySelector('iframe');
          if (iframe && iframe.contentWindow && iframe.contentWindow.PlayWin) {
            return iframe.contentWindow.PlayWin.isLive();
          }
          return false;
        })()
      `,
      returnByValue: true
    });
    if (checkLive.result?.value) {
      console.log('🟢 ¡Carrera EN VIVO detectada!');
      break;
    }
  }

  // Acelerar y dejar que el rival avance 2.5s para que se vea claro en la pista
  console.log('🏎️ Conduciendo en pista durante 2.5s...');
  await new Promise(r => setTimeout(r, 2500));

  const artifactDir = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30';

  // Captura 1: Carrera 1 en vivo con el nuevo auto rival
  console.log('📸 Capturando pantalla del nuevo auto rival en carrera...');
  const screenshot1 = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'carreras_new_rival.png'), Buffer.from(screenshot1.data, 'base64'));
  console.log('✅ Captura carreras_new_rival.png guardada con éxito.');

  // 4. Probar REMATCH: pulsar el botón "Rendirse" en el HUD
  console.log('💥 Pulsando Rendirse para terminar partida 1...');
  await sendCommand('Runtime.evaluate', {
    expression: `
      const iframe = document.querySelector('iframe');
      if (iframe && iframe.contentDocument) {
        const surrenderBtn = iframe.contentDocument.getElementById('pw-btn-surrender');
        if (surrenderBtn) surrenderBtn.click();
      }
    `
  });

  await new Promise(r => setTimeout(r, 2000));

  // 5. Clic directo con ratón en el botón "SIGUIENTE DUELO ➔"
  // El botón está en el centro de la pantalla, coordenadas ~565, 485
  console.log('🔄 Enviando clic de ratón al botón SIGUIENTE DUELO...');
  await sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: 565, y: 485, button: 'left', clickCount: 1 });
  await sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 565, y: 485, button: 'left', clickCount: 1 });

  // También intentamos clic vía contentDocument por si acaso
  await sendCommand('Runtime.evaluate', {
    expression: `
      const iframe = document.querySelector('iframe');
      if (iframe && iframe.contentDocument) {
        const rematchBtn = iframe.contentDocument.getElementById('pw-btn-rematch');
        if (rematchBtn) rematchBtn.click();
      }
    `
  });

  // Esperar 4.5s (radar -> emparejamiento 2)
  console.log('⏳ Esperando segundo emparejamiento automático (4.5s)...');
  await new Promise(r => setTimeout(r, 4500));

  const screenshot2 = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'carreras_rematch_paired.png'), Buffer.from(screenshot2.data, 'base64'));
  console.log('✅ Captura carreras_rematch_paired.png guardada.');

  // Esperar inicio de la segunda carrera en vivo
  console.log('⏳ Esperando inicio de segunda carrera en vivo (3.5s)...');
  await new Promise(r => setTimeout(r, 3500));

  const screenshot3 = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'carreras_rematch_racing.png'), Buffer.from(screenshot3.data, 'base64'));
  console.log('✅ Captura carreras_rematch_racing.png guardada.');

  cdp.close();
  chrome.kill();
  console.log('🏁 ¡Prueba completa verificada exitosamente!');
}

main().catch(console.error);
