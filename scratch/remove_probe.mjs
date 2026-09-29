/** Retira la instrumentación temporal SONDA de rooms.js. */
import fs from 'node:fs';

const FICHERO = 'apps/realtime-server/src/rooms.js';
let c = fs.readFileSync(FICHERO, 'utf8');
const antes = c.length;

// Elimina la línea de SONDA-TICKET y el bloque de SONDA de emparejamiento.
c = c
  .split('\n')
  .filter((l) => !l.includes('SONDA-TICKET') && !l.includes('SONDA]'))
  .filter((l) => !l.trim().startsWith('// SONDA-TEMP'))
  .join('\n');

fs.writeFileSync(FICHERO, c);
const quedan = (c.match(/SONDA/g) || []).length;
console.log(`  rooms.js: ${antes - c.length} bytes retirados · referencias a SONDA restantes: ${quedan}`);
console.log(quedan === 0 ? '  ✅ instrumentación limpia' : '  ❌ quedan referencias');
