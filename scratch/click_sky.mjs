import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function clickSkyCard() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const cards = Array.from(document.querySelectorAll('.game-card, [class*="gameCard"], [class*="card"]'));
          const skyCard = cards.find(c => c.innerText.includes('Sky Runner 3D'));
          if (skyCard) {
            const btn = skyCard.querySelector('button');
            if (btn) {
              btn.click();
              return 'Clicked Sky Runner 3D button';
            }
          }
          return 'Sky Runner card or button not found';
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
        // Check DOM after 1 second
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `({
              url: window.location.href,
              modals: Array.from(document.querySelectorAll('iframe, [class*="modal"], [class*="Modal"], [class*="lobby"]')).map(el => ({
                tagName: el.tagName,
                src: el.src,
                className: el.className,
                innerText: el.innerText ? el.innerText.slice(0, 100) : ''
              }))
            })`,
            returnByValue: true
          }
        }));
      }, 1000);
    }
    if (msg.id === 2) {
      console.log('After click state:', JSON.stringify(msg.result.result.value, null, 2));
      ws.close();
    }
  });
}

clickSkyCard().catch(console.error);
