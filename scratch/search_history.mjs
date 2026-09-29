import fs from 'fs';
import path from 'path';

function searchHistory(baseDir) {
  if (!fs.existsSync(baseDir)) return;
  const dirs = fs.readdirSync(baseDir);
  for (const d of dirs) {
    const full = path.join(baseDir, d);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        const entriesFile = path.join(full, 'entries.json');
        if (fs.existsSync(entriesFile)) {
          const content = fs.readFileSync(entriesFile, 'utf8');
          if (content.toLowerCase().includes('sky')) {
            console.log('Found match in:', full);
            console.log(content);
          }
        }
      }
    } catch (e) {}
  }
}

console.log('Searching Code history...');
searchHistory('C:\\Users\\HP\\AppData\\Roaming\\Code\\User\\History');
console.log('Searching Cursor history...');
searchHistory('C:\\Users\\HP\\AppData\\Roaming\\Cursor\\User\\History');
