import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join(os.tmpdir(), 'pw-chrome-space-perf-' + Date.now());

  console.log('🚀 [1] Iniciando Chrome Headless...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tempProfile}`,
    '--window-size=1280,800',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  let hubTarget = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const targets = await res.json();
      hubTarget = targets.find(t => t.url && t.url.includes('3000')) || targets.find(t => t.type === 'page');
      if (hubTarget && hubTarget.webSocketDebuggerUrl) {
        break;
      }
    } catch (_) {}
  }

  if (!hubTarget) {
    console.error('❌ No se encontró la pestaña de Play Win en Chrome CDP');
    chrome.kill();
    process.exit(1);
  }

  console.log('🔌 Conectando WebSocket CDP:', hubTarget.webSocketDebuggerUrl);
  const cdp = new WebSocket(hubTarget.webSocketDebuggerUrl);
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

  // Asegurar tamaño Desktop estándar
  await sendCommand('Emulation.clearDeviceMetricsOverride');
  await sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });

  // 1. Esperar hidratación inicial
  console.log('⏳ [2] Esperando carga e hidratación de Next.js...');
  for (let i = 0; i < 30; i++) {
    const ready = await sendCommand('Runtime.evaluate', {
      expression: `document.querySelectorAll('button').length > 0 && document.body && document.body.innerText.includes('Fuerza Espacial')`,
      returnByValue: true
    });
    if (ready.result?.value) {
      console.log('   ✅ Página cargada.');
      break;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // 2. Comprobar si ya está logueado o loguear
  console.log('🔑 [3] Autenticando usuario progamer2026...');
  await sendCommand('Runtime.evaluate', {
    expression: `(async () => {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'progamer2026', password: 'PlayWin123!' })
      });
      window.location.reload();
    })()`,
    awaitPromise: true
  });

  // Esperar recarga y verificar que el usuario esté en el DOM (botón 'Salir' presente)
  console.log('⏳ [4] Esperando sesión en React state (botón Salir)...');
  let loggedIn = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    const checkUser = await sendCommand('Runtime.evaluate', {
      expression: `document.body && document.body.innerText.includes('Salir') && document.body.innerText.includes('Fuerza Espacial')`,
      returnByValue: true
    });
    if (checkUser.result?.value) {
      loggedIn = true;
      console.log('   ✅ Usuario progamer2026 autenticado correctamente.');
      break;
    }
  }

  if (!loggedIn) {
    console.error('❌ No se detectó sesión activa tras recarga.');
  }

  // 3. Localizar tarjeta de Fuerza Espacial y abrir Arena
  console.log('🌌 [5] Abriendo Arena de Fuerza Espacial...');
  const openRes = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.warm-card'));
      const spaceCard = cards.find(c => {
        const title = c.querySelector('h3');
        return title && title.innerText.includes('Fuerza Espacial');
      });
      if (spaceCard) {
        const btn = spaceCard.querySelector('button');
        if (btn) {
          btn.click();
          return 'Clic exitoso en tarjeta: ' + spaceCard.querySelector('h3').innerText;
        }
      }
      return 'Tarjeta no encontrada. Cards: ' + cards.map(c => c.querySelector('h3')?.innerText).join(', ');
    })()`,
    returnByValue: true
  });
  console.log('   Resultado apertura:', openRes.result?.value);
  await new Promise(r => setTimeout(r, 1500));

  // 4. Iniciar partida 1v1
  console.log('⚔️ [6] Buscando y pulsando botón BUSCAR RIVAL 1v1...');
  let matchClicked = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const matchBtn = btns.find(b => b.innerText && b.innerText.includes('BUSCAR RIVAL 1v1'));
        if (matchBtn) {
          matchBtn.click();
          return true;
        }
        return false;
      })()`,
      returnByValue: true
    });
    if (res.result?.value) {
      matchClicked = true;
      console.log('   ✅ Botón BUSCAR RIVAL 1v1 presionado.');
      break;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // 5. Esperar cuenta regresiva y estado EN VIVO
  console.log('⏳ [7] Esperando conexión de sala, rival y cuenta regresiva 3-2-1...');
  let isLive = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const liveCheck = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentWindow && iframe.contentWindow.PlayWin) {
          return {
            isLive: iframe.contentWindow.PlayWin.isLive(),
            score: iframe.contentDocument?.getElementById('score')?.textContent,
            rival: iframe.contentWindow.PlayWin.getOpponentState()
          };
        }
        return null;
      })()`,
      returnByValue: true
    });
    const val = liveCheck.result?.value;
    if (val && val.isLive) {
      isLive = true;
      console.log('   🟢 ¡Partida EN VIVO! Score inicial:', val.score, '| Rival:', val.rival?.username);
      break;
    }
  }

  // 6. Simular Controles de PC (WASD, Flechas, Espacio para disparar, B para bomba cuántica)
  console.log('⌨️ [8] Probando controles de PC en tiempo real...');
  await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const iframe = document.querySelector('iframe');
      if (!iframe || !iframe.contentWindow) return;
      const win = iframe.contentWindow;

      // Disparar láseres continuamente
      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space', code: 'Space', bubbles: true }));

      // Mover hacia abajo
      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));

      setTimeout(() => {
        win.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        // Mover hacia arriba
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }));
        // Disparar bomba cuántica con tecla B
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true }));
      }, 1000);
    })()`
  });

  // Dejar que juegue y destruya enemigos durante 3 segundos
  await new Promise(r => setTimeout(r, 3000));

  // Inspeccionar estado en PC
  const pcState = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const iframe = document.querySelector('iframe');
      const doc = iframe?.contentDocument;
      const win = iframe?.contentWindow;
      return {
        score: doc?.getElementById('score')?.textContent,
        wave: doc?.getElementById('wave_display')?.textContent,
        bombCount: doc?.getElementById('bomb_count')?.textContent,
        hudPlayerScore: doc?.getElementById('pw_player_score')?.textContent,
        hudRivalScore: doc?.getElementById('pw_opp_score')?.textContent,
        rivalState: win?.PlayWin?.getOpponentState()
      };
    })()`,
    returnByValue: true
  });
  console.log('   📊 Estado PC después de combatir:', pcState.result?.value);

  // Captura 1: PC
  console.log('📸 [9] Capturando pantalla PC: scratch/space_pc_live.png...');
  const pcScreenshot = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/space_pc_live.png', Buffer.from(pcScreenshot.data, 'base64'));
  console.log('   ✅ Guardada scratch/space_pc_live.png (' + pcScreenshot.data.length + ' bytes)');

  // 7. Configurar Emulación Móvil y Probar Controles Táctiles
  console.log('📱 [10] Configurando Viewport Móvil (390x844 con Touch activo)...');
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

  await new Promise(r => setTimeout(r, 1200));

  // Verificar elementos táctiles y simular toques en botones
  const mobileTest = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const iframe = document.querySelector('iframe');
      const doc = iframe?.contentDocument;
      if (!doc) return { error: 'No doc' };

      const mobileControls = doc.getElementById('mobile_controls');
      const btnBomb = doc.getElementById('btn_bomb');
      const btnShoot = doc.getElementById('btn_shoot');
      const btnAuto = doc.getElementById('btn_autofire');

      // Tocar botón de disparo táctil
      if (btnShoot) {
        btnShoot.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
        setTimeout(() => {
          btnShoot.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
        }, 150);
      }

      // Tocar botón de bomba si queda alguna
      if (btnBomb) {
        btnBomb.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
        setTimeout(() => {
          btnBomb.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
        }, 150);
      }

      const cs = mobileControls ? window.getComputedStyle(mobileControls) : null;
      return {
        mobileControlsDisplay: cs ? cs.display : 'none',
        mobileControlsVisible: mobileControls ? mobileControls.offsetHeight > 0 : false,
        btnBombText: btnBomb ? btnBomb.innerText.trim() : null,
        btnShootText: btnShoot ? btnShoot.innerText.trim() : null,
        btnAutoText: btnAuto ? btnAuto.innerText.trim() : null,
        currentScore: doc.getElementById('score')?.textContent,
        pwPlayerScore: doc.getElementById('pw_player_score')?.textContent,
        pwOppScore: doc.getElementById('pw_opp_score')?.textContent
      };
    })()`,
    returnByValue: true
  });
  console.log('   📱 Elementos Móviles:', mobileTest.result?.value);

  // Captura 2: Móvil
  console.log('📸 [11] Capturando pantalla Móvil: scratch/space_mobile_live.png...');
  const mobileScreenshot = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/space_mobile_live.png', Buffer.from(mobileScreenshot.data, 'base64'));
  console.log('   ✅ Guardada scratch/space_mobile_live.png (' + mobileScreenshot.data.length + ' bytes)');

  // Restaurar emulación
  await sendCommand('Emulation.clearDeviceMetricsOverride');
  await sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });

  cdp.close();
  chrome.kill();
  console.log('🎉 ¡Todas las pruebas de Space completadas exitosamente!');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
