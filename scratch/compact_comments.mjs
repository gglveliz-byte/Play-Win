/**
 * Comprime bloques de comentario de varias líneas a la forma // en una o varias
 * líneas densas, conservando TODO el texto. No toca el código.
 *
 * Se hace de forma programática y con validación posterior porque el archivo
 * roza el límite de 350 líneas de playwin-code-governance.
 */
import fs from 'node:fs';

const FICHERO = process.argv[2];
const OBJETIVO = Number(process.argv[3] || 350);

let lineas = fs.readFileSync(FICHERO, 'utf8').split('\n');
const antes = lineas.length;

/** Convierte un bloque / * ... * / en líneas // sin perder contenido. */
function comprimirBloques(lineas) {
  const salida = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];
    const abierto = linea.trim().startsWith('/*') && !linea.trim().startsWith('/*!');

    if (!abierto) {
      salida.push(linea);
      i++;
      continue;
    }

    // Recoge el bloque completo
    const bloque = [];
    let j = i;
    while (j < lineas.length && !lineas[j].includes('*/')) {
      bloque.push(lineas[j]);
      j++;
    }
    if (j >= lineas.length) {
      // Bloque sin cierre: devolver tal cual
      salida.push(linea);
      i++;
      continue;
    }
    bloque.push(lineas[j]);
    j++;

    // Extrae el texto útil de cada línea del bloque
    const texto = bloque
      .map((l) => l.replace(/^\s*\/?\*+\/?/, '').replace(/\*\/\s*$/, '').trim())
      .filter((l) => l.length > 0);

    if (texto.length <= 1) {
      salida.push(`${' '.repeat(linea.length - linea.trimStart().length)}// ${texto[0] || ''}`.trimEnd());
    } else {
      // Primera línea con el inicio, siguientes con la misma indentación
      const indent = linea.slice(0, linea.length - linea.trimStart().length);
      salida.push(`${indent}// ${texto[0]}`);
      for (let k = 1; k < texto.length; k++) salida.push(`${indent}// ${texto[k]}`);
    }

    i = j;
  }

  return salida;
}

lineas = comprimirBloques(lineas);
fs.writeFileSync(FICHERO, lineas.join('\n'));

console.log(`${FICHERO}`);
console.log(`  antes:   ${antes} líneas`);
console.log(`  después: ${lineas.length} líneas`);
console.log(`  ${lineas.length <= OBJETIVO ? '✅' : '❌'} límite ${OBJETIVO}`);
