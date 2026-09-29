import fs from 'node:fs';
import path from 'node:path';

function getFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    if (item === 'node_modules' || item === '.next' || item === '.git') continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      getFiles(full, files);
    } else if (/\.(js|ts|tsx|css)$/.test(item)) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = [...getFiles('apps'), ...getFiles('packages')];
console.log('Total files scanned:', allFiles.length);

const over350 = [];
const over800 = [];

for (const file of allFiles) {
  // Ignorar motores legacy de juegos en public/games
  const norm = file.replace(/\\/g, '/');
  const isLegacyGame = norm.includes('public/games/');
  const lines = fs.readFileSync(file, 'utf8').split('\n').length;
  if (!isLegacyGame && lines > 350) {
    over350.push({ file: norm, lines });
  }
  if (!isLegacyGame && lines > 800) {
    over800.push({ file: norm, lines });
  }
}

console.log('Files over 350 lines (excluding legacy games):', over350);
console.log('Files over 800 lines (excluding legacy games):', over800);
