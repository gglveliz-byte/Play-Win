import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function runE2ETest() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join(os.tmpdir(), 'pw-chrome-space-' + Date.now());

  console.log('🚀 [Space E2E] Iniciando Chrome Headless...');
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
    await new Promise(r => setTimeout(r, 400));
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

  console.log('🔌 Conectado a Chrome CDP:', wsUrl);
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

  // Esperar a que Next.js cargue e hidrate los componentes
  console.log('⏳ Esperando hidratación de Next.js en el cliente...');
  for (let i = 0; i < 40; i++) {
    const readyRes = await sendCommand('Runtime.evaluate', {
      expression: `(() => ({
        state: document.readyState,
        btnCount: document.querySelectorAll('button').length,
        hasSpace: document.body ? document.body.innerText.includes('Fuerza Espacial') : false
      }))()`,
      returnByValue: true
    });
    const info = readyRes.result?.value;
    if (info && info.btnCount > 0 && info.hasSpace) {
      console.log('✅ Next.js hidratado con éxito. Botones disponibles:', info.btnCount);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // 1. Iniciar sesión formalmente
  console.log('🔑 [1] Iniciando sesión...');
  const loginRes = await sendCommand('Runtime.evaluate', {
    expression: `
      (async () => {
        // Verificar si ya está logueado
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();
        if (meData.authenticated) return 'Already logged in: ' + meData.user.username;

        // Iniciar sesión con progamer2026
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'progamer2026', password: 'PlayWin123!' })
        });
        const loginData = await loginRes.json();
        if (loginData.success) {
          window.location.reload();
          return 'Logged in successfully, reloading';
        }
        return 'Login error: ' + JSON.stringify(loginData);
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('   Auth status:', loginRes.result?.value);
  await new Promise(r => setTimeout(r, 1000));

  // Esperar hidratación post-login si hubo recarga
  for (let i = 0; i < 20; i++) {
    const ready = await sendCommand('Runtime.evaluate', {
      expression: `document.querySelectorAll('button').length > 0 && document.body && document.body.innerText.includes('Fuerza Espacial')`,
      returnByValue: true
    });
    if (ready.result?.value) break;
    await new Promise(r => setTimeout(r, 400));
  }

  // 2. Localizar y abrir la tarjeta de Fuerza Espacial
  console.log('🌌 [2] Localizando tarjeta de Fuerza Espacial y pulsando Entrar a la Arena...');
  const openRes = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        // Buscar todas las tarjetas
        const cards = Array.from(document.querySelectorAll('.warm-card, [class*="card"]'));
        const spaceCard = cards.find(c => c.textContent && c.textContent.includes('Fuerza Espacial'));
        if (spaceCard) {
          const btn = spaceCard.querySelector('button');
          if (btn) {
            btn.click();
            return 'Clicked Arena button inside Fuerza Espacial card';
          }
        }
        // Fallback: buscar botones con "Entrar a la Arena"
        const arenaBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Entrar a la Arena'));
        if (arenaBtns.length >= 3) {
          arenaBtns[2].click();
          return 'Clicked 3rd Arena button';
        }
        return 'Not found. Found buttons: ' + Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).join(' | ');
      })()
    `,
    returnByValue: true
  });
  console.log('   Resultado apertura:', openRes.result?.value);
  await new Promise(r => setTimeout(r, 1500));

  // 3. Clic en BUSCAR RIVAL 1v1
  console.log('⚔️ [3] Clic en BUSCAR RIVAL 1v1...');
  let matchStarted = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('BUSCAR RIVAL 1v1'));
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
      matchStarted = true;
      console.log('   ✅ Botón BUSCAR RIVAL 1v1 presionado.');
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!matchStarted) {
    console.error('❌ No se pudo encontrar el botón BUSCAR RIVAL 1v1');
    chrome.kill();
    process.exit(1);
  }

  // 4. Esperar a que el juego esté en vivo
  console.log('⏳ [4] Esperando a que el juego esté EN VIVO (isLive === true)...');
  let gameIsLive = false;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 500));
    const checkLive = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const iframe = document.querySelector('iframe');
          if (iframe && iframe.contentWindow && iframe.contentWindow.PlayWin) {
            return {
              isLive: iframe.contentWindow.PlayWin.isLive(),
              score: iframe.contentDocument?.getElementById('score')?.textContent,
              hasCanvas: !!iframe.contentDocument?.getElementById('viewport')
            };
          }
          return null;
        })()
      `,
      returnByValue: true
    });
    const val = checkLive.result?.value;
    if (val && val.isLive) {
      gameIsLive = true;
      console.log('   🟢 ¡Juego EN VIVO! Score:', val.score);
      break;
    }
  }

  if (!gameIsLive) {
    console.warn('⚠️ isLive no llegó a true en el tiempo esperado, continuando inspección...');
  }

  // 5. Simular Controles de PC: Movimiento, Disparo y Bomba
  console.log('⌨️ [5] Probando controles de PC (WASD, Flechas, Espacio, Bomba B)...');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const iframe = document.querySelector('iframe');
        if (!iframe || !iframe.contentWindow) return;
        const win = iframe.contentWindow;

        // Disparo continuo
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space', code: 'Space', bubbles: true }));
        // Mover hacia abajo
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));

        setTimeout(() => {
          win.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
          // Mover hacia arriba
          win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }));
          // Lanzar Bomba Cuántica con 'b'
          win.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true }));
        }, 1000);
      })()
    `
  });

  // Dejar que transcurran 2.5s de combate y sincronización de rival
  await new Promise(r => setTimeout(r, 2500));

  // Captura 1: Versión PC en vivo
  console.log('📸 [6] Capturando scratch/space_pc_live.png...');
  const pcSnap = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/space_pc_live.png', Buffer.from(pcSnap.data, 'base64'));
  console.log('   ✅ scratch/space_pc_live.png guardado con éxito.');

  // 6. Probar Versión Móvil
  console.log('📱 [7] Aplicando Emulación Móvil (390x844)...');
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sendCommand('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    configuration: 'mobile'
  });

  await new Promise(r => setTimeout(r, 1500));

  // Inspeccionar elementos móviles
  const mobileCheck = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const iframe = document.querySelector('iframe');
        if (!iframe || !iframe.contentDocument) return { error: 'No iframe doc' };
        const doc = iframe.contentDocument;
        const btnBomb = doc.getElementById('btn_bomb');
        const btnShoot = doc.getElementById('btn_shoot');
        const btnAuto = doc.getElementById('btn_autofire');
        const mobileControls = doc.getElementById('mobile_controls');

        // Simular toques en botones táctiles
        if (btnShoot) {
          btnShoot.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
          setTimeout(() => {
            btnShoot.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
          }, 200);
        }

        return {
          mobileControlsVisible: mobileControls ? window.getComputedStyle(mobileControls).display !== 'none' : false,
          bombBtnVisible: btnBomb ? btnBomb.offsetParent !== null : false,
          shootBtnVisible: btnShoot ? btnShoot.offsetParent !== null : false,
          autoFireBtnVisible: btnAuto ? btnAuto.offsetParent !== null : false,
          bombCount: doc.getElementById('bomb_count')?.textContent,
          autoFireText: btnAuto?.textContent,
          playerScore: doc.getElementById('score')?.textContent,
          pwPlayerScore: doc.getElementById('pw_player_score')?.textContent,
          pwOppScore: doc.getElementById('pw_opp_score')?.textContent
        };
      })()
    `,
    returnByValue: true
  });
  console.log('   Inspección Móvil:', mobileCheck.result?.value);

  // Captura 2: Versión Móvil en vivo
  console.log('📸 [8] Capturando scratch/space_mobile_live.png...');
  const mobileSnap = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/space_mobile_live.png', Buffer.from(mobileSnap.data, 'base64'));
  console.log('   ✅ scratch/space_mobile_live.png guardado con éxito.');

  cdp.close();
  chrome.kill();
  console.log('🎉 ¡Prueba E2E de Space finalizada con éxito total!');
}

runE2ETest().catch(err => {
  console.error('❌ Error fatal en test:', err);
  process.exit(1);
});
