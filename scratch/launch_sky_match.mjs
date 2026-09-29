import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function clickFindRival() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('BUSCAR RIVAL 1v1'));
          if (btn) {
            btn.click();
            return 'Clicked BUSCAR RIVAL 1v1';
          }
          return 'Button not found';
        })()`,
        returnByValue: true
      }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id === 1) {
      console.log('Result:', msg.result.result.value);
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `({
              iframe: document.querySelector('iframe')?.src,
              iframeCount: document.querySelectorAll('iframe').length,
              modalContent: document.querySelector('.modal-content, [class*="launcher"]')?.innerText
            })`,
            returnByValue: true
          }
        }));
      }, 2000);
    }
    if (msg.id === 2) {
      console.log('Launcher state:', JSON.stringify(msg.result.result.value, null, 2));
      ws.close();
    }
  });
}

clickFindRival().catch(console.error);
