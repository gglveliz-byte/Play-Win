// ==================================================================
// PLAY WIN: SKY RUNNER 3D — RENDERER & 3D PROJECTION
// Renderizado 3D de alta fidelidad, pista ondulante y rival fantasma (< 220 líneas)
// ==================================================================

export const cameraInFront = 3;
export const F = 0.7;

/**
 * La cámara va PEGADA al jugador en horizontal.
 *
 * Sky Runner 3D no es una carrera de distancia: es un juego de SUPERVIVENCIA.
 * Los dos jugadores avanzan al mismo ritmo, así que lo único que decide el duelo
 * es quién cae al abismo. Por eso la bola se dibuja siempre en el centro de la
 * pantalla y lo que se desplaza es la pista al girar: el jugador ve moverse el
 * mundo, no su propia bola de lado a lado.
 *
 * (En carreras la cámara es fija y el coche se desplaza; aquí es al revés, y es
 * intencionado.)
 */
export const cameraSigueAlJugador = true;

export function initStars(numStars = 70) {
  const stars = [];
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random() * 0.75,
      size: 1 + (i % 3) * 0.8,
      speed: 0.3 + (i % 5) * 0.15,
    });
  }
  return stars;
}

export function project(px, py, dz, canvasWidth, canvasHeight, isPortrait, x, z) {
  const scale = (canvasHeight * F) / dz;
  const camOffsetY = isPortrait ? 1.4 : 2.0;
  const curve = ((dz - cameraInFront) ** 2 / 50) * Math.cos((z + dz) / 49);
  const screenX = canvasWidth / 2 + (px - x + curve) * scale;
  const screenY = canvasHeight / 2 - (py - camOffsetY + (dz * dz) / 50) * scale;
  return [screenX, screenY, scale];
}

export function drawSkyAndStars(ctx, stars, width, height, playerZ) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  const skyHue = (175 + playerZ * 0.08) % 360;
  skyGrad.addColorStop(0, `hsl(${skyHue}, 75%, 20%)`);
  skyGrad.addColorStop(0.5, `hsl(${(skyHue + 25) % 360}, 70%, 42%)`);
  skyGrad.addColorStop(1, `hsl(${(skyHue + 55) % 360}, 65%, 68%)`);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let sIdx = 0; sIdx < stars.length; sIdx++) {
    const star = stars[sIdx];
    const sx = (star.x * width + playerZ * star.speed * 14) % width;
    const sy = star.y * height;
    ctx.rect(sx, sy, star.size, star.size);
  }
  ctx.fill();
}

export function drawTrack(ctx, trackManager, camX, z, canvasWidth, canvasHeight, isPortrait) {
  // `camX` es la posición del JUGADOR: la cámara va pegada a él. Al girar, la
  // pista se desplaza a los lados y la bola se queda centrada, que es como debe
  // leerse un juego de supervivencia (ves moverse el mundo, no tu propia bola).
  const zInt = Math.floor(z);
  trackManager.ensureTrackUpTo(zInt + 42);

  for (let r = zInt + 40; r > zInt; r--) {
    const row = trackManager.getRow(r);
    if (!row) continue;

    const dz = r - z;
    const dzNext = dz + 1;
    const wallH = ((40 - r + z) / 30) * canvasHeight;

    const sectorHue = (99 + (r >> 7) * 70) % 360;
    const sideColor0 = `hsl(${sectorHue}, 60%, 30%)`;
    const sideColor1 = `hsl(${sectorHue}, 60%, 39%)`;
    const frontColor0 = `hsl(${sectorHue}, 60%, 9%)`;
    const frontColor1 = `hsl(${sectorHue}, 60%, 14%)`;
    const topColor0 = `hsl(${sectorHue}, 60%, 60%)`;
    const topColor1 = `hsl(${sectorHue}, 60%, 90%)`;

    for (let j = 2; j--; ) {
      for (let i = 7; i--; ) {
        if (row[i]) {
          const [ax, ay] = project(i - 3.5, 0, dz, canvasWidth, canvasHeight, isPortrait, camX, z);
          const [bx, by] = project(i - 2.5, 0, dz, canvasWidth, canvasHeight, isPortrait, camX, z);
          const [ex, ey] = project(i - 3.5, 0, dzNext, canvasWidth, canvasHeight, isPortrait, camX, z);
          const [fx, fy] = project(i - 2.5, 0, dzNext, canvasWidth, canvasHeight, isPortrait, camX, z);

          const isOdd = (r + i) & 1;
          if (j) {
            ctx.fillStyle = isOdd ? sideColor1 : sideColor0;
            ctx.fillRect(ex, ey, fx - ex, wallH);
          } else {
            ctx.fillStyle = isOdd ? frontColor1 : frontColor0;
            ctx.fillRect(ax, ay, bx - ax, wallH);

            ctx.fillStyle = isOdd ? topColor1 : topColor0;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.lineTo(fx, fy);
            ctx.lineTo(ex, ey);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
  }
}

/**
 * Radio de la bola en unidades del mundo.
 *
 * La bola rueda SOBRE la pista: cuando el motor dice `y = 0`, el punto de apoyo
 * está en el suelo y el CENTRO de la esfera queda un radio más arriba. Antes se
 * proyectaba el centro con `y + 0.35` mientras el suelo se proyectaba en `y`, y
 * el resultado era que la bola se dibujaba 58.8 px POR DEBAJO del suelo (hundida
 * en la pista), porque en esta proyección `+y` SUBE en pantalla.
 */
export const RADIO_BOLA = 0.35;

export function drawPlayerBall(ctx, x, y, z, canvasWidth, canvasHeight, isPortrait, isOverTrack) {
  // Cámara pegada al jugador: su bola se dibuja centrada y la pista se desplaza.
  const camX = x;
  // ------------------------------------------------------------------
  // SOMBRA PROYECTADA EN EL SUELO
  //
  // La sombra debe pintarse donde el suelo está DEBAJO de la bola, no en la
  // pantalla de la bola. Antes se proyectaba con `py = y`, es decir usando la
  // altura de la bola: la sombra aparecía pegada al jugador incluso en pleno
  // salto, y no daba ninguna referencia de la posición real.
  //
  // Ahora se proyecta con `py = 0` y la MISMA profundidad (`cameraInFront`), así
  // que queda en el punto exacto del carril sobre el que va el jugador.
  // ------------------------------------------------------------------
  if (isOverTrack) {
    const [sx, sy, scale] = project(x, 0, cameraInFront, canvasWidth, canvasHeight, isPortrait, camX, z);
    const ancho = scale * 0.32;
    const alto = scale * 0.12;
    if (alto > 0.5) {
      // La sombra se aclara y se encoge con la altura: cuanto más alto salta el
      // jugador, más lejos está del suelo y más difusa debe verse.
      const altura = Math.max(0, y);
      const encogimiento = Math.max(0.35, 1 - altura * 0.9);
      ctx.save();
      ctx.globalAlpha = Math.max(0.08, 0.42 - altura * 0.5);
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, ancho * encogimiento, alto * encogimiento, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const [ballX, ballY, ballScale] = project(x, y + RADIO_BOLA, cameraInFront, canvasWidth, canvasHeight, isPortrait, camX, z);
  const rBall = ballScale * 0.36;

  if (rBall > 1) {
    const ballGrad = ctx.createRadialGradient(
      ballX - rBall * 0.32, ballY - rBall * 0.32, rBall * 0.05,
      ballX, ballY, rBall
    );
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.25, '#ff4d94');
    ballGrad.addColorStop(0.7, '#cc0052');
    ballGrad.addColorStop(1, '#590024');

    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ballX, ballY, rBall, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawRivalGhost(ctx, rival, playerX, playerZ, canvasWidth, canvasHeight, isPortrait) {
  if (!rival.connected) return;

  const dz = (rival.z - playerZ) + cameraInFront;
  // El rival se dibuja a CUALQUIER profundidad cercana, incluso si va al mismo
  // nivel que el jugador. Antes se descartaba con `dz <= 0.4`, así que en cuanto
  // el rival se acercaba un poco DESAPARECÍA de la pantalla, y ese era el motivo
  // de que la "sombrita azul" no se viera nunca.
  if (dz <= 0.05 || dz >= 44) return;

  // Como los dos van al mismo nivel se solapan en el centro. Cuanto más cerca
  // está el rival, más transparente se dibuja Y más se desplaza de lado: con la
  // opacidad sola no bastaba, porque al ir exactamente al mismo nivel las dos
  // bolas caían en EL MISMO PÍXEL y se fundían en un borrón. El desplazamiento
  // lateral las mantiene al mismo NIVEL (que es lo que importa en este juego)
  // pero visibles por separado.
  const cercania = Math.max(0, 1 - Math.abs(dz - cameraInFront) / 6);
  const desplazamientoLateral = cercania * 42;
  ctx.save();
  ctx.globalAlpha = 0.85 - cercania * 0.35;
  ctx.translate(desplazamientoLateral, 0);

  if (rival.isAlive) {
    const [rsx, rsy, rscale] = project(rival.x, 0, dz, canvasWidth, canvasHeight, isPortrait, playerX, playerZ);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(rsx, rsy, rscale * 0.32, rscale * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const rivalY = (rival.isAlive ? 0 : -2.0) + RADIO_BOLA;
  const [ballX, ballY, ballScale] = project(rival.x, rivalY, dz, canvasWidth, canvasHeight, isPortrait, playerX, playerZ);
  const rBall = ballScale * 0.36;

  if (rBall > 1) {
    const ghostGrad = ctx.createRadialGradient(
      ballX - rBall * 0.32, ballY - rBall * 0.32, rBall * 0.05,
      ballX, ballY, rBall
    );
    ghostGrad.addColorStop(0, '#ffffff');
    ghostGrad.addColorStop(0.25, '#38bdf8');
    ghostGrad.addColorStop(0.7, '#0284c7');
    ghostGrad.addColorStop(1, '#082f49');

    ctx.fillStyle = ghostGrad;
    ctx.beginPath();
    ctx.arc(ballX, ballY, rBall, 0, Math.PI * 2);
    ctx.fill();

    const tagY = ballY - rBall - 12;
    const distDelta = Math.round(rival.z - playerZ);
    const sign = distDelta >= 0 ? `+${distDelta}` : `${distDelta}`;
    const tagText = `👻 ${rival.username || 'Rival'} (${sign}m)`;

    ctx.font = 'bold 11px "Inter", sans-serif';
    const textW = ctx.measureText(tagText).width;
    const padX = 8;
    const tagH = 18;

    ctx.fillStyle = 'rgba(12, 12, 14, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(ballX - textW / 2 - padX, tagY - tagH / 2, textW + padX * 2, tagH, 9);
    } else {
      ctx.rect(ballX - textW / 2 - padX, tagY - tagH / 2, textW + padX * 2, tagH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, ballX, tagY);
  }

  ctx.restore();
}
