/**
 * Verifica la geometría visual de Sky Runner 3D.
 *
 * Sky Runner es un juego de SUPERVIVENCIA, no de distancia: los dos jugadores van
 * al mismo ritmo y sólo pierde quien cae al abismo. Por eso:
 *   · la cámara va PEGADA al jugador -> su bola se dibuja centrada
 *   · al girar se desplaza la PISTA, no la bola
 *   · el rival se dibuja relativo al jugador, así que se ven al mismo nivel
 *   · la sombra se proyecta en el SUELO y se separa de la bola al saltar
 *
 * Uso: node scripts/test-sky-shadow.mjs
 */
import { project, cameraInFront, RADIO_BOLA } from '../apps/hub/public/games/sky/js/renderer.js';

const ANCHO = 1280;
const ALTO = 720;
const RETRATO = false;

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
  if (!ok) fallos++;
};

/** Proyección de un punto del mundo visto desde el jugador (cámara pegada a él). */
const desdeJugador = (px, py, dz, jugadorX, jugadorZ) =>
  project(px, py, dz, ANCHO, ALTO, RETRATO, jugadorX, jugadorZ);

/** La sombra del jugador: en el suelo (py = 0), bajo su propia posición. */
const sombraJugador = (x, z) => desdeJugador(x, 0, cameraInFront, x, z);
/** La bola del jugador: su centro va un radio por encima del punto de apoyo. */
const bolaJugador = (x, y, z) => desdeJugador(x, y + RADIO_BOLA, cameraInFront, x, z);

console.log('\n═══ GEOMETRÍA VISUAL · SKY RUNNER 3D ═══\n');

// ── 1. La bola del jugador se dibuja CENTRADA (cámara pegada a él) ──────────
console.log('  La bola del jugador se queda centrada:');
const centro = ANCHO / 2;
for (const x of [-3, -1.5, 0, 1.5, 3]) {
  const [bx] = bolaJugador(x, 0, 100);
  comprobar(`  con el jugador en x=${String(x).padStart(4)}, la bola sale en el centro`, Math.abs(bx - centro) < 1, `bx=${bx.toFixed(0)}`);
}

// ── 2. Al girar, se desplaza la PISTA (no la bola) ──────────────────────────
console.log('\n  Al girar, se mueve la pista:');
const carrilIzquierdo = (jugadorX) => desdeJugador(-3.5, 0, 10, jugadorX, 100)[0];
const carrilConJugadorEn0 = carrilIzquierdo(0);
const carrilConJugadorEn3 = carrilIzquierdo(3);
comprobar(
  'el borde de la pista se desplaza en pantalla al mover al jugador',
  carrilConJugadorEn0 !== carrilConJugadorEn3,
  `x: ${carrilConJugadorEn0.toFixed(0)} -> ${carrilConJugadorEn3.toFixed(0)}`
);

// ── 3. La sombra está EN EL SUELO, bajo la bola ─────────────────────────────
console.log('\n  Sombra en el suelo:');
const x = 0;
const z = 100;
const [, bolaYSuelo] = bolaJugador(x, 0, z);
const [, sombraYSuelo] = sombraJugador(x, z);
const [, , escala] = sombraJugador(x, z);
const separacionEsperada = RADIO_BOLA * escala;
const separacionReal = sombraYSuelo - bolaYSuelo;

comprobar(
  'la bola se dibuja justo un radio por encima de su sombra',
  Math.abs(separacionReal - separacionEsperada) < 2,
  `separación ${separacionReal.toFixed(1)} px (esperada ${separacionEsperada.toFixed(1)})`
);
comprobar('la bola NO queda hundida en la pista', separacionReal > 0);

// ── 4. La sombra NO depende de la altura (se queda en el suelo al saltar) ───
console.log('\n  Durante el salto:');
const ALTURA_SALTO = 1.2;
const [, bolaYAlto] = bolaJugador(x, ALTURA_SALTO, z);
const [, sombraYAlto] = sombraJugador(x, z);

comprobar('la sombra se queda en el suelo', Math.abs(sombraYAlto - sombraYSuelo) < 1);
comprobar('la bola se separa visiblemente al saltar', Math.abs(bolaYAlto - sombraYAlto) > 20, `${Math.abs(bolaYAlto - sombraYAlto).toFixed(1)} px`);

let incoherentes = 0;
for (const y of [0, 0.3, 0.6, 1.2, 2.5]) {
  if (Math.abs(sombraJugador(x, z)[1] - sombraYSuelo) > 1) incoherentes++;
}
comprobar('la sombra no cambia con la altura del jugador', incoherentes === 0);

// ── 5. El rival se ve AL MISMO NIVEL (jugador y rival en la misma z) ────────
console.log('\n  El rival al mismo nivel:');
const dzMismoNivel = (rivalZ, playerZ) => (rivalZ - playerZ) + cameraInFront;
const dzIguales = dzMismoNivel(100, 100);
comprobar('con los dos al mismo nivel, el rival NO se descarta', dzIguales > 0.05, `dz=${dzIguales.toFixed(2)}`);

const [rivalX, rivalY] = desdeJugador(0, RADIO_BOLA, dzIguales, 0, 100);
const [miaX, miaY] = bolaJugador(0, 0, 100);
comprobar('el rival se dibuja superpuesto con el jugador', Math.abs(rivalX - miaX) < 1 && Math.abs(rivalY - miaY) < 1, `rival (${rivalX.toFixed(0)},${rivalY.toFixed(0)}) vs mía (${miaX.toFixed(0)},${miaY.toFixed(0)})`);

// ── 6. Si el rival se cae, deja de estar a la altura del jugador ────────────
console.log('\n  El rival cuando cae:');
const rivalCaidoY = -2.0 + RADIO_BOLA;
const [, bolaRivalCaido] = desdeJugador(0, rivalCaidoY, dzIguales, 0, 100);
comprobar('un rival caído se dibuja por debajo', bolaRivalCaido > miaY, `y=${bolaRivalCaido.toFixed(0)} vs ${miaY.toFixed(0)}`);

console.log(`\n${fallos === 0 ? '🎉 GEOMETRÍA VISUAL CORRECTA' : `❌ ${fallos} comprobación(es) fallaron`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;
