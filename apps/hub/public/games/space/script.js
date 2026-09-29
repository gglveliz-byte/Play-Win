// ==========================================
// PLAY WIN - FUERZA ESPACIAL
// Arcade Retro-Futuristic Sci-Fi Shooter
// ==========================================

(function () {
    'use strict';

    // Canvas y Contexto
    var canvas = document.getElementById('viewport');
    var ctx = canvas.getContext('2d');
    var wrapper = document.getElementById('game-wrapper');

    // Dimensiones lógicas y escalado HiDPI
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = window.innerWidth;
    var height = window.innerHeight;

    function resizeCanvas() {
        width = wrapper ? wrapper.clientWidth : window.innerWidth;
        height = wrapper ? wrapper.clientHeight : window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // PRNG Determinista (Mulberry32) para sincronizar oleadas y asteroides idénticos en duelos 1v1
    var spaceSeed = 1234567;
    function mulberry32(a) {
        return function() {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    var spacePrng = mulberry32(spaceSeed);

    // ==========================================
    // SISTEMA DE AUDIO (Web Audio API)
    // ==========================================
    function AudioSystem() {
        this.ctx = null;
        this.muted = localStorage.getItem('playwin_space_muted') === 'true';
    }

    AudioSystem.prototype.init = function () {
        if (this.ctx) return;
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        } catch (e) {}
    };

    AudioSystem.prototype.resume = function () {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    };

    AudioSystem.prototype.playLaser = function () {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            var osc = this.ctx.createOscillator();
            var gain = this.ctx.createGain();
            var now = this.ctx.currentTime;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(980, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.12);
        } catch (e) {}
    };

    AudioSystem.prototype.playEnemyLaser = function () {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            var osc = this.ctx.createOscillator();
            var gain = this.ctx.createGain();
            var now = this.ctx.currentTime;
            osc.type = 'square';
            osc.frequency.setValueAtTime(450, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } catch (e) {}
    };

    AudioSystem.prototype.playExplosion = function (heavy) {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            var now = this.ctx.currentTime;
            var dur = heavy ? 0.45 : 0.28;
            var osc = this.ctx.createOscillator();
            var gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(heavy ? 120 : 180, now);
            osc.frequency.exponentialRampToValueAtTime(25, now + dur);
            gain.gain.setValueAtTime(heavy ? 0.35 : 0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + dur);
        } catch (e) {}
    };

    AudioSystem.prototype.playShieldHit = function () {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            var osc = this.ctx.createOscillator();
            var gain = this.ctx.createGain();
            var now = this.ctx.currentTime;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(280, now + 0.18);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.18);
        } catch (e) {}
    };

    AudioSystem.prototype.playPowerUp = function () {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            var now = this.ctx.currentTime;
            var freqs = [523.25, 659.25, 783.99, 1046.50];
            for (var i = 0; i < freqs.length; i++) {
                var osc = this.ctx.createOscillator();
                var gain = this.ctx.createGain();
                osc.type = 'triangle';
                var st = now + i * 0.05;
                osc.frequency.setValueAtTime(freqs[i], st);
                gain.gain.setValueAtTime(0.12, st);
                gain.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(st);
                osc.stop(st + 0.08);
            }
        } catch (e) {}
    };

    AudioSystem.prototype.playBomb = function () {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            var now = this.ctx.currentTime;
            var osc = this.ctx.createOscillator();
            var gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.7);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.7);
        } catch (e) {}
    };

    AudioSystem.prototype.playGameOver = function () {
        if (this.muted || !this.ctx) return;
        this.resume();
        try {
            var now = this.ctx.currentTime;
            var notes = [440, 392, 349, 293];
            for (var i = 0; i < notes.length; i++) {
                var osc = this.ctx.createOscillator();
                var gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                var st = now + i * 0.16;
                osc.frequency.setValueAtTime(notes[i], st);
                gain.gain.setValueAtTime(0.18, st);
                gain.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(st);
                osc.stop(st + 0.18);
            }
        } catch (e) {}
    };

    var audio = new AudioSystem();

    // ==========================================
    // SISTEMA DE ENTRADA (Teclado, Táctil, Ratón)
    // ==========================================
    var Input = {
        up: false,
        down: false,
        left: false,
        right: false,
        shoot: false,
        touchX: null,
        touchY: null,
        mouseActive: false,
        mouseX: 0,
        mouseY: 0
    };

    window.addEventListener('keydown', function (e) {
        audio.resume();
        var key = e.key.toLowerCase();
        if (key === 'arrowup' || key === 'w') Input.up = true;
        if (key === 'arrowdown' || key === 's') Input.down = true;
        if (key === 'arrowleft' || key === 'a') Input.left = true;
        if (key === 'arrowright' || key === 'd') Input.right = true;
        if (key === ' ' || key === 'spacebar') {
            Input.shoot = true;
            e.preventDefault();
        }
        if (key === 'b') {
            game.triggerBomb();
        }
        if (key === 'p' || key === 'escape') {
            game.togglePause();
        }
    });

    window.addEventListener('keyup', function (e) {
        var key = e.key.toLowerCase();
        if (key === 'arrowup' || key === 'w') Input.up = false;
        if (key === 'arrowdown' || key === 's') Input.down = false;
        if (key === 'arrowleft' || key === 'a') Input.left = false;
        if (key === 'arrowright' || key === 'd') Input.right = false;
        if (key === ' ' || key === 'spacebar') Input.shoot = false;
    });

    // Control táctil intuitivo (arrastre de nave en toda la pantalla)
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
    }, { passive: false });

    // Control por ratón opcional (apuntar/mover con ratón al hacer clic y arrastrar)
    var isMouseDown = false;
    canvas.addEventListener('mousedown', function (e) {
        audio.resume();
        isMouseDown = true;
        Input.mouseX = e.clientX;
        Input.mouseY = e.clientY;
        Input.shoot = true;
    });

    window.addEventListener('mousemove', function (e) {
        if (isMouseDown) {
            Input.mouseX = e.clientX;
            Input.mouseY = e.clientY;
        }
    });

    window.addEventListener('mouseup', function () {
        isMouseDown = false;
        Input.shoot = false;
    });

    // ==========================================
    // EFECTOS VISUALES: FONDO DE ESTRELLAS Y NEBULOSAS
    // ==========================================
    function StarField() {
        this.stars = [];
        this.warpSpeed = 1;
        this.init();
    }

    StarField.prototype.init = function () {
        this.stars = [];
        var count = 160;
        for (var i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                speed: 0.8 + Math.random() * 3.5,
                size: 0.8 + Math.random() * 2,
                color: Math.random() > 0.3 ? '#ffffff' : (Math.random() > 0.5 ? '#00f0ff' : '#9d4edd'),
                alpha: 0.3 + Math.random() * 0.7
            });
        }
    };

    StarField.prototype.update = function (overdrive, gameSpeed) {
        var speedMul = (overdrive ? 4.5 : 1) * (gameSpeed || 1);
        for (var i = 0; i < this.stars.length; i++) {
            var s = this.stars[i];
            s.x -= s.speed * speedMul;
            if (s.x < 0) {
                s.x = width + 5;
                s.y = Math.random() * height;
            }
        }
    };

    StarField.prototype.render = function (ctx, overdrive) {
        for (var i = 0; i < this.stars.length; i++) {
            var s = this.stars[i];
            ctx.fillStyle = s.color;
            ctx.globalAlpha = s.alpha;
            if (overdrive) {
                ctx.fillRect(s.x, s.y, s.size * 12, s.size);
            } else {
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    };

    // Partículas y Textos Flotantes
    function ParticleSystem() {
        this.particles = [];
        this.floatingTexts = [];
    }

    ParticleSystem.prototype.addSparks = function (x, y, color, count, speedMax) {
        count = count || 16;
        speedMax = speedMax || 4;
        for (var i = 0; i < count; i++) {
            var angle = Math.random() * Math.PI * 2;
            var spd = 0.5 + Math.random() * speedMax;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                size: 1.5 + Math.random() * 2.5,
                color: color,
                alpha: 1,
                decay: 0.02 + Math.random() * 0.03
            });
        }
    };

    ParticleSystem.prototype.addShockwave = function (x, y, color, maxRadius) {
        this.particles.push({
            type: 'ring',
            x: x,
            y: y,
            radius: 4,
            maxRadius: maxRadius || 50,
            color: color,
            alpha: 1,
            decay: 0.04
        });
    };

    ParticleSystem.prototype.addFloatingText = function (x, y, text, color) {
        this.floatingTexts.push({
            x: x,
            y: y,
            text: text,
            color: color || '#00f0ff',
            alpha: 1,
            vy: -1.2
        });
    };

    ParticleSystem.prototype.update = function () {
        for (var i = this.particles.length - 1; i >= 0; i--) {
            var p = this.particles[i];
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            if (p.type === 'ring') {
                p.radius += (p.maxRadius - p.radius) * 0.15;
            } else {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.96;
                p.vy *= 0.96;
            }
        }

        for (var j = this.floatingTexts.length - 1; j >= 0; j--) {
            var ft = this.floatingTexts[j];
            ft.y += ft.vy;
            ft.alpha -= 0.02;
            if (ft.alpha <= 0) {
                this.floatingTexts.splice(j, 1);
            }
        }
    };

    ParticleSystem.prototype.render = function (ctx) {
        ctx.save();
        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            ctx.globalAlpha = Math.max(0, p.alpha);
            if (p.type === 'ring') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }

        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        for (var j = 0; j < this.floatingTexts.length; j++) {
            var ft = this.floatingTexts[j];
            ctx.globalAlpha = Math.max(0, ft.alpha);
            ctx.fillStyle = ft.color;
            ctx.shadowColor = ft.color;
            ctx.shadowBlur = 8;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.restore();
    };

    // ==========================================
    // PROYECTILES (Láser del Jugador y Enemigo)
    // ==========================================
    function Laser(x, y, vx, vy, isEnemy, power) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.isEnemy = isEnemy;
        this.power = power || 1;
        this.width = isEnemy ? 12 : (power >= 4 ? 24 : 16);
        this.height = isEnemy ? 6 : (power >= 4 ? 8 : 5);
        this.alive = true;
    }

    Laser.prototype.update = function () {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x > width + 40 || this.x < -40 || this.y > height + 20 || this.y < -20) {
            this.alive = false;
        }
    };

    Laser.prototype.render = function (ctx) {
        ctx.save();
        if (this.isEnemy) {
            ctx.fillStyle = '#ff0055';
            ctx.shadowColor = '#ff0055';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, 7, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, 4, 2, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            var glow = this.power >= 3 ? '#ff007f' : '#00f0ff';
            ctx.shadowColor = glow;
            ctx.shadowBlur = 14;

            // Haz de plasma exterior con remates redondeados
            ctx.strokeStyle = glow;
            ctx.lineWidth = Math.max(3, this.height);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(this.x - this.width / 2, this.y);
            ctx.lineTo(this.x + this.width / 2, this.y);
            ctx.stroke();

            // Núcleo blanco incandescente
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1.5, this.height - 2.5);
            ctx.beginPath();
            ctx.moveTo(this.x - this.width / 2 + 3, this.y);
            ctx.lineTo(this.x + this.width / 2 - 1, this.y);
            ctx.stroke();
        }
        ctx.restore();
    };

    // ==========================================
    // NAVE DEL JUGADOR
    // ==========================================
    function Player() {
        this.reset();
    }

    Player.prototype.reset = function () {
        this.width = 48;
        this.height = 32;
        this.x = 70;
        this.y = height * 0.5;
        this.speed = 6.5;
        this.powerLevel = 1;
        this.alive = true;
        this.invulnerableTimer = 0;
        this.cooldown = 0;
        this.cooldownMax = 12; // Cadencia óptima arcade
        this.tilt = 0;
        this.engineFlame = 0;
        this.shieldPulse = 0;
    };

    Player.prototype.getHitBox = function () {
        return {
            x: this.x - this.width * 0.35,
            y: this.y - this.height * 0.35,
            width: this.width * 0.7,
            height: this.height * 0.7
        };
    };

    Player.prototype.update = function (particles, gameSpeed) {
        if (!this.alive) return;

        var effectiveSpeed = this.speed * (1 + ((gameSpeed || 1) - 1) * 0.22);
        var vx = 0;
        var vy = 0;

        // Control por toque o ratón arrastrado (súper ágil y responsivo para móvil)
        if (Input.touchX !== null && Input.touchY !== null) {
            var dx = Input.touchX - this.x;
            var dy = Input.touchY - this.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 3) {
                var maxMove = Math.max(effectiveSpeed * 2.0, dist * 0.45);
                vx = (dx / dist) * Math.min(maxMove, dist);
                vy = (dy / dist) * Math.min(maxMove, dist);
            }
        } else if (isMouseDown) {
            var mdx = Input.mouseX - this.x;
            var mdy = Input.mouseY - this.y;
            var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
            if (mdist > 4) {
                vx = (mdx / mdist) * Math.min(effectiveSpeed * 1.3, mdist);
                vy = (mdy / mdist) * Math.min(effectiveSpeed * 1.3, mdist);
            }
        } else {
            // Teclado
            if (Input.up) vy -= effectiveSpeed;
            if (Input.down) vy += effectiveSpeed;
            if (Input.left) vx -= effectiveSpeed;
            if (Input.right) vx += effectiveSpeed;
        }

        this.x += vx;
        this.y += vy;

        // Inclinación aerodinámica según movimiento vertical
        if (vy < -0.5) this.tilt += (-0.22 - this.tilt) * 0.2;
        else if (vy > 0.5) this.tilt += (0.22 - this.tilt) * 0.2;
        else this.tilt += (0 - this.tilt) * 0.2;

        // Restricción dentro del área visible (evitar barra superior de HUD)
        var topMargin = 78;
        var bottomMargin = 25;
        this.x = Math.max(35, Math.min(width - 45, this.x));
        this.y = Math.max(topMargin, Math.min(height - bottomMargin, this.y));

        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer--;
        }
        if (this.shieldPulse > 0) {
            this.shieldPulse--;
        }

        // Doble estela de propulsores iónicos
        this.engineFlame = (this.engineFlame + 0.35) % (Math.PI * 2);
        if (Math.random() > 0.25) {
            var offsets = [-6, 6];
            for (var oi = 0; oi < offsets.length; oi++) {
                particles.particles.push({
                    x: this.x - this.width / 2 - 2,
                    y: this.y + offsets[oi] + (Math.random() - 0.5) * 3,
                    vx: -4 - Math.random() * 2.5,
                    vy: (Math.random() - 0.5) * 1.2,
                    size: 1.8 + Math.random() * 2.2,
                    color: Math.random() > 0.4 ? '#00f0ff' : '#38bdf8',
                    alpha: 0.85,
                    decay: 0.045
                });
            }
        }

        // Cadencia de disparo
        if (this.cooldown > 0) this.cooldown--;
        if ((Input.shoot || game.autoShoot) && this.cooldown <= 0) {
            this.shoot();
            this.cooldown = this.cooldownMax;
        }
    };

    Player.prototype.shoot = function () {
        audio.playLaser();
        var lx = this.x + this.width / 2;
        var ly = this.y;

        if (this.powerLevel === 1) {
            game.lasers.push(new Laser(lx, ly, 16, 0, false, 1));
        } else if (this.powerLevel === 2) {
            game.lasers.push(new Laser(lx, ly - 6, 17, 0, false, 2));
            game.lasers.push(new Laser(lx, ly + 6, 17, 0, false, 2));
        } else if (this.powerLevel === 3) {
            game.lasers.push(new Laser(lx, ly, 18, 0, false, 3));
            game.lasers.push(new Laser(lx, ly - 8, 17, -2, false, 3));
            game.lasers.push(new Laser(lx, ly + 8, 17, 2, false, 3));
        } else if (this.powerLevel >= 4) {
            game.lasers.push(new Laser(lx + 4, ly - 5, 19, 0, false, 4));
            game.lasers.push(new Laser(lx + 4, ly + 5, 19, 0, false, 4));
            game.lasers.push(new Laser(lx, ly - 12, 18, -3.2, false, 4));
            game.lasers.push(new Laser(lx, ly + 12, 18, 3.2, false, 4));
        }
    };

    Player.prototype.hit = function () {
        if (this.invulnerableTimer > 0) return false;
        this.invulnerableTimer = 75; // ~1.25 segundos de invencibilidad
        this.shieldPulse = 20;
        audio.playShieldHit();
        return true;
    };

    Player.prototype.render = function (ctx) {
        if (!this.alive) return;

        // Parpadeo de invulnerabilidad
        if (this.invulnerableTimer > 0 && Math.floor(this.invulnerableTimer / 5) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        } else {
            ctx.globalAlpha = 1;
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // Llama del propulsor trasero
        var flameLen = 12 + Math.sin(this.engineFlame) * 5;
        var gradFlame = ctx.createLinearGradient(0, 0, -flameLen, 0);
        gradFlame.addColorStop(0, '#ffffff');
        gradFlame.addColorStop(0.3, '#00f0ff');
        gradFlame.addColorStop(1, 'rgba(0, 240, 255, 0)');

        ctx.fillStyle = gradFlame;
        ctx.beginPath();
        ctx.moveTo(-16, -4);
        ctx.lineTo(-16 - flameLen, 0);
        ctx.lineTo(-16, 4);
        ctx.closePath();
        ctx.fill();

        // Casco de la nave (Render Vectorial de Alta Definición)
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;

        // Alas y cuerpo estilizado
        ctx.beginPath();
        ctx.moveTo(22, 0); // Punta delantera
        ctx.lineTo(-12, -14); // Ala superior
        ctx.lineTo(-16, -7);
        ctx.lineTo(-10, 0); // Centro trasero
        ctx.lineTo(-16, 7);
        ctx.lineTo(-12, 14); // Ala inferior
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cabina de cristal de neón
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(3, 0, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Luces en los extremos de las alas
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 6;
        ctx.fillRect(-12, -15, 3, 3);
        ctx.fillRect(-12, 12, 3, 3);

        // Escudo de energía visible cuando se recibe un impacto
        if (this.shieldPulse > 0) {
            ctx.strokeStyle = 'rgba(0, 240, 255, ' + (this.shieldPulse / 20) + ')';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(0, 0, 28, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
        ctx.globalAlpha = 1;
    };

    // ==========================================
    // FLOTA ENEMIGA (Tipos A, B, C y Asteroides)
    // ==========================================
    function Enemy(type, x, y, wave) {
        this.type = type; // 'scout', 'fighter', 'cruiser', 'asteroid'
        this.x = x;
        this.y = y;
        this.alive = true;
        this.wave = wave || 1;
        this.shootTimer = 40 + spacePrng() * 80;

        if (type === 'scout') {
            this.width = 30;
            this.height = 24;
            this.health = 20;
            this.maxHealth = 20;
            this.speed = 3.6 + Math.min(this.wave * 0.25, 2.5);
            this.value = 100;
            this.color = '#ef4444';
            this.waveTimer = spacePrng() * 10;
        } else if (type === 'fighter') {
            this.width = 36;
            this.height = 28;
            this.health = 45;
            this.maxHealth = 45;
            this.speed = 2.6 + Math.min(this.wave * 0.2, 2.0);
            this.value = 250;
            this.color = '#9d4edd';
        } else if (type === 'cruiser') {
            this.width = 54;
            this.height = 42;
            this.health = 160 + (this.wave * 30);
            this.maxHealth = this.health;
            this.speed = 1.4;
            this.value = 600;
            this.color = '#ff007f';
        } else {
            // Asteroide cósmico
            this.width = 34;
            this.height = 34;
            this.health = 35;
            this.maxHealth = 35;
            this.speed = 2.2 + spacePrng() * 1.5;
            this.value = 80;
            this.color = '#64748b';
            this.rot = 0;
            this.rotSpeed = (spacePrng() - 0.5) * 0.05;
        }
    }

    Enemy.prototype.getHitBox = function () {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    };

    Enemy.prototype.update = function (player, gameSpeed) {
        if (!this.alive) return;
        gameSpeed = gameSpeed || 1;
        var curSpeed = this.speed * gameSpeed;

        if (this.type === 'scout') {
            this.x -= curSpeed;
            this.waveTimer += 0.04 * gameSpeed;
            this.y += Math.sin(this.waveTimer) * 2.2;
        } else if (this.type === 'fighter') {
            this.x -= curSpeed;
            this.shootTimer -= gameSpeed;
            if (this.shootTimer <= 0 && this.x > 80 && this.x < width - 40) {
                var dx = player.x - this.x;
                var dy = player.y - this.y;
                var angle = Math.atan2(dy, dx);
                var bulletSpd = 7.5 * (1 + (gameSpeed - 1) * 0.35);
                game.lasers.push(new Laser(this.x - 12, this.y, Math.cos(angle) * bulletSpd, Math.sin(angle) * bulletSpd, true, 1));
                audio.playEnemyLaser();
                this.shootTimer = (85 + spacePrng() * 45) / gameSpeed;
            }
        } else if (this.type === 'cruiser') {
            this.x -= curSpeed;
            this.shootTimer -= gameSpeed;
            if (this.shootTimer <= 0 && this.x > 120 && this.x < width - 60) {
                var cSpd = 7 * (1 + (gameSpeed - 1) * 0.35);
                game.lasers.push(new Laser(this.x - 20, this.y - 10, -cSpd, 0, true, 1));
                game.lasers.push(new Laser(this.x - 20, this.y + 10, -cSpd, 0, true, 1));
                audio.playEnemyLaser();
                this.shootTimer = 70 / gameSpeed;
            }
        } else {
            // Asteroide
            this.x -= curSpeed;
            this.rot += this.rotSpeed * gameSpeed;
        }

        if (this.x < -60) {
            this.alive = false;
        }
    };

    Enemy.prototype.takeDamage = function (dmg) {
        this.health -= dmg;
        if (this.health <= 0) {
            this.alive = false;
            return true; // Muerto
        }
        return false;
    };

    Enemy.prototype.render = function (ctx) {
        if (!this.alive) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.type === 'asteroid') {
            ctx.rotate(this.rot);
            ctx.fillStyle = '#334155';
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            var pts = 8;
            var r = this.width / 2;
            for (var i = 0; i < pts; i++) {
                var a = (i / pts) * Math.PI * 2;
                var rad = r * (0.8 + ((i % 2) * 0.3));
                var px = Math.cos(a) * rad;
                var py = Math.sin(a) * rad;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            // Dibujar nave enemiga estilizada
            ctx.fillStyle = '#0b0f19';
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1.8;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;

            if (this.type === 'scout') {
                ctx.beginPath();
                ctx.moveTo(-14, 0); // Punta delantera apunta a la izquierda
                ctx.lineTo(12, -12);
                ctx.lineTo(8, 0);
                ctx.lineTo(12, 12);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(-2, 0, 3, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.type === 'fighter') {
                ctx.beginPath();
                ctx.moveTo(-18, 0);
                ctx.lineTo(14, -14);
                ctx.lineTo(4, -4);
                ctx.lineTo(10, 0);
                ctx.lineTo(4, 4);
                ctx.lineTo(14, 14);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (this.type === 'cruiser') {
                ctx.beginPath();
                ctx.moveTo(-24, 0);
                ctx.lineTo(-8, -18);
                ctx.lineTo(20, -18);
                ctx.lineTo(24, 0);
                ctx.lineTo(20, 18);
                ctx.lineTo(-8, 18);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#ff007f';
                ctx.fillRect(-10, -5, 12, 10);
            }

            // Barra de vida superior para enemigos dañados o pesados
            if (this.health < this.maxHealth || this.type === 'cruiser') {
                var barW = this.width;
                var barH = 3;
                var perc = Math.max(0, this.health / this.maxHealth);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(-barW / 2, -this.height / 2 - 8, barW, barH);
                ctx.fillStyle = perc > 0.5 ? '#10b981' : (perc > 0.25 ? '#ffb703' : '#ef4444');
                ctx.fillRect(-barW / 2, -this.height / 2 - 8, barW * perc, barH);
            }
        }

        ctx.restore();
    };

    // ==========================================
    // CÁPSULAS DE MEJORA Y POTENCIADORES
    // ==========================================
    function PowerUp(x, y, kind) {
        this.x = x;
        this.y = y;
        this.kind = kind; // 'power', 'shield', 'bomb', 'points'
        this.size = 20;
        this.alive = true;
        this.pulse = 0;
        this.vx = -1.6;
        this.vy = Math.sin(spacePrng() * 10) * 0.8;
    }

    PowerUp.prototype.update = function (player) {
        this.pulse += 0.05;
        this.x += this.vx;
        this.y += Math.sin(this.pulse) * 0.7;

        // Atracción magnética si la nave está cerca
        var dx = player.x - this.x;
        var dy = player.y - this.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
            this.x += (dx / dist) * 4;
            this.y += (dy / dist) * 4;
        }

        if (this.x < -30) this.alive = false;
    };

    PowerUp.prototype.render = function (ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        var glow = this.kind === 'power' ? '#ffb703' :
            (this.kind === 'shield' ? '#00f0ff' :
                (this.kind === 'bomb' ? '#ff007f' : '#10b981'));

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = glow;
        ctx.lineWidth = 2;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var sym = this.kind === 'power' ? 'P' :
            (this.kind === 'shield' ? 'S' :
                (this.kind === 'bomb' ? 'B' : '♦'));
        ctx.fillText(sym, 0, 1);

        ctx.restore();
    };

    // ==========================================
    // DETECCIÓN DE COLISIONES
    // ==========================================
    function checkIntersect(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    }

    // ==========================================
    // MOTOR PRINCIPAL DEL JUEGO
    // ==========================================
    function GameManager() {
        this.bestScore = parseInt(localStorage.getItem('playwin_space_best')) || 0;
        this.state = 'title'; // 'title', 'playing', 'paused', 'gameover'
        this.score = 0;
        this.lives = 3;
        this.maxLives = 3;
        this.bombs = 1;
        this.wave = 1;
        this.autoShoot = true;
        this.enemiesKilled = 0;

        // Sistema de velocidad progresiva y combos competitivos
        this.gameSpeed = 1.0;
        this.maxSpeedReached = 1.0;
        this.speedMilestone = 1.3;
        this.combo = 1;
        this.maxCombo = 1;
        this.comboTimer = 0;
        this.comboDuration = 150; // ~2.5 segundos
        this.gameTimer = 0;

        this.starfield = new StarField();
        this.particles = new ParticleSystem();
        this.player = new Player();
        this.lasers = [];
        this.enemies = [];
        this.powerups = [];

        this.spawnTimer = 0;
        this.waveTimer = 0;
        this.screenShake = 0;

        this.initUI();
    }

    GameManager.prototype.initUI = function () {
        var self = this;
        // BUG-025: con el SDK presente, la partida la arranca SOLO el servidor
        // (onMatchLive). Estos botones son de cuando el juego era de un jugador:
        // si se pulsan antes de encolar, arrancan una partida fantasma en la que
        // el reloj corre pero el marcador nunca se envía al servidor.
        var puedeArrancarLocal = function () {
            return !window.PlayWin || (typeof window.PlayWin.canStartLocally === 'function' && window.PlayWin.canStartLocally());
        };
        var btnStart = document.getElementById('btn_start');
        if (btnStart) btnStart.onclick = function () { if (puedeArrancarLocal()) self.startGame(); };

        var btnRestart = document.getElementById('btn_restart');
        if (btnRestart) btnRestart.onclick = function () { if (puedeArrancarLocal()) self.startGame(); };

        var btnRestartPause = document.getElementById('btn_restart_pause');
        if (btnRestartPause) btnRestartPause.onclick = function () { if (puedeArrancarLocal()) self.startGame(); };

        var btnMenu = document.getElementById('btn_menu');
        if (btnMenu) btnMenu.onclick = function () { self.showTitleScreen(); };

        var btnMenuPause = document.getElementById('btn_menu_pause');
        if (btnMenuPause) btnMenuPause.onclick = function () { self.showTitleScreen(); };

        var btnResume = document.getElementById('btn_resume');
        if (btnResume) btnResume.onclick = function () { self.togglePause(); };

        var soundToggle = document.getElementById('sound_toggle');
        if (soundToggle) {
            soundToggle.textContent = audio.muted ? '🔇' : '🔊';
            soundToggle.onclick = function () {
                audio.muted = !audio.muted;
                localStorage.setItem('playwin_space_muted', audio.muted);
                soundToggle.textContent = audio.muted ? '🔇' : '🔊';
            };
        }

        var pauseToggle = document.getElementById('pause_toggle');
        if (pauseToggle) pauseToggle.onclick = function () { self.togglePause(); };

        var btnAutofire = document.getElementById('btn_autofire');
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
        }

        this.updateHUD();
        this.showTitleScreen();
    };

    GameManager.prototype.showTitleScreen = function () {
        this.state = 'title';
        document.querySelectorAll('.ui-screen').forEach(function (s) { s.classList.remove('active'); });
        var titleScreen = document.getElementById('screen_title');
        if (titleScreen) titleScreen.classList.add('active');

        var hud = document.getElementById('game_hud');
        if (hud) hud.classList.remove('active');

        var menuBest = document.getElementById('menu_best_val');
        if (menuBest) menuBest.textContent = this.bestScore + ' PUNTOS';
    };

    GameManager.prototype.startGame = function () {
        audio.resume();
        this.state = 'playing';
        this.score = 0;
        this.lives = this.maxLives;
        this.bombs = 1;
        this.wave = 1;
        this.enemiesKilled = 0;
        this.spawnTimer = 0;
        this.waveTimer = 0;
        this.gameTimer = 0;

        // Reiniciar métricas de velocidad y racha competitiva
        this.gameSpeed = 1.0;
        this.maxSpeedReached = 1.0;
        this.speedMilestone = 1.3;
        this.combo = 1;
        this.maxCombo = 1;
        this.comboTimer = 0;

        this.lasers = [];
        this.enemies = [];
        this.powerups = [];
        this.player.reset();

        document.querySelectorAll('.ui-screen').forEach(function (s) { s.classList.remove('active'); });
        var hud = document.getElementById('game_hud');
        if (hud) hud.classList.add('active');

        this.updateHUD();
        this.particles.addFloatingText(width / 2, height / 2, '¡SECTOR ' + this.wave + ' - INICIANDO!', '#00f0ff');
    };

    GameManager.prototype.togglePause = function () {
        if (this.state === 'playing') {
            this.state = 'paused';
            var pauseScreen = document.getElementById('screen_pause');
            if (pauseScreen) pauseScreen.classList.add('active');
        } else if (this.state === 'paused') {
            this.state = 'playing';
            var pauseScreen = document.getElementById('screen_pause');
            if (pauseScreen) pauseScreen.classList.remove('active');
        }
    };

    GameManager.prototype.triggerBomb = function () {
        if (this.state !== 'playing' || this.bombs <= 0) return;
        this.bombs--;
        this.updateHUD();
        audio.playBomb();
        this.screenShake = 18;

        // Limpiar todas las balas enemigas
        for (var i = this.lasers.length - 1; i >= 0; i--) {
            if (this.lasers[i].isEnemy) {
                this.particles.addSparks(this.lasers[i].x, this.lasers[i].y, '#ff0055', 6);
                this.lasers.splice(i, 1);
            }
        }

        // Daño masivo a todos los enemigos en pantalla
        for (var j = this.enemies.length - 1; j >= 0; j--) {
            var e = this.enemies[j];
            this.particles.addSparks(e.x, e.y, '#ff007f', 15);
            if (e.takeDamage(120)) {
                this.score += e.value;
                this.enemiesKilled++;
            }
        }

        this.particles.addShockwave(width / 2, height / 2, '#ff007f', Math.max(width, height));
        this.particles.addFloatingText(this.player.x, this.player.y - 20, '¡BOMBA CUÁNTICA!', '#ff007f');
    };

    GameManager.prototype.updateHUD = function () {
        var scoreEl = document.getElementById('score');
        if (scoreEl) scoreEl.textContent = this.score;

        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('playwin_space_best', this.bestScore);
        }

        var bestEl = document.getElementById('best_score');
        if (bestEl) bestEl.textContent = this.bestScore;

        var waveEl = document.getElementById('wave_display');
        if (waveEl) waveEl.textContent = this.wave;

        var speedEl = document.getElementById('speed_display');
        if (speedEl) speedEl.textContent = this.gameSpeed.toFixed(1) + 'x';

        var speedCard = document.getElementById('speed_card');
        if (speedCard) {
            speedCard.classList.toggle('speed-boost', this.gameSpeed >= 1.35 && this.gameSpeed < 1.85);
            speedCard.classList.toggle('speed-hyper', this.gameSpeed >= 1.85);
        }

        var comboBadge = document.getElementById('combo_badge');
        if (comboBadge) {
            if (this.combo > 1) {
                comboBadge.textContent = 'COMBO x' + this.combo;
                comboBadge.classList.add('active');
            } else {
                comboBadge.classList.remove('active');
            }
        }

        var bombCount = document.getElementById('bomb_count');
        if (bombCount) bombCount.textContent = this.bombs;

        // Renderizado de escudos
        var livesContainer = document.getElementById('lives_container');
        if (livesContainer) {
            var html = '';
            for (var i = 0; i < this.maxLives; i++) {
                if (i < this.lives) {
                    html += '<span class="shield-pip"></span>';
                } else {
                    html += '<span class="shield-pip lost"></span>';
                }
            }
            livesContainer.innerHTML = html;
        }
    };

    GameManager.prototype.spawnEnemies = function () {
        this.spawnTimer++;
        // Cadencia de aparición de enemigos más veloz conforme aumenta gameSpeed
        var spawnInterval = Math.max(18, Math.floor((90 - this.wave * 7) / this.gameSpeed));

        if (this.spawnTimer >= spawnInterval) {
            this.spawnTimer = 0;
            var spawnY = 85 + spacePrng() * (height - 125);
            var rand = spacePrng();

            if (rand < 0.48) {
                this.enemies.push(new Enemy('scout', width + 30, spawnY, this.wave));
            } else if (rand < 0.76) {
                this.enemies.push(new Enemy('fighter', width + 30, spawnY, this.wave));
            } else if (rand < 0.9) {
                this.enemies.push(new Enemy('asteroid', width + 30, spawnY, this.wave));
            } else {
                this.enemies.push(new Enemy('cruiser', width + 40, spawnY, this.wave));
            }
        }

        // Progresión de sector cada ~30 segundos
        this.waveTimer++;
        if (this.waveTimer >= 1800) {
            this.waveTimer = 0;
            this.wave++;
            this.updateHUD();
            this.particles.addFloatingText(width / 2, height / 2, '¡SECTOR ' + this.wave + ' ALCANZADO!', '#ffb703');
            this.particles.addShockwave(width / 2, height / 2, '#ffb703', width * 0.4);
            audio.playPowerUp();
        }
    };

    GameManager.prototype.gameOver = function () {
        this.state = 'gameover';
        audio.playGameOver();

        if (window.PlayWin && window.PlayWin.isLive()) {
            window.PlayWin.notifyCrash();
        }

        document.querySelectorAll('.ui-screen').forEach(function (s) { s.classList.remove('active'); });
        var gameoverScreen = document.getElementById('screen_gameover');
        if (gameoverScreen) gameoverScreen.classList.add('active');

        var finalScore = document.getElementById('final_score');
        if (finalScore) finalScore.textContent = this.score;

        var finalBest = document.getElementById('final_best');
        if (finalBest) finalBest.textContent = this.bestScore;

        var finalWave = document.getElementById('final_wave');
        if (finalWave) finalWave.textContent = this.wave;

        var finalSpeed = document.getElementById('final_speed');
        if (finalSpeed) finalSpeed.textContent = this.maxSpeedReached.toFixed(1) + 'x';

        var finalCombo = document.getElementById('final_combo');
        if (finalCombo) finalCombo.textContent = 'x' + this.maxCombo;

        var newRecordBadge = document.getElementById('new_record_badge');
        if (newRecordBadge) {
            newRecordBadge.style.display = (this.score >= this.bestScore && this.score > 0) ? 'block' : 'none';
        }
    };

    GameManager.prototype.update = function () {
        this.starfield.update(this.state === 'title', this.gameSpeed);

        if (this.state !== 'playing') {
            this.particles.update();
            return;
        }

        this.gameTimer++;

        // Aceleración de velocidad progresiva y competitiva
        var targetSpeed = 1.0 + ((this.wave - 1) * 0.18) + Math.min(1.8, (this.enemiesKilled * 0.012) + (this.gameTimer * 0.00008));
        this.gameSpeed += (targetSpeed - this.gameSpeed) * 0.02;

        if (this.gameSpeed > this.maxSpeedReached) {
            this.maxSpeedReached = this.gameSpeed;
        }

        // Anuncio sonoro y visual al quebrar barrera de hipervelocidad
        if (this.gameSpeed >= this.speedMilestone) {
            audio.playPowerUp();
            this.particles.addFloatingText(width / 2, height / 2 - 35, '⚡ ¡VELOCIDAD: ' + this.gameSpeed.toFixed(1) + 'x! ⚡', '#ff007f');
            this.particles.addShockwave(width / 2, height / 2, '#00f0ff', width * 0.5);
            this.speedMilestone += 0.3;
        }

        // Gestión de racha de combos
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer <= 0) {
                this.combo = 1;
                this.updateHUD();
            }
        }

        // Reducir temblor de pantalla
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
        }
        this.spawnEnemies();
        this.updateHUD();

        // Actualizar láseres
        for (var i = this.lasers.length - 1; i >= 0; i--) {
            var l = this.lasers[i];
            l.update();
            if (!l.alive) {
                this.lasers.splice(i, 1);
            }
        }

        // Actualizar enemigos con la velocidad global acelerada
        for (var j = this.enemies.length - 1; j >= 0; j--) {
            var e = this.enemies[j];
            e.update(this.player, this.gameSpeed);
            if (!e.alive) {
                this.enemies.splice(j, 1);
            }
        }

        // Actualizar cápsulas de mejora
        for (var k = this.powerups.length - 1; k >= 0; k--) {
            var p = this.powerups[k];
            p.update(this.player);
            if (!p.alive) {
                this.powerups.splice(k, 1);
            }
        }

        this.particles.update();

        // Colisión: Láseres del jugador vs Enemigos
        for (var li = this.lasers.length - 1; li >= 0; li--) {
            var laser = this.lasers[li];
            if (laser.isEnemy) continue;

            for (var ei = this.enemies.length - 1; ei >= 0; ei--) {
                var enemy = this.enemies[ei];
                var eBox = enemy.getHitBox();
                var lBox = { x: laser.x - laser.width / 2, y: laser.y - laser.height / 2, width: laser.width, height: laser.height };

                if (checkIntersect(lBox, eBox)) {
                    laser.alive = false;
                    this.particles.addSparks(laser.x, laser.y, '#00f0ff', 6, 3);
                    var dead = enemy.takeDamage(35 * laser.power);

                    if (dead) {
                        // Multiplicador de combo competitivo
                        this.comboTimer = this.comboDuration;
                        this.combo++;
                        if (this.combo > this.maxCombo) {
                            this.maxCombo = this.combo;
                        }

                        var comboMultiplier = Math.min(5, this.combo);
                        var pointsGained = enemy.value * comboMultiplier;
                        this.score += pointsGained;
                        this.enemiesKilled++;
                        this.updateHUD();

                        audio.playExplosion(enemy.type === 'cruiser');
                        this.screenShake = enemy.type === 'cruiser' ? 8 : 4;
                        this.particles.addSparks(enemy.x, enemy.y, enemy.color, enemy.type === 'cruiser' ? 35 : 18, 5);
                        this.particles.addShockwave(enemy.x, enemy.y, enemy.color, 45);

                        var msg = comboMultiplier > 1 ? 'x' + comboMultiplier + ' COMBO! +' + pointsGained : '+' + pointsGained;
                        var msgCol = comboMultiplier >= 4 ? '#ff007f' : (comboMultiplier > 1 ? '#ffb703' : '#00f0ff');
                        this.particles.addFloatingText(enemy.x, enemy.y, msg, msgCol);

                        // Posibilidad de soltar potenciador
                        if (spacePrng() < 0.22) {
                            var r = spacePrng();
                            var kind = r < 0.45 ? 'power' : (r < 0.7 ? 'shield' : (r < 0.85 ? 'bomb' : 'points'));
                            this.powerups.push(new PowerUp(enemy.x, enemy.y, kind));
                        }
                    }
                    break;
                }
            }
        }

        // Colisión: Láseres enemigos vs Jugador
        var pHit = this.player.getHitBox();
        for (var eli = this.lasers.length - 1; eli >= 0; eli--) {
            var el = this.lasers[eli];
            if (!el.isEnemy) continue;
            var elBox = { x: el.x - el.width / 2, y: el.y - el.height / 2, width: el.width, height: el.height };

            if (checkIntersect(elBox, pHit)) {
                el.alive = false;
                if (this.player.hit()) {
                    this.lives--;
                    this.updateHUD();
                    this.screenShake = 9;
                    this.particles.addSparks(this.player.x, this.player.y, '#00f0ff', 16, 4);

                    if (this.lives <= 0) {
                        this.player.alive = false;
                        this.gameOver();
                        return;
                    }
                }
            }
        }

        // Colisión: Enemigos vs Jugador
        for (var cj = this.enemies.length - 1; cj >= 0; cj--) {
            var en = this.enemies[cj];
            var enBox = en.getHitBox();

            if (checkIntersect(enBox, pHit)) {
                en.takeDamage(100);
                if (this.player.hit()) {
                    this.lives--;
                    this.updateHUD();
                    this.screenShake = 12;
                    audio.playExplosion(true);
                    this.particles.addSparks(this.player.x, this.player.y, '#ff007f', 24, 6);

                    if (this.lives <= 0) {
                        this.player.alive = false;
                        this.gameOver();
                        return;
                    }
                }
            }
        }

        // Colisión: Jugador recoge Cápsulas
        for (var pi = this.powerups.length - 1; pi >= 0; pi--) {
            var pup = this.powerups[pi];
            var puBox = { x: pup.x - pup.size / 2, y: pup.y - pup.size / 2, width: pup.size, height: pup.size };

            if (checkIntersect(puBox, pHit)) {
                pup.alive = false;
                audio.playPowerUp();

                if (pup.kind === 'power') {
                    this.player.powerLevel = Math.min(5, this.player.powerLevel + 1);
                    this.particles.addFloatingText(this.player.x, this.player.y - 25, '¡POTENCIA NV.' + this.player.powerLevel + '!', '#ffb703');
                } else if (pup.kind === 'shield') {
                    this.lives = Math.min(this.maxLives, this.lives + 1);
                    this.updateHUD();
                    this.particles.addFloatingText(this.player.x, this.player.y - 25, '¡ESCUDO REPARADO!', '#00f0ff');
                } else if (pup.kind === 'bomb') {
                    this.bombs = Math.min(3, this.bombs + 1);
                    this.updateHUD();
                    this.particles.addFloatingText(this.player.x, this.player.y - 25, '¡+1 BOMBA CUÁNTICA!', '#ff007f');
                } else {
                    this.score += 500;
                    this.updateHUD();
                    this.particles.addFloatingText(this.player.x, this.player.y - 25, '+500 PUNTOS', '#10b981');
                }
            }
        }
    };

    GameManager.prototype.render = function () {
        ctx.clearRect(0, 0, width, height);

        ctx.save();
        if (this.screenShake > 0.5) {
            var rx = (Math.random() - 0.5) * this.screenShake;
            var ry = (Math.random() - 0.5) * this.screenShake;
            ctx.translate(rx, ry);
        }

        // Fondo cósmico con gradiente sutil
        var bgGrad = ctx.createRadialGradient(width * 0.5, height * 0.5, 50, width * 0.5, height * 0.5, width * 0.85);
        bgGrad.addColorStop(0, '#060d24');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Estrellas
        this.starfield.render(ctx, this.state === 'title');

        // Entidades
        for (var k = 0; k < this.powerups.length; k++) {
            this.powerups[k].render(ctx);
        }

        for (var i = 0; i < this.lasers.length; i++) {
            this.lasers[i].render(ctx);
        }

        for (var j = 0; j < this.enemies.length; j++) {
            this.enemies[j].render(ctx);
        }

        if (this.state === 'playing' || this.state === 'paused') {
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
        this.particles.render(ctx);

        ctx.restore();
    };

    // Renderizado del Rival Fantasma 1v1 con estética Cyber-Tangerine
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

    // Bucle principal desacoplado con paso físico fijo de 60 FPS (independiente de pantallas 60Hz/120Hz/144Hz)
    var frameTimeLastMS = 0;
    var frameTimeBufferMS = 0;
    var FIXED_STEP_MS = 1000 / 60;

    function loop(timeMS) {
        requestAnimationFrame(loop);
        timeMS = timeMS || 0;
        if (!frameTimeLastMS) frameTimeLastMS = timeMS;
        var delta = timeMS - frameTimeLastMS;
        frameTimeLastMS = timeMS;
        if (delta > 100) delta = 100;
        frameTimeBufferMS += delta;

        while (frameTimeBufferMS >= FIXED_STEP_MS) {
            game.update();
            frameTimeBufferMS -= FIXED_STEP_MS;
        }
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
                    spaceSeed = (data && data.seed) ? data.seed : 1234567;
                    spacePrng = mulberry32(spaceSeed);
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

})();