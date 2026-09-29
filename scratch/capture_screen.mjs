import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import fs from 'fs';

async function captureScreenshot() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const hubTab = tabs.find(t => t.url.includes('3000'));
  const ws = new WebSocket(hubTab.webSocketDebuggerUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Page.captureScreenshot',
      params: { format: 'png' }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id === 1) {
      const buffer = Buffer.from(msg.result.data, 'base64');
      fs.writeFileSync('scratch/sky_screenshot.png', buffer);
      console.log('Saved scratch/sky_screenshot.png, size:', buffer.length);
      ws.close();
    }
  });
}

captureScreenshot().catch(console.error);
