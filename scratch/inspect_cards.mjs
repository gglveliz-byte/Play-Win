import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function getCards() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `Array.from(document.querySelectorAll('.game-card, [class*="gameCard"], [class*="card"]')).map(c => ({
          title: c.querySelector('h2, h3, h4')?.innerText,
          button: c.querySelector('button')?.innerText
        })).filter(x => x.title)`,
        returnByValue: true
      }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id === 1) {
      console.log('Cards:', JSON.stringify(msg.result.result.value, null, 2));
      ws.close();
    }
  });
}

getCards().catch(console.error);
