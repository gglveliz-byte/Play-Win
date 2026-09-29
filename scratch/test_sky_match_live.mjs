import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);
import { env } from './load-env.mjs';

const JWT_SECRET = env('JWT_SECRET');

function makeMatchTicket(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    username: user.username,
    avatar: user.avatar,
    gameId: 'sky',
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString('base64url');

  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function run() {
  const token = makeMatchTicket({ id: 'usr_pilot_77', username: 'PilotoSky', avatar: '⚡' });
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><style>body,html,iframe{margin:0;padding:0;width:100%;height:100%;border:none;overflow:hidden;}</style></head>
    <body>
      <iframe id="game" src="http://localhost:3000/games/sky/index.html"></iframe>
      <script>
        const iframe = document.getElementById('game');
        window.addEventListener('message', (e) => {
          if (e.data?.type === 'PLAYWIN_READY') {
            iframe.contentWindow.postMessage({
              type: 'PLAYWIN_INIT',
              payload: {
                token: '${token}',
                playerId: 'usr_pilot_77',
                username: 'PilotoSky',
                avatar: '⚡',
                rank: 'ORO',
                skillRating: 1850,
                wsUrl: 'ws://localhost:3001/ws'
              }
            }, '*');
          }
        });
      </script>
    </body>
    </html>
  `;

  const launcherPath = path.join(os.tmpdir(), 'launcher_sky_test.html');
  fs.writeFileSync(launcherPath, htmlContent);

  const tempDir = path.join(os.tmpdir(), 'chrome-temp-sky-match');
  const tempScreenshot = path.join(os.tmpdir(), 'sky_live_match.png');
  const targetScreenshot = path.join(process.cwd(), 'scratch', 'sky_live_match.png');

  console.log('Capturing Sky live match with ticket and countdown/gameplay...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const args = [
    '--headless',
    `--user-data-dir=${tempDir}`,
    `--screenshot=${tempScreenshot}`,
    '--window-size=1280,720',
    '--virtual-time-budget=12000',
    `file://${launcherPath}`
  ];

  await execFileAsync(chromePath, args);
  fs.copyFileSync(tempScreenshot, targetScreenshot);
  console.log('Screenshot successfully saved to:', targetScreenshot);
}

run().catch(console.error);
