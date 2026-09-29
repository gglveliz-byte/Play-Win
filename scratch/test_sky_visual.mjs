import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

async function run() {
  const tempDir = path.join(os.tmpdir(), 'chrome-temp-sky');
  const tempScreenshot = path.join(os.tmpdir(), 'sky_live.png');
  const targetScreenshot = path.join(process.cwd(), 'scratch', 'sky_live.png');

  console.log('Capturing Sky Runner 3D in action...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const args = [
    '--headless',
    `--user-data-dir=${tempDir}`,
    `--screenshot=${tempScreenshot}`,
    '--window-size=1280,720',
    '--virtual-time-budget=3000',
    'http://localhost:3000/games/sky/index.html'
  ];

  await execFileAsync(chromePath, args);
  fs.copyFileSync(tempScreenshot, targetScreenshot);
  console.log('Screenshot saved to:', targetScreenshot);
}

run().catch(console.error);
