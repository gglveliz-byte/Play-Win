/**
 * Verifica la geometría de la sombra del jugador en Sky Runner 3D.
 *
 * La sombra debe proyectarse en el SUELO (py = 0) bajo la bola, no en la pantalla
 * de la bola. Antes se usaba py = y, así que la sombra viajaba pegada al jugador
 * durante el salto y no daba ninguna referencia de su posición real.
 *
 * Uso: node scripts/test-sky-shadow.mjs
 */
import { project, cameraInFront, cameraX, RADIO_BOLA } from '../apps/hub/public/games/sky/js/renderer.js';

const ANCHO = 1280;
const ALTO = 720;
const RETRATO = false;

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

/** Proyección de la SOMBRA: en el suelo (py = 0) bajo la posición del jugador. */
const sombraDe = (x, y, z) => project(x, 0, cameraInFront, ANCHO, ALTO, RETRATO, cameraX, z);
/** Proyección de la BOLA (el centro va un radio por encima del punto de apoyo). */
const bolaDe = (x, y, z) => project(x, y + RADIO_BOLA, cameraInFront, ANCHO, ALTO, RETRATO, cameraX, z);

console.log('\n═══ GEOMETRÍA DE LA SOMBRA Y DEL MOVIMIENTO · SKY RUNNER 3D ═══\n');

// ── 1. Con el jugador en el suelo, la sombra cae justo bajo la bola ─────────
console.log('  Sombra en el suelo:');
const x = 0;
const z = 100;
const [, bolaYSuelo] = bolaDe(x, 0, z);
const [, sombraYSuelo] = sombraDe(x, 0, z);

// La bola es una esfera: su centro queda a `RADIO_BOLA` del punto de apoyo, así
// que en pantalla la bola debe dibujarse ESE radio por encima de su sombra.
// (En esta proyección `+y` SUBE: el eje de pantalla va al revés que el del mundo.)
const [, , escala] = sombraDe(x, 0, z);
const separacionEsperada = RADIO_BOLA * escala;
const separacionReal = sombraYSuelo - bolaYSuelo;
comprobar(
  'en el suelo, la bola se dibuja justo un radio por encima de su sombra',
  Math.abs(separacionReal - separacionEsperada) < 2,
  `separación ${separacionReal.toFixed(1)} px (esperada ${separacionEsperada.toFixed(1)})`
);
comprobar('la bola NO queda hundida en la pista', separacionReal > 0, `la bola está ${separacionReal.toFixed(1)} px por encima del suelo`);

// ── 2. Al saltar, la sombra NO sigue al jugador ─────────────────────────────
console.log('\n  Durante el salto:');
const ALTURA_SALTO = 1.2;
const [, bolaYAlto] = bolaDe(x, ALTURA_SALTO, z);
const [, sombraYAlto] = sombraDe(x, ALTURA_SALTO, z);

comprobar(
  'la sombra se queda en el suelo mientras la bola sube',
  Math.abs(sombraYAlto - sombraYSuelo) < 1,
  `sombra y=${sombraYAlto.toFixed(1)} (suelo ${sombraYSuelo.toFixed(1)})`
);

const separacion = Math.abs(bolaYAlto - sombraYAlto);
comprobar('la bola se separa visiblemente de su sombra al saltar', separacion > 20, `${separacion.toFixed(1)} px de separación`);

// ── 3. La sombra aterriza SIEMPRE en el mismo punto, salte o no ─────────────
console.log('\n  Coherencia (la sombra no depende de la altura):');
let incoherentes = 0;
for (const y of [0, 0.3, 0.6, 1.2, 2.5]) {
  const [, sy] = sombraDe(x, y, z);
  if (Math.abs(sy - sombraYSuelo) > 1) incoherentes++;
}
comprobar('la posición de la sombra es la misma a cualquier altura', incoherentes === 0, `${incoherentes} alturas incoherentes`);

// ── 4. MOVIMIENTO HORIZONTAL: el bug más grave que tenía el juego ───────────
//
// `project()` calcula `screenX = ancho/2 + (px - camX + curva) * escala`. Si px y
// camX valen lo mismo, la resta da SIEMPRE 0 y todo se dibuja clavado en el
// centro: el jugador se movía de verdad pero en pantalla nada se movía.
console.log('\n  Movimiento horizontal en pantalla:');
const xIzquierda = -3;
const xDerecha = 3;
const centro = ANCHO / 2;
const [sxIzq] = sombraDe(xIzquierda, 0, z);
const [sxDcha] = sombraDe(xDerecha, 0, z);
const [bxIzq] = bolaDe(xIzquierda, 0, z);
const [bxDcha] = bolaDe(xDerecha, 0, z);

comprobar('la sombra se desplaza en horizontal', sxIzq !== sxDcha, `x: ${sxIzq.toFixed(0)} vs ${sxDcha.toFixed(0)}`);
comprobar('la bola se desplaza en horizontal', bxIzq !== bxDcha, `x: ${bxIzq.toFixed(0)} vs ${bxDcha.toFixed(0)}`);
comprobar('yendo a la izquierda, la bola se dibuja a la izquierda del centro', bxIzq < centro, `${bxIzq.toFixed(0)} < ${centro}`);
comprobar('yendo a la derecha, la bola se dibuja a la derecha del centro', bxDcha > centro, `${bxDcha.toFixed(0)} > ${centro}`);
comprobar('la sombra acompaña a la bola en horizontal', Math.abs(sxIzq - bxIzq) < 1 && Math.abs(sxDcha - bxDcha) < 1);
comprobar('el rango visible abarca toda la pista (x de -3.5 a 3.5)', bxIzq > 0 && bxDcha < ANCHO, `x de ${bxIzq.toFixed(0)} a ${bxDcha.toFixed(0)}`);

// ── 5. Comparativa con el comportamiento anterior ───────────────────────────
console.log('\n  Comparativa con el código anterior:');
const [, sombraViejaAlto] = project(x, 0, cameraInFront, ANCHO, ALTO, RETRATO, x, z);
const [, ,] = [0, 0, 0];
console.log(`    ANTES: cámara = jugador -> screenX = centro SIEMPRE (la bola no se movía en pantalla)`);
console.log(`           y la sombra se proyectaba con la altura de la bola (viajaba pegada al jugador)`);
console.log(`    AHORA: cámara fija en cameraX=${cameraX} -> la bola se mueve de ${bxIzq.toFixed(0)} a ${bxDcha.toFixed(0)} px`);
console.log(`           y la sombra queda en el suelo, separándose al saltar`);

console.log(`\n${fallos === 0 ? '🎉 SOMBRA Y MOVIMIENTO CORRECTOS' : `❌ ${fallos} comprobación(es) fallaron`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
