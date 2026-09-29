import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import fs from 'fs';

async function testSkyMatch() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  if (!hubTab) {
    console.error('Hub tab not found');
    return;
  }

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

    // 1. Reload the iframe with Sky game
    console.log('Reloading sky iframe...');
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (iframe) {
          iframe.src = '/games/sky/index.html';
          return 'Iframe reloaded';
        }
        return 'No iframe';
      })()`
    });

    // Wait 2.5s for load and handshake
    await new Promise(r => setTimeout(r, 2500));

    // 2. Check if iframe has PlayWin initialized
    const status = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (!iframe) return { error: 'No iframe' };
        const iWin = iframe.contentWindow;
        return {
          playWinExists: !!iWin.PlayWin,
          isLive: iWin.PlayWin?.isLive ? iWin.PlayWin.isLive() : false,
          activeScreen: iframe.contentDocument?.querySelector('.pw-screen.active')?.id || 'none',
          hudScore: iframe.contentDocument?.querySelector('#pw-hud-my-score')?.textContent || '0'
        };
      })()`,
      returnByValue: true
    });
    console.log('Iframe status after reload:', status?.result?.value);

    // Wait 4s for countdown to finish and game to go live
    console.log('Waiting for countdown to finish...');
    await new Promise(r => setTimeout(r, 4000));

    // 3. Dispatch keyboard events to simulate steering and jumping
    console.log('Simulating player controls (jump & steer)...');
    await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (!iframe) return;
        const iWin = iframe.contentWindow;
        const iDoc = iframe.contentDocument;
        // Press Space to jump
        iWin.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
        setTimeout(() => {
          iWin.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
        }, 150);
        // Press ArrowRight
        iWin.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
        setTimeout(() => {
          iWin.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
        }, 200);
      })()`
    });

    await new Promise(r => setTimeout(r, 1500));

    // Check game state during play
    const liveState = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        if (!iframe) return null;
        const iDoc = iframe.contentDocument;
        const iWin = iframe.contentWindow;
        return {
          isLive: iWin.PlayWin?.isLive(),
          myScore: iDoc.querySelector('#pw-hud-my-score')?.textContent,
          oppScore: iDoc.querySelector('#pw-hud-opp-score')?.textContent,
          oppName: iDoc.querySelector('#pw-hud-opp-name')?.textContent,
          activeScreen: iDoc.querySelector('.pw-screen.active')?.id || 'none'
        };
      })()`,
      returnByValue: true
    });
    console.log('Live match state:', liveState?.result?.value);

    // Capture screenshot
    console.log('Capturing screenshot...');
    const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
    if (shot?.data) {
      const buf = Buffer.from(shot.data, 'base64');
      fs.writeFileSync('scratch/sky_live_match.png', buf);
      console.log('Saved scratch/sky_live_match.png, size:', buf.length);
    }

    ws.close();
  });
}

testSkyMatch().catch(console.error);
