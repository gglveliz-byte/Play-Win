import WebSocket from '../apps/realtime-server/node_modules/ws/index.js';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

async function checkConsole() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join(os.tmpdir(), 'pw-chrome-hydration-' + Date.now());

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tempProfile}`,
    '--window-size=1280,800',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  let hubTarget = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const targets = await res.json();
      hubTarget = targets.find(t => t.url && t.url.includes('3000')) || targets.find(t => t.type === 'page');
      if (hubTarget && hubTarget.webSocketDebuggerUrl) break;
    } catch (_) {}
  }

  if (!hubTarget) {
    console.error('No target found');
    chrome.kill();
    process.exit(1);
  }

  const cdp = new WebSocket(hubTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      cdp.send(JSON.stringify({ id, method, params }));
    });
  }

  const logs = [];

  cdp.on('message', (data) => {
    const res = JSON.parse(data.toString());
    if (res.id && pending.has(res.id)) {
      const { resolve, reject } = pending.get(res.id);
      pending.delete(res.id);
      if (res.error) reject(res.error);
      else resolve(res.result);
    }
    if (res.method === 'Runtime.consoleAPICalled') {
      const args = res.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      logs.push(`[Console ${res.params.type}] ${args}`);
    }
    if (res.method === 'Log.entryAdded') {
      logs.push(`[Log ${res.params.entry.level}] ${res.params.entry.text}`);
    }
  });

  await new Promise(r => cdp.on('open', r));
  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');
  await sendCommand('Log.enable');

  // Reload page to capture hydration phase
  console.log('🔄 Recargando página para capturar errores de hidratación...');
  await sendCommand('Page.reload');

  await new Promise(r => setTimeout(r, 4000));

  console.log('--- LOGS CAPTURADOS ---');
  for (const log of logs) {
    if (log.toLowerCase().includes('hydrate') || log.toLowerCase().includes('warning') || log.toLowerCase().includes('error')) {
      console.log(log);
    }
  }

  cdp.close();
  chrome.kill();
}

checkConsole().catch(console.error);
