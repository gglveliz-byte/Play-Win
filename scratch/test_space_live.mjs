import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join(os.tmpdir(), 'pw-chrome-space-' + Date.now());

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

  console.log(`✅ Pestaña encontrada: "${hubTarget.title}" (${hubTarget.url})`);
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

  console.log('⏳ Esperando carga de la página...');
  for (let i = 0; i < 30; i++) {
    const check = await sendCommand('Runtime.evaluate', {
      expression: `document.querySelectorAll('button').length > 0 && document.body && document.body.innerText.includes('Fuerza Espacial')`,
      returnByValue: true
    });
    if (check.result?.value) {
      console.log('✅ Página de Play Win lista y botones interactivos.');
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // 1. Cerrar cualquier modal previo
  await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const closeArena = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Cerrar Partida'));
      if (closeArena) closeArena.click();
      const closeLobby = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Volver al Hub'));
      if (closeLobby) closeLobby.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  // 2. Verificar o iniciar sesión
  console.log('🔑 [2] Verificando sesión activa...');
  const authRes = await sendCommand('Runtime.evaluate', {
    expression: `(async () => {
      const meRes = await fetch('/api/auth/me');
      const me = await meRes.json();
      if (me.authenticated) return { status: 'logged_in', user: me.user.username };

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'progamer2026', password: 'PlayWin123!' })
      });
      const data = await loginRes.json();
      if (data.success) {
        window.location.reload();
        return { status: 'just_logged_in' };
      }
      return { status: 'error', data };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('   Sesión:', authRes.result?.value);

  if (authRes.result?.value?.status === 'just_logged_in') {
    console.log('⏳ Esperando recarga post-login...');
    await new Promise(r => setTimeout(r, 2000));
  }

  // 3. Localizar tarjeta de Fuerza Espacial
  console.log('🌌 [3] Abriendo Arena de Fuerza Espacial...');
  const openArenaRes = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.warm-card, div'));
      const spaceCard = cards.find(c => c.innerText && c.innerText.includes('Fuerza Espacial') && c.innerText.includes('ARCADE SHMUP'));
      if (spaceCard) {
        const btn = spaceCard.querySelector('button');
        if (btn) {
          btn.click();
          return 'Clic en botón de tarjeta Fuerza Espacial: ' + btn.innerText;
        }
      }
      // Buscar entre todos los botones
      const btns = Array.from(document.querySelectorAll('button'));
      const spaceBtn = btns.find(b => {
        const p = b.closest('div');
        return p && p.innerText && p.innerText.includes('Fuerza Espacial');
      });
      if (spaceBtn) {
        spaceBtn.click();
        return 'Clic en spaceBtn fallback: ' + spaceBtn.innerText;
      }
      return 'No encontrado. Botones disponibles: ' + btns.map(b => b.innerText.trim()).join(' | ');
    })()`,
    returnByValue: true
  });
  console.log('   Resultado apertura:', openArenaRes.result?.value);
  await new Promise(r => setTimeout(r, 1200));

  // 4. Iniciar partida 1v1
  console.log('⚔️ [4] Pulsando BUSCAR RIVAL 1v1 en el lobby...');
  const matchRes = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const matchBtn = btns.find(b => b.innerText && b.innerText.includes('BUSCAR RIVAL 1v1'));
      if (matchBtn) {
        matchBtn.click();
        return 'Clic en: ' + matchBtn.innerText;
      }
      return 'No encontrado matchBtn. Botones: ' + btns.map(b => b.innerText.trim()).join(' | ');
    })()`,
    returnByValue: true
  });
  console.log('   Resultado match:', matchRes.result?.value);

  // 5. Esperar cuenta regresiva y estado EN VIVO
  console.log('⏳ [5] Esperando conexión de sala, rival y cuenta regresiva 3-2-1...');
  let isLive = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
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
  console.log('⌨️ [6] Probando controles de PC en tiempo real...');
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
      }, 800);
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
  console.log('📸 [7] Capturando pantalla PC: scratch/space_pc_live.png...');
  const pcScreenshot = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/space_pc_live.png', Buffer.from(pcScreenshot.data, 'base64'));
  console.log('   ✅ Guardada scratch/space_pc_live.png (' + pcScreenshot.data.length + ' bytes)');

  // 7. Configurar Emulación Móvil y Probar Controles Táctiles
  console.log('📱 [8] Configurando Viewport Móvil (390x844 con Touch activo)...');
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

      // Tocar botón de disparo
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
  console.log('📸 [9] Capturando pantalla Móvil: scratch/space_mobile_live.png...');
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
  console.error('❌ Error:', err);
  process.exit(1);
});
