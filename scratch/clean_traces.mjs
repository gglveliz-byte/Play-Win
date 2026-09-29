/**
 * Retira las trazas de DIAGNÓSTICO del SDK, conservando la lógica y los
 * console.error útiles (esos deben quedarse: informan de fallos reales).
 *
 * Se hace con expresiones regulares tolerantes a CRLF/LF porque los reemplazos
 * literales fallaban en silencio por el tipo de salto de línea.
 */
import fs from 'node:fs';

const RETIRAR = [
  {
    archivo: 'packages/game-sdk/playwin-bridge-connection.js',
    patrones: [
      /\n\s*\/\/ Traza de diagnóstico: permite ver si el constructor del WebSocket falla,\n\s*\/\/ que en un contexto aislado ocurre sin ningún error visible\./,
      /\n\s*console\.log\('\[PlayWin SDK\] abriendo WebSocket en', api\.wsUrl\(\)\);/,
      /\n\s*console\.log\('\[PlayWin SDK\] socket creado, readyState =', socket\.readyState\);/,
      /\n\s*else if \(typeof console !== 'undefined'\) \{\n\s*console\.log\('\[PlayWin SDK\] manejador de mensajes registrado \(se enganchará al abrir el socket\)'\);\n\s*\}/,
    ],
  },
  {
    archivo: 'packages/game-sdk/playwin-bridge.js',
    patrones: [
      /\n\s*\/\/ Traza del punto de decisión: sin esto es imposible saber si el SDK se negó\n\s*\/\/ a conectar por falta de token o si el socket falló después\./,
      /\n\s*console\.log\('\[PlayWin SDK\] connectWebSocket\(\):', \{\n\s*hayPlayer: !!currentPlayer,\n\s*hayToken: !!\(currentPlayer && currentPlayer\.token\),\n\s*wsUrl: WS_URL,\n\s*\}\);/,
    ],
  },
];

let total = 0;

for (const { archivo, patrones } of RETIRAR) {
  if (!fs.existsSync(archivo)) {
    console.log(`  ⚠️  ${archivo}: no existe`);
    continue;
  }
  let c = fs.readFileSync(archivo, 'utf8');
  const antes = c.length;

  for (const p of patrones) c = c.replace(p, '');

  fs.writeFileSync(archivo, c);
  const quitado = antes - c.length;
  total += quitado;
  console.log(`  ${archivo.split('/').pop()}: ${quitado} bytes de trazas retirados`);
}

console.log(`\n  Total: ${total} bytes`);
console.log('  Se CONSERVAN los console.error (informan de fallos reales)');
