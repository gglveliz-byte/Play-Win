import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import fs from 'fs';

async function testUserFlow() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);
  let id = 1;

  function sendCmd(method, params = {}) {
    return new Promise((resolve) => {
      const curId = id++;
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === curId) {
          ws.off('message', handler);
          resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  ws.on('open', async () => {
    console.log('Connected to Chrome CDP');

    // 1. Close any open modal
    console.log('Closing any open modal...');
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const closeBtn = document.querySelector('.modal-content button, [class*="close"], .btn-pill-light');
        if (closeBtn && closeBtn.innerText.includes('Cerrar')) closeBtn.click();
        const closeArena = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cerrar Partida'));
        if (closeArena) closeArena.click();
      })()`
    });

    await new Promise(r => setTimeout(r, 1000));

    // 2. Click Sky Runner 3D card
    console.log('Clicking Sky Runner 3D card...');
    const cardRes = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const cards = Array.from(document.querySelectorAll('.game-card, [class*="gameCard"], [class*="card"]'));
        const skyCard = cards.find(c => c.innerText.includes('Sky Runner 3D'));
        if (skyCard) {
          const btn = skyCard.querySelector('button');
          if (btn) {
            btn.click();
            return 'Clicked Sky Runner card button';
          }
        }
        return 'Sky card not found';
      })()`,
      returnByValue: true
    });
    console.log(cardRes?.result?.value);

    // Wait 1.5s for lobby
    await new Promise(r => setTimeout(r, 1500));

    // 3. Click "⚔️ BUSCAR RIVAL 1v1"
    console.log('Clicking BUSCAR RIVAL 1v1...');
    const startRes = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('BUSCAR RIVAL 1v1'));
        if (btn) {
          btn.click();
          return 'Clicked start duel';
        }
        return 'Start duel button not found';
      })()`,
      returnByValue: true
    });
    console.log(startRes?.result?.value);

    // Wait 2.5s for matchmaking and countdown
    await new Promise(r => setTimeout(r, 2500));

    // Check status
    const matchStatus = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (!iframe) return 'No iframe';
        const iDoc = iframe.contentDocument;
        const iWin = iframe.contentWindow;
        return {
          playWin: !!iWin.PlayWin,
          isLive: iWin.PlayWin?.isLive(),
          activeScreen: iDoc?.querySelector('.pw-screen.active')?.id || 'none',
          countdown: iDoc?.querySelector('#pw-countdown')?.textContent,
          myScore: iDoc?.querySelector('#pw-hud-my-score')?.textContent,
          oppName: iDoc?.querySelector('#pw-hud-opp-name')?.textContent
        };
      })()`,
      returnByValue: true
    });
    console.log('Matchmaking / Countdown state:', matchStatus?.result?.value);

    // Wait for countdown (3s) + 1s of gameplay
    console.log('Waiting for match to go LIVE...');
    await new Promise(r => setTimeout(r, 3500));

    // Send jump and steer to play
    console.log('Playing (dispatching ArrowRight and Space)...');
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (!iframe) return;
        const iWin = iframe.contentWindow;
        iWin.focus();
        iWin.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
        setTimeout(() => iWin.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })), 150);
        iWin.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
        setTimeout(() => iWin.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })), 200);
      })()`
    });

    await new Promise(r => setTimeout(r, 2000));

    const liveState = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (!iframe) return 'No iframe';
        const iDoc = iframe.contentDocument;
        const iWin = iframe.contentWindow;
        return {
          isLive: iWin.PlayWin?.isLive(),
          activeScreen: iDoc?.querySelector('.pw-screen.active')?.id || 'none',
          myScore: iDoc?.querySelector('#pw-hud-my-score')?.textContent,
          oppScore: iDoc?.querySelector('#pw-hud-opp-score')?.textContent,
          oppName: iDoc?.querySelector('#pw-hud-opp-name')?.textContent
        };
      })()`,
      returnByValue: true
    });
    console.log('Live match state after gameplay:', liveState?.result?.value);

    // Capture screenshot of live game
    const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
    if (shot?.data) {
      const buf = Buffer.from(shot.data, 'base64');
      fs.writeFileSync('scratch/sky_userflow_live.png', buf);
      console.log('Saved scratch/sky_userflow_live.png, size:', buf.length);
    }

    ws.close();
  });
}

testUserFlow().catch(console.error);
