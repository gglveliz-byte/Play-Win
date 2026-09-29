import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

async function run() {
  console.log('Connecting simulated rival (carlos_pro)...');
  const wsRival = new WebSocket('ws://localhost:3001/ws');

  wsRival.on('open', () => {
    console.log('Rival in queue for carreras...');
    wsRival.send(JSON.stringify({
      action: 'JOIN_MATCH',
      player: {
        id: 'usr_carlos_pro',
        username: 'carlos_pro',
        avatar: '🏎️',
        rank: 'ORO',
        skillRating: 1840,
        gameId: 'carreras'
      }
    }));
  });

  wsRival.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Rival received:', msg.event);
    if (msg.event === 'MATCH_LIVE') {
      console.log('MATCH IS LIVE! Sending rival ticks...');
      setInterval(() => {
        if (wsRival.readyState === WebSocket.OPEN) {
          wsRival.send(JSON.stringify({
            action: 'PLAYER_TICK',
            x: 80,
            y: 850,
            score: 85,
            isAlive: true
          }));
        }
      }, 100);
    }
  });

  // Wait 1s for rival to enter queue
  await new Promise(r => setTimeout(r, 1000));

  const tempDir = path.join(os.tmpdir(), 'chrome-temp-live');
  const tempScreenshot = path.join(os.tmpdir(), 'carreras_live.png');
  const targetScreenshot = path.join(process.cwd(), 'scratch', 'carreras_live.png');

  console.log('Launching Chrome to pair and race...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const args = [
    '--headless',
    `--user-data-dir=${tempDir}`,
    `--screenshot=${tempScreenshot}`,
    '--window-size=1280,720',
    '--virtual-time-budget=10000',
    'http://localhost:3000/games/carreras/index.html'
  ];

  await execFileAsync(chromePath, args);
  console.log('Chrome finished! Copying screenshot...');
  fs.copyFileSync(tempScreenshot, targetScreenshot);
  console.log('Screenshot successfully saved to:', targetScreenshot);
  wsRival.close();
}

run().catch(console.error);
