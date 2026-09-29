import fs from 'fs';
import path from 'path';

const historyDir = 'C:\\Users\\HP\\AppData\\Roaming\\Code\\User\\History';

try {
  const dirs = fs.readdirSync(historyDir);
  for (const dir of dirs) {
    const dPath = path.join(historyDir, dir);
    try {
      const stat = fs.statSync(dPath);
      if (!stat.isDirectory()) continue;
      const entriesPath = path.join(dPath, 'entries.json');
      if (fs.existsSync(entriesPath)) {
        const text = fs.readFileSync(entriesPath, 'utf8');
        if (text.toLowerCase().includes('sky')) {
          console.log('MATCH:', entriesPath);
          console.log(text);
          const files = fs.readdirSync(dPath);
          console.log('Files in dir:', files);
          for (const f of files) {
            if (f !== 'entries.json') {
              const fPath = path.join(dPath, f);
              const fStat = fs.statSync(fPath);
              console.log('File:', f, 'size:', fStat.size);
            }
          }
        }
      }
    } catch (e) {}
  }
} catch (e) {
  console.error(e);
}
