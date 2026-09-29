/**
 * Sustituye en rooms.js los tres métodos de cierre duplicados
 * (_finalizarEmpate, _finalizarDuelo, _finishMatch) por delegados al módulo
 * match-end.js. Se hace con script por el tamaño del bloque y los saltos CRLF.
 */
import fs from 'node:fs';

const FICHERO = 'apps/realtime-server/src/rooms.js';
let lineas = fs.readFileSync(FICHERO, 'utf8').split('\n');

/** Localiza un método por su firma y devuelve [inicio, fin] por balance de llaves. */
function localizar(firmas) {
  const inicio = lineas.findIndex((l) => firmas.test(l));
  if (inicio < 0) return null;
  let prof = 0;
  for (let i = inicio; i < lineas.length; i++) {
    for (const ch of lineas[i]) {
      if (ch === '{') prof++;
      else if (ch === '}') prof--;
    }
    if (prof === 0 && i > inicio) return [inicio, i];
  }
  return null;
}

const DELEGADOS = {
  _finalizarEmpate: `  /** Cierra en EMPATE. La lógica vive en match-end.js. */
  _finalizarEmpate(room, resumen) {
    cerrarEnEmpate(this._ctxCierre(), room, resumen);
  }`,
  _finalizarDuelo: `  /** Cierra con un ganador. La lógica vive en match-end.js. */
  _finalizarDuelo(room, ganador, perdedor, motivo, resumen, puntosGanador) {
    cerrarConGanador(this._ctxCierre(), room, ganador, perdedor, motivo, resumen, puntosGanador);
  }`,
  _finishMatch: `  /** Cierra con un ganador sin limpiar el reloj. La lógica vive en match-end.js. */
  _finishMatch(room, ganador, perdedor, motivo, resumen, puntosGanador) {
    if (room.ghostSimulation) room.ghostSimulation.stop();
    cerrarConGanador(this._ctxCierre(), room, ganador, perdedor, motivo, resumen, puntosGanador);
  }`,
};

const CTX = `  /** Dependencias que necesita match-end.js para cerrar un duelo. */
  _ctxCierre() {
    return {
      broadcast: this._broadcastToRoom.bind(this),
      matchService,
      limpiar: (roomId, delayMs) => this._cleanupRoom(roomId, delayMs),
    };
  }`;

// Reemplaza de abajo hacia arriba para no desplazar los índices.
const encontrados = [];
for (const [nombre, codigo] of Object.entries(DELEGADOS)) {
  const rango = localizar(new RegExp(`^\\s{2}${nombre}\\(`));
  if (rango) encontrados.push({ nombre, rango, codigo });
  else console.log(`  ⚠️  no se encontró ${nombre}`);
}

encontrados.sort((a, b) => b.rango[0] - a.rango[0]);
for (const { nombre, rango, codigo } of encontrados) {
  console.log(`  ${nombre}: líneas ${rango[0] + 1}-${rango[1] + 1} (${rango[1] - rango[0] + 1}) -> delegado`);
  lineas = [...lineas.slice(0, rango[0]), ...codigo.split('\n'), ...lineas.slice(rango[1] + 1)];
}

// Añade _ctxCierre justo antes del primer delegado.
const primerDelegado = lineas.findIndex((l) => /^\s{2}_finalizarEmpate\(/.test(l));
lineas = [...lineas.slice(0, primerDelegado), ...CTX.split('\n'), '', ...lineas.slice(primerDelegado)];

fs.writeFileSync(FICHERO, lineas.join('\n'));
console.log(`\n  rooms.js: ${lineas.length} líneas ${lineas.length <= 350 ? '✅' : '❌ (límite 350)'}`);
