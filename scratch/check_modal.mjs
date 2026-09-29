import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function checkLobbyModal() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `({
          modalText: document.querySelector('.modal-content')?.innerText,
          buttons: Array.from(document.querySelectorAll('.modal-content button')).map(b => b.innerText.trim().replace(/\\n/g, ' ')),
          iframe: document.querySelector('iframe')?.src
        })`,
        returnByValue: true
      }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id === 1) {
      console.log('Modal state:', JSON.stringify(msg.result.result.value, null, 2));
      ws.close();
    }
  });
}

checkLobbyModal().catch(console.error);
