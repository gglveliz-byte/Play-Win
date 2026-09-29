import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function getPageDetails() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `Array.from(document.querySelectorAll('button, a, [role="button"]')).map(b => ({
          text: b.innerText.trim().replace(/\\n/g, ' '),
          id: b.id,
          className: b.className
        }))`,
        returnByValue: true
      }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id === 1) {
      console.log('Buttons:', JSON.stringify(msg.result.result.value, null, 2));
      ws.close();
    }
  });
}

getPageDetails().catch(console.error);
