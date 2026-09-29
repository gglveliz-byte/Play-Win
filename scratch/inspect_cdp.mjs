import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';

async function inspectChrome() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  if (!hubTab) {
    console.log('No hub tab found, available:', tabs);
    return;
  }
  console.log('Hub tab found:', hubTab.webSocketDebuggerUrl);

  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);
  ws.on('open', () => {
    console.log('Connected to CDP');
    // Capture console events
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    // Evaluate DOM state
    ws.send(JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
      params: {
        expression: `({
          url: window.location.href,
          title: document.title,
          modals: Array.from(document.querySelectorAll('[class*="modal"], [class*="Modal"], iframe')).map(el => ({
            tagName: el.tagName,
            src: el.src,
            className: el.className,
            visible: el.offsetParent !== null
          }))
        })`,
        returnByValue: true
      }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id === 2) {
      console.log('Evaluation result:', JSON.stringify(msg.result, null, 2));
      ws.close();
    }
  });
}

inspectChrome().catch(console.error);
