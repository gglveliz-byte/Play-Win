import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function runE2ETest() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join(os.tmpdir(), 'pw-chrome-space-' + Date.now());

  console.log('🚀 [Test Space] Lanzando Chrome...');
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

  await new Promise(r => setTimeout(r, 2000));

  // 1. Iniciar sesión formalmente
  console.log('🔑 [1] Iniciando sesión con progamer2026...');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
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

  // 2. Abrir Fuerza Espacial (Space)
  console.log('🌌 [2] Abriendo Fuerza Espacial...');
  const openSpaceRes = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const cards = Array.from(document.querySelectorAll('div, section, article')).filter(el => {
          return el.textContent && el.textContent.includes('Fuerza Espacial');
        });
        const playBtn = Array.from(document.querySelectorAll('button')).find(b => {
          const parent = b.closest('div');
          return (b.textContent.includes('Duelo Rápido') || b.textContent.includes('Competir') || b.textContent.includes('Jugar')) &&
                 parent && parent.textContent.includes('Fuerza Espacial');
        }) || Array.from(document.querySelectorAll('button')).find(b => {
          const card = b.closest('.game-card');
          return card && card.textContent.includes('Fuerza Espacial');
        });

        if (playBtn) {
          playBtn.click();
          return 'Clicked button for Fuerza Espacial';
        }
        // Alternativa: buscar el botón general en la tarjeta 3
        const allButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Duelo Rápido'));
        if (allButtons.length >= 3) {
          allButtons[2].click();
          return 'Clicked 3rd Duelo Rapido button';
        }
        return 'Not found';
      })()
    `,
    returnByValue: true
  });
  console.log('   Resultado apertura:', openSpaceRes.result?.value);
  await new Promise(r => setTimeout(r, 1500));

  // 3. Clic en "BUSCAR RIVAL 1v1" dentro del modal
  console.log('⚔️ [3] Haciendo clic en BUSCAR RIVAL 1v1...');
  const matchBtnRes = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const matchBtn = buttons.find(b => b.textContent && (b.textContent.includes('BUSCAR RIVAL') || b.textContent.includes('JUGAR AHORA') || b.textContent.includes('1v1')));
        if (matchBtn) {
          matchBtn.click();
          return 'Clicked ' + matchBtn.textContent.trim();
        }
        return 'Match button not found. Total buttons: ' + buttons.map(b => b.textContent.trim()).join(' | ');
      })()
    `,
    returnByValue: true
  });
  console.log('   Resultado emparejamiento:', matchBtnRes.result?.value);

  // Esperar a que el iframe cargue y comience la cuenta regresiva
  console.log('⏳ [4] Esperando conexión de sala, rival y cuenta regresiva...');
  await new Promise(r => setTimeout(r, 5500));

  // 4. Evaluar estado dentro del iframe del juego
  console.log('🕹️ [5] Evaluando estado en el juego Space (PC Controls)...');
  const gameState = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const iframe = document.querySelector('iframe');
        if (!iframe || !iframe.contentWindow) return { error: 'No iframe' };
        const win = iframe.contentWindow;
        return {
          hasPlayWin: !!win.PlayWin,
          isLive: win.PlayWin ? win.PlayWin.isLive() : false,
          scoreText: iframe.contentDocument?.getElementById('score')?.textContent,
          shields: iframe.contentDocument?.querySelectorAll('.shield-pip.active')?.length,
          rivalState: win.PlayWin ? win.PlayWin.getOpponentState() : null,
          hudPlayerScore: iframe.contentDocument?.getElementById('pw_player_score')?.textContent,
          hudRivalScore: iframe.contentDocument?.getElementById('pw_opp_score')?.textContent,
          canvasW: iframe.contentDocument?.getElementById('viewport')?.width,
          canvasH: iframe.contentDocument?.getElementById('viewport')?.height
        };
      })()
    `,
    returnByValue: true
  });
  console.log('   Estado del juego Space:', gameState.result?.value);

  // 5. Simular controles de PC: movimiento con teclas, disparos y bomba cuántica
  console.log('⌨️ [6] Simulando controles de PC (Teclas WASD, Espacio, B)...');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const iframe = document.querySelector('iframe');
        if (!iframe || !iframe.contentWindow) return;
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;

        // Disparar teclas de movimiento
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space', code: 'Space', bubbles: true }));
        setTimeout(() => {
          win.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
          win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }));
          // Lanzar Bomba Cuántica con 'b'
          win.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true }));
        }, 800);
      })()
    `
  });

  await new Promise(r => setTimeout(r, 2000));

  // Capturar Screenshot PC
  console.log('📸 [7] Capturando Screenshot versión PC...');
  const pcScreenshot = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/space_pc_live.png', Buffer.from(pcScreenshot.data, 'base64'));
  console.log('   Guardado scratch/space_pc_live.png (' + pcScreenshot.data.length + ' bytes)');

  // 6. Probar y Verificar Versión Móvil
  console.log('📱 [8] Configurando Emulación Móvil (Viewport 390x844 con Touch)...');
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

  // Verificar botones táctiles en móvil y simular toque
  const mobileState = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const iframe = document.querySelector('iframe');
        if (!iframe || !iframe.contentDocument) return { error: 'No iframe' };
        const doc = iframe.contentDocument;
        const btnBomb = doc.getElementById('btn_bomb');
        const btnShoot = doc.getElementById('btn_shoot');
        const btnAuto = doc.getElementById('btn_autofire');
        const mobileControls = doc.getElementById('mobile_controls');

        // Simular clic/touch en botón de fuego
        if (btnShoot) {
          btnShoot.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
          btnShoot.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
        }

        return {
          mobileControlsDisplay: mobileControls ? window.getComputedStyle(mobileControls).display : 'none',
          btnBombVisible: !!btnBomb && btnBomb.offsetParent !== null,
          btnShootVisible: !!btnShoot && btnShoot.offsetParent !== null,
          btnAutoVisible: !!btnAuto && btnAuto.offsetParent !== null,
          autoFireText: btnAuto ? btnAuto.textContent : '',
          bombCount: doc.getElementById('bomb_count')?.textContent
        };
      })()
    `,
    returnByValue: true
  });
  console.log('   Estado Mobile Controls:', mobileState.result?.value);

  // Capturar Screenshot Móvil
  console.log('📸 [9] Capturando Screenshot versión Móvil...');
  const mobileScreenshot = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/space_mobile_live.png', Buffer.from(mobileScreenshot.data, 'base64'));
  console.log('   Guardado scratch/space_mobile_live.png (' + mobileScreenshot.data.length + ' bytes)');

  // 7. Verificar estado de la partida y rival
  const finalState = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const iframe = document.querySelector('iframe');
        const win = iframe?.contentWindow;
        return {
          isLive: win?.PlayWin?.isLive(),
          score: iframe?.contentDocument?.getElementById('score')?.textContent,
          pwPlayerScore: iframe?.contentDocument?.getElementById('pw_player_score')?.textContent,
          pwOppScore: iframe?.contentDocument?.getElementById('pw_opp_score')?.textContent,
          oppUsername: win?.PlayWin?.getOpponentState()?.username
        };
      })()
    `,
    returnByValue: true
  });
  console.log('🏁 [10] Estado final de partida:', finalState.result?.value);

  cdp.close();
  chrome.kill();
  console.log('✅ Prueba completada con éxito.');
}

runE2ETest().catch(err => {
  console.error('❌ Error en prueba E2E:', err);
  process.exit(1);
});
