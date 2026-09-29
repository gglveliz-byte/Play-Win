import fs from 'fs';

let code = fs.readFileSync('space/script.js', 'utf8');

// 1. Touch event listeners on canvas (lines ~247-270)
const oldTouch = `    // Control táctil intuitivo (arrastre de nave en toda la pantalla)
    canvas.addEventListener('touchstart', function (e) {
        audio.resume();
        var touch = e.touches[0];
        if (touch) {
            Input.touchX = touch.clientX;
            Input.touchY = touch.clientY - 35; // Compensación ergonómica hacia arriba
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
        var touch = e.touches[0];
        if (touch) {
            Input.touchX = touch.clientX;
            Input.touchY = touch.clientY - 35;
        }
    }, { passive: true });

    canvas.addEventListener('touchend', function () {
        Input.touchX = null;
        Input.touchY = null;
    }, { passive: true });`;

const newTouch = `    // Control táctil intuitivo (arrastre de nave en toda la pantalla)
    canvas.tabIndex = 1000;
    canvas.style.outline = 'none';
    var ensureFocus = function () { window.focus(); canvas.focus(); };
    window.addEventListener('click', ensureFocus);
    canvas.addEventListener('click', ensureFocus);

    canvas.addEventListener('touchstart', function (e) {
        audio.resume();
        ensureFocus();
        if (e.target && e.target.closest && e.target.closest('button')) return;
        var touch = e.touches[0];
        if (touch) {
            Input.touchX = touch.clientX;
            Input.touchY = touch.clientY - 35; // Compensación ergonómica hacia arriba
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        if (e.cancelable) e.preventDefault();
        var touch = e.touches[0];
        if (touch) {
            Input.touchX = touch.clientX;
            Input.touchY = touch.clientY - 35;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
        if (e.touches.length === 0) {
            Input.touchX = null;
            Input.touchY = null;
        }
    }, { passive: false });`;

if (code.includes(oldTouch)) {
    code = code.replace(oldTouch, newTouch);
    console.log('1. Touch listeners updated successfully');
} else {
    console.warn('1. WARNING: Could not find oldTouch snippet');
}

// 2. Touch dragging responsiveness in Player.prototype.update (lines ~550-559)
const oldPlayerTouch = `        // Control por toque o ratón arrastrado
        if (Input.touchX !== null && Input.touchY !== null) {
            var dx = Input.touchX - this.x;
            var dy = Input.touchY - this.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 4) {
                vx = (dx / dist) * Math.min(effectiveSpeed * 1.3, dist);
                vy = (dy / dist) * Math.min(effectiveSpeed * 1.3, dist);
            }
        }`;

const newPlayerTouch = `        // Control por toque o ratón arrastrado (súper ágil y responsivo para móvil)
        if (Input.touchX !== null && Input.touchY !== null) {
            var dx = Input.touchX - this.x;
            var dy = Input.touchY - this.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 3) {
                var maxMove = Math.max(effectiveSpeed * 2.0, dist * 0.45);
                vx = (dx / dist) * Math.min(maxMove, dist);
                vy = (dy / dist) * Math.min(maxMove, dist);
            }
        }`;

if (code.includes(oldPlayerTouch)) {
    code = code.replace(oldPlayerTouch, newPlayerTouch);
    console.log('2. Player touch movement updated successfully');
} else {
    console.warn('2. WARNING: Could not find oldPlayerTouch snippet');
}

// 3. UI Buttons for mobile (btn_shoot, btn_autofire, btn_bomb)
const oldButtons = `        var btnAutofire = document.getElementById('btn_autofire');
        if (btnAutofire) {
            btnAutofire.onclick = function () {
                self.autoShoot = !self.autoShoot;
                btnAutofire.textContent = 'AUTO: ' + (self.autoShoot ? 'SÍ' : 'NO');
                btnAutofire.classList.toggle('active', self.autoShoot);
            };
        }

        var btnShoot = document.getElementById('btn_shoot');
        if (btnShoot) {
            var fireOn = function (e) {
                e.preventDefault();
                audio.resume();
                Input.shoot = true;
            };
            var fireOff = function (e) {
                e.preventDefault();
                Input.shoot = false;
            };
            btnShoot.addEventListener('touchstart', fireOn, { passive: false });
            btnShoot.addEventListener('touchend', fireOff, { passive: false });
            btnShoot.addEventListener('mousedown', fireOn);
            btnShoot.addEventListener('mouseup', fireOff);
        }

        var btnBomb = document.getElementById('btn_bomb');
        if (btnBomb) {
            btnBomb.onclick = function () {
                self.triggerBomb();
            };
        }`;

const newButtons = `        var btnAutofire = document.getElementById('btn_autofire');
        if (btnAutofire) {
            var autoToggle = function (e) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                self.autoShoot = !self.autoShoot;
                btnAutofire.textContent = 'AUTO: ' + (self.autoShoot ? 'SÍ' : 'NO');
                btnAutofire.classList.toggle('active', self.autoShoot);
            };
            btnAutofire.addEventListener('touchstart', autoToggle, { passive: false });
            btnAutofire.addEventListener('click', autoToggle);
        }

        var btnShoot = document.getElementById('btn_shoot');
        if (btnShoot) {
            var fireOn = function (e) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                audio.resume();
                Input.shoot = true;
            };
            var fireOff = function (e) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                Input.shoot = false;
            };
            btnShoot.addEventListener('touchstart', fireOn, { passive: false });
            btnShoot.addEventListener('touchend', fireOff, { passive: false });
            btnShoot.addEventListener('mousedown', fireOn);
            btnShoot.addEventListener('mouseup', fireOff);
        }

        var btnBomb = document.getElementById('btn_bomb');
        if (btnBomb) {
            var bombTrigger = function (e) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                self.triggerBomb();
            };
            btnBomb.addEventListener('touchstart', bombTrigger, { passive: false });
            btnBomb.addEventListener('click', bombTrigger);
        }`;

if (code.includes(oldButtons)) {
    code = code.replace(oldButtons, newButtons);
    console.log('3. Mobile buttons updated successfully');
} else {
    console.warn('3. WARNING: Could not find oldButtons snippet');
}

// 4. PlayWin 20Hz Tick in GameManager.prototype.update
const oldShake = `        // Reducir temblor de pantalla
        if (this.screenShake > 0) this.screenShake *= 0.88;

        this.player.update(this.particles, this.gameSpeed);`;

const newShake = `        // Reducir temblor de pantalla
        if (this.screenShake > 0) this.screenShake *= 0.88;

        this.player.update(this.particles, this.gameSpeed);

        // Sincronización en tiempo real con PlayWin (20Hz)
        if (this.gameTimer % 3 === 0 && window.PlayWin && window.PlayWin.isLive()) {
            window.PlayWin.sendTick({
                x: Math.round(this.player.x),
                y: Math.round(this.player.y),
                score: this.score,
                isAlive: this.player.alive
            });
        }`;

if (code.includes(oldShake)) {
    code = code.replace(oldShake, newShake);
    console.log('4. PlayWin sendTick integrated successfully');
} else {
    console.warn('4. WARNING: Could not find oldShake snippet');
}

// 5. Crash notification in GameManager.prototype.gameOver
const oldGameOver = `    GameManager.prototype.gameOver = function () {
        this.state = 'gameover';
        audio.playGameOver();`;

const newGameOver = `    GameManager.prototype.gameOver = function () {
        this.state = 'gameover';
        audio.playGameOver();

        if (window.PlayWin && window.PlayWin.isLive()) {
            window.PlayWin.notifyCrash();
        }`;

if (code.includes(oldGameOver)) {
    code = code.replace(oldGameOver, newGameOver);
    console.log('5. PlayWin notifyCrash integrated successfully');
} else {
    console.warn('5. WARNING: Could not find oldGameOver snippet');
}

// 6. Rival ghost rendering in GameManager.prototype.render
const oldRender = `        if (this.state === 'playing' || this.state === 'paused') {
            this.player.render(ctx);
        }

        // Efectos y partículas
        this.particles.render(ctx);`;

const newRender = `        if (this.state === 'playing' || this.state === 'paused') {
            this.player.render(ctx);
        }

        // Renderizar nave rival en duelos 1v1 PlayWin
        if (window.PlayWin && window.PlayWin.isLive()) {
            var opp = window.PlayWin.getOpponentState();
            if (opp && opp.isAlive !== false) {
                this.renderRivalGhost(ctx, opp);
            }
        }

        // Efectos y partículas
        this.particles.render(ctx);`;

if (code.includes(oldRender)) {
    code = code.replace(oldRender, newRender);
    console.log('6. Rival rendering hook integrated successfully');
} else {
    console.warn('6. WARNING: Could not find oldRender snippet');
}

// 7. Add renderRivalGhost method and PlayWin initialization at end of file
const oldEnd = `    var game = new GameManager();

    // Bucle principal de 60 FPS
    function loop() {
        requestAnimationFrame(loop);
        game.update();
        game.render();
    }
    requestAnimationFrame(loop);

})();`;

const newEnd = `    // Renderizado del Rival Fantasma 1v1 con estética Cyber-Tangerine
    GameManager.prototype.renderRivalGhost = function (ctx, opp) {
        var rx = (opp.x !== undefined && opp.x !== 0) ? opp.x : (width * 0.5);
        var ry = (opp.y !== undefined && opp.y !== 0) ? opp.y : (height * 0.5);

        ctx.save();
        ctx.translate(rx, ry);
        ctx.globalAlpha = 0.65;

        // Estela iónica Tangerine del rival
        var flameLen = 14 + Math.sin(Date.now() * 0.02) * 4;
        var gradFlame = ctx.createLinearGradient(0, 0, -flameLen, 0);
        gradFlame.addColorStop(0, '#ffffff');
        gradFlame.addColorStop(0.4, '#d2691a');
        gradFlame.addColorStop(1, 'rgba(210, 105, 26, 0)');
        ctx.fillStyle = gradFlame;
        ctx.beginPath();
        ctx.moveTo(-16, -4);
        ctx.lineTo(-16 - flameLen, 0);
        ctx.lineTo(-16, 4);
        ctx.closePath();
        ctx.fill();

        // Casco translúcido del rival con borde naranja
        ctx.fillStyle = 'rgba(20, 20, 25, 0.85)';
        ctx.strokeStyle = '#d2691a';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = '#d2691a';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-12, -14);
        ctx.lineTo(-16, -7);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-16, 7);
        ctx.lineTo(-12, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cabina naranja de rival
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.ellipse(3, 0, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Etiqueta flotante con nombre del rival
        var oppName = (opp && opp.username) || (window.PlayWin.getPlayer && window.PlayWin.getOpponentState().username) || 'RIVAL';
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(12, 12, 14, 0.88)';
        var textW = ctx.measureText(oppName).width + 14;
        ctx.fillRect(-textW / 2, -28, textW, 16);
        ctx.strokeStyle = 'rgba(210, 105, 26, 0.7)';
        ctx.strokeRect(-textW / 2, -28, textW, 16);
        ctx.fillStyle = '#edecea';
        ctx.fillText(oppName, 0, -16);

        ctx.restore();
    };

    var game = new GameManager();

    // Bucle principal de 60 FPS
    function loop() {
        requestAnimationFrame(loop);
        game.update();
        game.render();
    }
    requestAnimationFrame(loop);

    // ==================================================================
    // CONEXIÓN CON EL SDK PLAYWIN (MULTIJUGADOR 1v1)
    // ==================================================================
    if (window.PlayWin) {
        window.PlayWin.init({
            gameId: 'space',
            callbacks: {
                onMatchReady: function (data) {
                    audio.resume();
                    game.showTitleScreen();
                    game.player.reset();
                    game.score = 0;
                    game.updateHUD();
                },
                onMatchLive: function () {
                    audio.resume();
                    game.startGame();
                    window.focus();
                    canvas.focus();
                },
                onMatchEnd: function () {
                    game.state = 'gameover';
                }
            }
        });
    }

})();`;

if (code.includes(oldEnd)) {
    code = code.replace(oldEnd, newEnd);
    console.log('7. PlayWin init and renderRivalGhost integrated successfully');
} else {
    console.warn('7. WARNING: Could not find oldEnd snippet');
}

// Write to apps/hub/public/games/space/script.js and space/script.js
fs.writeFileSync('apps/hub/public/games/space/script.js', code);
fs.writeFileSync('space/script.js', code);
console.log('Successfully wrote script.js to apps/hub/public/games/space and space root!');
