import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function checkIframeDetails() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  console.log('All targets:', tabs.map(t => ({ type: t.type, url: t.url, id: t.id })));

  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    
    // Evaluate inside iframe
    ws.send(JSON.stringify({
      id: 3,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const iframe = document.querySelector('iframe');
          if (!iframe) return 'No iframe';
          try {
            const iDoc = iframe.contentDocument || iframe.contentWindow.document;
            const canvas = iDoc.querySelector('canvas');
            const stateText = iDoc.body.innerText;
            const overlays = Array.from(iDoc.querySelectorAll('[id*="pw-"], [class*="pw-"]')).map(el => ({
              id: el.id,
              className: el.className,
              text: el.innerText
            }));
            return {
              canvas: !!canvas,
              canvasWidth: canvas?.width,
              canvasHeight: canvas?.height,
              bodyText: stateText,
              overlays: overlays,
              playWinReady: !!iframe.contentWindow.PlayWin
            };
          } catch (e) {
            return { error: e.message };
          }
        })()`,
        returnByValue: true
      }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id === 3) {
      console.log('Iframe internal state:', JSON.stringify(msg.result.result.value, null, 2));
      ws.close();
    }
  });
}

checkIframeDetails().catch(console.error);
