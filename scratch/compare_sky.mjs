import fs from 'fs';
import path from 'path';

const srcDir = 'c:\\Users\\HP\\OneDrive\\Documentos\\GitHub\\Play Win\\sky';
const dstDir = 'c:\\Users\\HP\\OneDrive\\Documentos\\GitHub\\Play Win\\apps\\hub\\public\\games\\sky';

function compareDirs(dir1, dir2) {
  const f1 = fs.readdirSync(dir1);
  for (const f of f1) {
    const p1 = path.join(dir1, f);
    const p2 = path.join(dir2, f);
    const stat1 = fs.statSync(p1);
    if (stat1.isDirectory()) {
      if (!fs.existsSync(p2)) {
        console.log(`Directory ${f} missing in dst`);
      } else {
        compareDirs(p1, p2);
      }
    } else {
      if (!fs.existsSync(p2)) {
        console.log(`File ${f} missing in dst`);
      } else {
        const c1 = fs.readFileSync(p1, 'utf8');
        const c2 = fs.readFileSync(p2, 'utf8');
        if (c1 !== c2) {
          console.log(`DIFF: ${p1} vs ${p2} (len ${c1.length} vs ${c2.length})`);
        } else {
          console.log(`IDENTICAL: ${f}`);
        }
      }
    }
  }
}

compareDirs(srcDir, dstDir);
