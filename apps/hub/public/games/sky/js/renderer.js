// ==================================================================
// PLAY WIN: SKY RUNNER 3D — RENDERER & 3D PROJECTION
// Renderizado 3D de alta fidelidad, pista ondulante y rival fantasma (< 220 líneas)
// ==================================================================

export const cameraInFront = 3;
export const F = 0.7;

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

export function drawTrack(ctx, trackManager, x, z, canvasWidth, canvasHeight, isPortrait) {
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
          const [ax, ay] = project(i - 3.5, 0, dz, canvasWidth, canvasHeight, isPortrait, x, z);
          const [bx, by] = project(i - 2.5, 0, dz, canvasWidth, canvasHeight, isPortrait, x, z);
          const [ex, ey] = project(i - 3.5, 0, dzNext, canvasWidth, canvasHeight, isPortrait, x, z);
          const [fx, fy] = project(i - 2.5, 0, dzNext, canvasWidth, canvasHeight, isPortrait, x, z);

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

export function drawPlayerBall(ctx, x, y, z, canvasWidth, canvasHeight, isPortrait, isOverTrack) {
  if (y >= 0 && isOverTrack) {
    const [sx, sy, scale] = project(x, 0, cameraInFront, canvasWidth, canvasHeight, isPortrait, x, z);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, scale * 0.32, scale * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const [ballX, ballY, ballScale] = project(x, y + 0.35, cameraInFront, canvasWidth, canvasHeight, isPortrait, x, z);
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
  if (dz <= 0.4 || dz >= 44) return;

  ctx.save();
  ctx.globalAlpha = 0.85;

  if (rival.isAlive) {
    const [rsx, rsy, rscale] = project(rival.x, 0, dz, canvasWidth, canvasHeight, isPortrait, playerX, playerZ);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(rsx, rsy, rscale * 0.32, rscale * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const rivalY = rival.isAlive ? 0.35 : -2.0;
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
