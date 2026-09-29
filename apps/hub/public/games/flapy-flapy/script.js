// ==================================================================
// PLAY WIN: BATI VUELO (BATTY FLY)
// Pure Canvas Vector Art, Dynamic Progressive Difficulty & Web Audio Synth
// ==================================================================

(function () {
    'use strict';

    // Referencias DOM
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const hudScore = document.getElementById('hud-score');
    const hudLevel = document.getElementById('hud-level');
    const hudBest = document.getElementById('hud-best');
    const btnSound = document.getElementById('btn-sound');
    const screenTitle = document.getElementById('screen-title');
    const screenGameOver = document.getElementById('screen-gameover');
    const btnStart = document.getElementById('btn-start');
    const btnRestart = document.getElementById('btn-restart');
    const finalScoreEl = document.getElementById('final-score');
    const finalLevelEl = document.getElementById('final-level');
    const bestScoreEl = document.getElementById('best-score');
    const medalIconEl = document.getElementById('medal-icon');
    const medalNameEl = document.getElementById('medal-name');
    const levelUpBanner = document.getElementById('level-up-banner');
    const levelBannerText = document.getElementById('level-banner-text');
    const levelBannerIcon = document.getElementById('level-banner-icon');
    const previewCanvas = document.getElementById('preview-bat');
    const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;

    // Estados de juego
    const STATE_TITLE = 0;
    const STATE_PLAYING = 1;
    const STATE_GAMEOVER = 2;
    let currentState = STATE_TITLE;

    // Dimensiones virtuales del juego
    const V_WIDTH = 420;
    const V_HEIGHT = 640;
    let dpr = 1;

    // Puntuación, Nivel y Récord
    let score = 0;
    let currentLevel = 1;
    let bestScore = parseInt(localStorage.getItem('playwin_bat_best') || '0', 10);
    if (hudBest) hudBest.textContent = bestScore;

    // PRNG Determinista (Mulberry32) para sincronizar obstáculos idénticos con el rival
    let currentSeed = 1234567;
    function mulberry32(a) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    let prng = mulberry32(currentSeed);

    // Control de tiempo y frames
    let frames = 0;
    let gameOverTime = 0;
    let screenShake = 0;
    let levelBannerTimeout = null;
    let lastTickSent = 0;

    // ==================================================================
    // CÁLCULO DE DIFICULTAD PROGRESIVA POR CADA OBSTÁCULO COMPLETADO
    // ==================================================================
    function getDifficulty(curScore) {
        // Velocidad base 2.2, escala suavemente +0.05 por cada obstáculo superado
        const speed = Math.min(4.1, 2.2 + curScore * 0.05);

        // Brecha de paso entre troncos: empieza cómoda (144px) y se va ajustando hasta 114px
        const gap = Math.max(114, 144 - curScore * 0.65);

        // Intervalo de spawn dinámico calibrado para mantener una distancia cómoda en px (~270px)
        const targetDist = Math.max(240, 280 - curScore * 0.4);
        const spawnInterval = Math.max(62, Math.round(targetDist / speed));

        // Nivel calculado (cada 5 obstáculos superados sube de nivel)
        const level = Math.floor(curScore / 5) + 1;

        // Probabilidad y amplitud de troncos oscilantes (arriba/abajo)
        let moveChance = 0;
        let moveAmp = 0;
        let moveSpeed = 0;

        if (curScore >= 20) {
            moveChance = 0.65;
            moveAmp = 25;
            moveSpeed = 0.045;
        } else if (curScore >= 10) {
            moveChance = 0.45;
            moveAmp = 18;
            moveSpeed = 0.038;
        } else if (curScore >= 5) {
            moveChance = 0.28;
            moveAmp = 12;
            moveSpeed = 0.030;
        }

        return { speed, gap, spawnInterval, level, moveChance, moveAmp, moveSpeed };
    }

    function triggerLevelUpNotice(level) {
        if (!levelUpBanner) return;

        let icon = '⚡';
        let msg = `¡NIVEL ${level} - RITMO ACELERADO!`;

        if (level === 2) {
            icon = '⚡';
            msg = '¡NIVEL 2 - RITMO ACELERADO!';
        } else if (level === 3) {
            icon = '🪵';
            msg = '¡NIVEL 3 - TRONCOS MÓVILES!';
        } else if (level === 4) {
            icon = '🔥';
            msg = '¡NIVEL 4 - BRECHA ESTRECHA!';
        } else if (level === 5) {
            icon = '🌌';
            msg = '¡NIVEL 5 - CREPÚSCULO MÁGICO!';
        } else if (level >= 6) {
            icon = '💎';
            msg = `¡NIVEL ${level} - MODO MAESTRO PLAY WIN!`;
        }

        levelBannerIcon.textContent = icon;
        levelBannerText.textContent = msg;
        levelUpBanner.classList.add('show');

        if (levelBannerTimeout) clearTimeout(levelBannerTimeout);
        levelBannerTimeout = setTimeout(() => {
            levelUpBanner.classList.remove('show');
        }, 2200);
    }

    // ==================================================================
    // SISTEMA DE AUDIO (Web Audio API Synthesizer - 100% Autónomo)
    // ==================================================================
    class AudioSystem {
        constructor() {
            this.ctx = null;
            this.muted = localStorage.getItem('playwin_bat_muted') === 'true';
            this.updateButton();
        }

        init() {
            if (this.ctx) return;
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            } catch (e) {
                console.warn('AudioContext not supported');
            }
        }

        resume() {
            this.init();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        toggleSound() {
            this.muted = !this.muted;
            localStorage.setItem('playwin_bat_muted', this.muted);
            this.updateButton();
            if (!this.muted) {
                this.playFlap();
            }
        }

        updateButton() {
            if (btnSound) {
                btnSound.textContent = this.muted ? '🔇' : '🔊';
                btnSound.style.opacity = this.muted ? '0.6' : '1';
            }
        }

        // Sonido de aleteo suave y alegre
        playFlap() {
            if (this.muted) return;
            this.resume();
            if (!this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(320, t);
                osc.frequency.exponentialRampToValueAtTime(580, t + 0.12);

                gain.gain.setValueAtTime(0.22, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(t);
                osc.stop(t + 0.12);
            } catch (e) {}
        }

        // Sonido armónico de punto superado (+1 Chime cristalino dinámico)
        playPoint(curScore = 0) {
            if (this.muted) return;
            this.resume();
            if (!this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                // Afinación ligeramente más alta conforme avanza la racha
                const pitchOffset = Math.min(240, (curScore % 5) * 45);
                const chord = [880 + pitchOffset, 1318.5 + pitchOffset];

                chord.forEach((freq, i) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, t + i * 0.04);

                    gain.gain.setValueAtTime(0.20, t + i * 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.28);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);

                    osc.start(t + i * 0.04);
                    osc.stop(t + i * 0.04 + 0.28);
                });
            } catch (e) {}
        }

        // Fanfarria armónica al subir de nivel de dificultad
        playLevelUp() {
            if (this.muted) return;
            this.resume();
            if (!this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
                notes.forEach((freq, i) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, t + i * 0.08);
                    gain.gain.setValueAtTime(0.24, t + i * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.35);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(t + i * 0.08);
                    osc.stop(t + i * 0.08 + 0.35);
                });
            } catch (e) {}
        }

        // Sonido de impacto cómico suave ("bonk")
        playHit() {
            if (this.muted) return;
            this.resume();
            if (!this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(260, t);
                osc.frequency.exponentialRampToValueAtTime(70, t + 0.2);

                gain.gain.setValueAtTime(0.35, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(t);
                osc.stop(t + 0.2);
            } catch (e) {}
        }

        // Sonido de caída
        playFall() {
            if (this.muted) return;
            this.resume();
            if (!this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(450, t);
                osc.frequency.exponentialRampToValueAtTime(100, t + 0.35);

                gain.gain.setValueAtTime(0.18, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(t);
                osc.stop(t + 0.35);
            } catch (e) {}
        }
    }

    const audio = new AudioSystem();
    if (btnSound) {
        btnSound.addEventListener('click', (e) => {
            e.stopPropagation();
            audio.toggleSound();
        });
    }

    // ==================================================================
    // SISTEMA DE TEXTOS FLOTANTES (+1, ¡NIVEL UP!)
    // ==================================================================
    class FloatingTextSystem {
        constructor() {
            this.texts = [];
        }

        add(x, y, text, color = '#ffd600') {
            this.texts.push({
                x: x,
                y: y,
                text: text,
                vy: -1.7,
                alpha: 1,
                color: color,
                life: 38,
                maxLife: 38
            });
        }

        update() {
            for (let i = this.texts.length - 1; i >= 0; i--) {
                const t = this.texts[i];
                t.y += t.vy;
                t.life--;
                t.alpha = Math.max(0, t.life / t.maxLife);
                if (t.life <= 0) {
                    this.texts.splice(i, 1);
                }
            }
        }

        draw(ctx) {
            ctx.save();
            for (let i = 0; i < this.texts.length; i++) {
                const t = this.texts[i];
                ctx.globalAlpha = t.alpha;
                ctx.font = '900 18px "Orbitron", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = t.color;
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 6;
                ctx.fillText(t.text, t.x, t.y);
            }
            ctx.restore();
        }

        reset() {
            this.texts = [];
        }
    }

    const floatingTexts = new FloatingTextSystem();

    // ==================================================================
    // SISTEMA DE PARTÍCULAS
    // ==================================================================
    class ParticleSystem {
        constructor() {
            this.particles = [];
        }

        // Estrellas / polvo brillante de aleteo
        emitFlap(x, y) {
            for (let i = 0; i < 4; i++) {
                this.particles.push({
                    x: x - 12 + Math.random() * 8,
                    y: y + 4 + Math.random() * 8,
                    vx: -1.5 - Math.random() * 2,
                    vy: 0.5 + (Math.random() - 0.5) * 2,
                    size: 3 + Math.random() * 3,
                    alpha: 1,
                    color: Math.random() > 0.5 ? '#e9d5ff' : '#ffd600',
                    life: 25 + Math.random() * 15,
                    maxLife: 40
                });
            }
        }

        // Estrellas de éxito al puntuar (+1)
        emitPoint(x, y) {
            for (let i = 0; i < 16; i++) {
                const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5);
                const spd = 2.5 + Math.random() * 3.8;
                this.particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd,
                    size: 3.5 + Math.random() * 3.5,
                    alpha: 1,
                    color: ['#ffd600', '#00f0ff', '#10b981', '#f472b6', '#a855f7'][Math.floor(Math.random() * 5)],
                    life: 30 + Math.random() * 15,
                    maxLife: 45
                });
            }
        }

        // Hojas y estrellitas de impacto
        emitHit(x, y) {
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = 2 + Math.random() * 4.5;
                this.particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd,
                    size: 4 + Math.random() * 4,
                    alpha: 1,
                    color: ['#4ade80', '#854d0e', '#fef08a', '#c084fc', '#ef4444'][Math.floor(Math.random() * 5)],
                    life: 35 + Math.random() * 15,
                    maxLife: 50
                });
            }
        }

        update() {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.06;
                p.life--;
                p.alpha = Math.max(0, p.life / p.maxLife);
                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                }
            }
        }

        draw(ctx) {
            ctx.save();
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        reset() {
            this.particles = [];
        }
    }

    const particles = new ParticleSystem();

    // ==================================================================
    // PERSONAJE: EL MURCIÉLAGO SONRIENTE (BATI SONRIENTE)
    // ==================================================================
    const bat = {
        x: 88,
        y: 280,
        radius: 17,             // Radio efectivo de colisión (justo y preciso)
        velocity: 0,
        gravity: 0.28,          // Gravedad fluida
        jumpForce: 5.6,         // Impulso de aleteo
        rotation: 0,
        wingPhase: 0,           // Fase de aleteo de alas
        blinkTimer: 120,

        reset() {
            this.x = 88;
            this.y = 280;
            this.velocity = 0;
            this.rotation = 0;
            this.wingPhase = 0;
            this.blinkTimer = 120;
        },

        jump() {
            this.velocity = -this.jumpForce;
            this.wingPhase = 0;
            audio.playFlap();
            particles.emitFlap(this.x, this.y);
        },

        update() {
            this.blinkTimer--;
            if (this.blinkTimer <= -12) {
                this.blinkTimer = 140 + Math.floor(Math.random() * 100);
            }

            if (currentState === STATE_TITLE) {
                // Flotación suave y tranquila en la pantalla de inicio
                this.y = 280 + Math.sin(frames * 0.055) * 14;
                this.rotation = Math.sin(frames * 0.04) * 0.08;
                this.wingPhase += 0.14;
            } else if (currentState === STATE_PLAYING) {
                this.velocity += this.gravity;
                this.y += this.velocity;

                // Rotación dinámica según velocidad vertical
                if (this.velocity < 0) {
                    this.rotation = Math.max(-0.45, this.velocity * 0.07);
                    this.wingPhase += 0.35;
                } else {
                    this.rotation = Math.min(1.2, this.rotation + 0.045);
                    this.wingPhase += 0.12;
                }

                // Límite de techo
                if (this.y - this.radius <= 0) {
                    this.y = this.radius;
                    this.velocity = 0;
                }

                // Límite de suelo
                const groundY = V_HEIGHT - 95;
                if (this.y + this.radius >= groundY) {
                    this.y = groundY - this.radius;
                    triggerGameOver();
                }
            } else if (currentState === STATE_GAMEOVER) {
                const groundY = V_HEIGHT - 95;
                if (this.y + this.radius < groundY) {
                    this.velocity += this.gravity * 1.3;
                    this.y += this.velocity;
                    this.rotation = Math.min(1.5, this.rotation + 0.1);
                    if (this.y + this.radius >= groundY) {
                        this.y = groundY - this.radius;
                    }
                }
            }
        },

        // Renderizado vectorial del murciélago
        draw(targetCtx, customX, customY, customScale = 1, isPreview = false) {
            const drawX = customX !== undefined ? customX : this.x;
            const drawY = customY !== undefined ? customY : this.y;
            const rot = isPreview ? 0 : this.rotation;
            const wingAnim = isPreview ? Math.sin(frames * 0.08) : Math.sin(this.wingPhase);
            const isBlinking = this.blinkTimer < 0 && this.blinkTimer > -8;

            targetCtx.save();
            targetCtx.translate(drawX, drawY);
            targetCtx.rotate(rot);
            targetCtx.scale(customScale, customScale);

            // 1. Alas traseras de murciélago (despliegue animado)
            targetCtx.save();
            const wingAngle = wingAnim * 0.55;

            // Ala izquierda / trasera
            targetCtx.save();
            targetCtx.translate(-6, -2);
            targetCtx.rotate(wingAngle - 0.2);
            this.drawBatWing(targetCtx, -1);
            targetCtx.restore();

            // Ala derecha / frontal
            targetCtx.save();
            targetCtx.translate(6, -2);
            targetCtx.rotate(-wingAngle + 0.2);
            this.drawBatWing(targetCtx, 1);
            targetCtx.restore();
            targetCtx.restore();

            // 2. Orejas grandes y adorables
            this.drawBatEar(targetCtx, -12, -18, -0.32);
            this.drawBatEar(targetCtx, 12, -18, 0.32);

            // 3. Cuerpo rechoncho / plumoso (gradiente morado nocturno)
            const bodyGrad = targetCtx.createRadialGradient(-3, -4, 4, 0, 0, 24);
            bodyGrad.addColorStop(0, '#7e22ce');
            bodyGrad.addColorStop(0.7, '#581c87');
            bodyGrad.addColorStop(1, '#3b0764');

            targetCtx.fillStyle = bodyGrad;
            targetCtx.beginPath();
            targetCtx.ellipse(0, 0, 19, 21, 0, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.lineWidth = 1.5;
            targetCtx.strokeStyle = '#2e0854';
            targetCtx.stroke();

            // 4. Pancita suave y tierna (lila claro)
            targetCtx.fillStyle = '#c084fc';
            targetCtx.beginPath();
            targetCtx.ellipse(1, 4, 11, 13, 0, 0, Math.PI * 2);
            targetCtx.fill();

            // 5. Mejillas rosadas (rubor kawaii)
            targetCtx.fillStyle = 'rgba(244, 114, 182, 0.55)';
            targetCtx.beginPath();
            targetCtx.ellipse(-10, 2, 4.5, 3, 0, 0, Math.PI * 2);
            targetCtx.ellipse(11, 2, 4.5, 3, 0, 0, Math.PI * 2);
            targetCtx.fill();

            // 6. Ojazos grandes expresivos
            this.drawBatEye(targetCtx, -6, -4, isBlinking);
            this.drawBatEye(targetCtx, 7, -4, isBlinking);

            // 7. Naricita y sonrisa tierna con colmillitos
            targetCtx.fillStyle = '#f472b6';
            targetCtx.beginPath();
            targetCtx.ellipse(0.5, 1, 3, 2, 0, 0, Math.PI * 2);
            targetCtx.fill();

            // Sonrisa
            targetCtx.strokeStyle = '#2e0854';
            targetCtx.lineWidth = 1.8;
            targetCtx.lineCap = 'round';
            targetCtx.beginPath();
            targetCtx.arc(0.5, 4, 5, 0.2, Math.PI - 0.2, false);
            targetCtx.stroke();

            // Dos colmillitos blancos diminutos
            targetCtx.fillStyle = '#ffffff';
            targetCtx.beginPath();
            targetCtx.moveTo(-3, 6);
            targetCtx.lineTo(-1.5, 9.5);
            targetCtx.lineTo(-0.2, 6);
            targetCtx.closePath();
            targetCtx.fill();

            targetCtx.beginPath();
            targetCtx.moveTo(1.2, 6);
            targetCtx.lineTo(2.5, 9.5);
            targetCtx.lineTo(4, 6);
            targetCtx.closePath();
            targetCtx.fill();

            // 8. Mechón de pelo suave en la cabeza
            targetCtx.fillStyle = '#9333ea';
            targetCtx.beginPath();
            targetCtx.moveTo(-4, -19);
            targetCtx.quadraticCurveTo(0, -25, 4, -19);
            targetCtx.quadraticCurveTo(1, -22, -4, -19);
            targetCtx.fill();

            targetCtx.restore();
        },

        drawBatWing(ctx, side) {
            ctx.save();
            ctx.scale(side, 1);

            const wingGrad = ctx.createLinearGradient(0, -10, 36, 15);
            wingGrad.addColorStop(0, '#581c87');
            wingGrad.addColorStop(1, '#a855f7');

            ctx.fillStyle = wingGrad;
            ctx.strokeStyle = '#2e0854';
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';

            ctx.beginPath();
            ctx.moveTo(4, 0);
            ctx.quadraticCurveTo(18, -20, 34, -12);
            ctx.lineTo(36, -8);
            ctx.quadraticCurveTo(28, 4, 22, -2);
            ctx.quadraticCurveTo(16, 8, 10, 1);
            ctx.quadraticCurveTo(6, 6, 2, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = 'rgba(233, 213, 255, 0.5)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(6, -2);
            ctx.lineTo(34, -12);
            ctx.moveTo(10, 0);
            ctx.lineTo(22, -2);
            ctx.stroke();

            ctx.restore();
        },

        drawBatEar(ctx, x, y, angle) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);

            ctx.fillStyle = '#581c87';
            ctx.strokeStyle = '#2e0854';
            ctx.lineWidth = 1.4;

            ctx.beginPath();
            ctx.moveTo(-7, 4);
            ctx.quadraticCurveTo(-9, -16, 0, -26);
            ctx.quadraticCurveTo(9, -16, 7, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#f472b6';
            ctx.beginPath();
            ctx.moveTo(-4, 2);
            ctx.quadraticCurveTo(-5, -12, 0, -20);
            ctx.quadraticCurveTo(5, -12, 4, 2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        },

        drawBatEye(ctx, x, y, isBlinking) {
            ctx.save();
            ctx.translate(x, y);

            if (isBlinking) {
                ctx.strokeStyle = '#1e1b4b';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.arc(0, 0, 5, 0.15, Math.PI - 0.15, false);
                ctx.stroke();
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(0, 0, 5.5, 7, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = '#1e1b4b';
                ctx.stroke();

                ctx.fillStyle = '#1e1b4b';
                ctx.beginPath();
                ctx.ellipse(0.5, 0, 3.8, 5.2, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(-1, -2, 1.8, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.arc(1.8, 1.8, 0.9, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    };

    // ==================================================================
    // OBSTÁCULOS: TRONCOS DE ROBLE CON DIFICULTAD Y OSCILACIÓN MÓVIL
    // ==================================================================
    const trunks = {
        items: [],
        spawnTimer: 0,
        spawnInterval: 125,
        speed: 2.2,
        gap: 142,
        width: 72,

        reset() {
            this.items = [];
            this.spawnTimer = 0;
            const diff = getDifficulty(0);
            this.speed = diff.speed;
            this.gap = diff.gap;
            this.spawnInterval = diff.spawnInterval;
        },

        spawn() {
            const diff = getDifficulty(score);
            this.gap = diff.gap;

            const groundY = V_HEIGHT - 95;
            const minHeight = 60;
            const availableSpace = groundY - this.gap - minHeight * 2;
            const topHeight = minHeight + prng() * availableSpace;
            const bottomY = topHeight + this.gap;
            const bottomHeight = groundY - bottomY;

            // Determinar si este par de troncos oscilará verticalmente (troncos móviles)
            const isMoving = prng() < diff.moveChance;

            this.items.push({
                x: V_WIDTH + 20,
                baseTopHeight: topHeight,
                topHeight: topHeight,
                bottomY: bottomY,
                bottomHeight: bottomHeight,
                width: this.width,
                gap: this.gap,
                passed: false,
                ivyPattern: Math.floor(prng() * 3),
                isMoving: isMoving,
                moveAmp: diff.moveAmp,
                moveSpeed: diff.moveSpeed,
                phase: prng() * Math.PI * 2
            });
        },

        update() {
            const diff = getDifficulty(score);
            this.speed = diff.speed;
            this.spawnInterval = diff.spawnInterval;

            this.spawnTimer++;
            if (this.spawnTimer >= this.spawnInterval) {
                this.spawnTimer = 0;
                this.spawn();
            }

            const groundY = V_HEIGHT - 95;

            for (let i = this.items.length - 1; i >= 0; i--) {
                const item = this.items[i];
                item.x -= this.speed;

                // Actualizar oscilación vertical si es un tronco móvil
                if (item.isMoving) {
                    const osc = Math.sin(frames * item.moveSpeed + item.phase) * item.moveAmp;
                    item.topHeight = Math.max(50, Math.min(groundY - item.gap - 50, item.baseTopHeight + osc));
                    item.bottomY = item.topHeight + item.gap;
                    item.bottomHeight = groundY - item.bottomY;
                }

                // Sumar punto al superar el centro del obstáculo
                if (!item.passed && item.x + item.width / 2 < bat.x) {
                    item.passed = true;
                    score++;
                    hudScore.textContent = score;

                    // Sonido y partículas
                    audio.playPoint(score);
                    particles.emitPoint(bat.x, bat.y);
                    floatingTexts.add(bat.x + 8, bat.y - 18, '+1', '#ffd600');

                    // Verificar si se alcanza un nuevo nivel de dificultad
                    const newLevel = Math.floor(score / 5) + 1;
                    if (newLevel > currentLevel) {
                        currentLevel = newLevel;
                        if (hudLevel) hudLevel.textContent = currentLevel;
                        audio.playLevelUp();
                        triggerLevelUpNotice(currentLevel);
                        floatingTexts.add(V_WIDTH / 2, 170, `¡NIVEL ${currentLevel}!`, '#c084fc');
                    }
                }

                // Detección de colisión precisa
                if (currentState === STATE_PLAYING) {
                    const hitTop = checkCircleRect(
                        bat.x, bat.y, bat.radius - 2,
                        item.x, 0, item.width, item.topHeight
                    );
                    const hitBottom = checkCircleRect(
                        bat.x, bat.y, bat.radius - 2,
                        item.x, item.bottomY, item.width, item.bottomHeight
                    );

                    if (hitTop || hitBottom) {
                        particles.emitHit(bat.x, bat.y);
                        triggerGameOver();
                    }
                }

                // Eliminar cuando sale de la pantalla
                if (item.x + item.width < -30) {
                    this.items.splice(i, 1);
                }
            }

            // Emitir tick de posición y score al rival a 20Hz (~50ms) con temporizador preciso
            const now = performance.now();
            if (now - lastTickSent >= 48 && window.PlayWin && window.PlayWin.isLive()) {
                lastTickSent = now;
                window.PlayWin.sendTick({ x: bat.x, y: bat.y, score: score, isAlive: true });
            }
        },

        draw(ctx) {
            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                this.drawSingleTrunk(ctx, item.x, 0, item.width, item.topHeight, true, item.ivyPattern, item.isMoving);
                this.drawSingleTrunk(ctx, item.x, item.bottomY, item.width, item.bottomHeight, false, item.ivyPattern, item.isMoving);
            }
        },

        drawSingleTrunk(ctx, x, y, width, height, isTop, ivyType, isMoving) {
            ctx.save();

            // 1. Sombra suave lateral
            ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.fillRect(x + width - 6, y, 6, height);

            // 2. Gradiente corteza de roble natural
            const barkGrad = ctx.createLinearGradient(x, 0, x + width, 0);
            if (isMoving) {
                // Troncos móviles tienen una corteza con tonalidad mágica ámbar-púrpura sutil
                barkGrad.addColorStop(0, '#581c87');
                barkGrad.addColorStop(0.3, '#78350f');
                barkGrad.addColorStop(0.7, '#92400e');
                barkGrad.addColorStop(1, '#451a03');
            } else {
                barkGrad.addColorStop(0, '#5c2d11');
                barkGrad.addColorStop(0.3, '#78350f');
                barkGrad.addColorStop(0.7, '#92400e');
                barkGrad.addColorStop(1, '#451a03');
            }

            ctx.fillStyle = barkGrad;
            ctx.fillRect(x, y, width, height);

            // 3. Vetas de madera estilizadas
            ctx.strokeStyle = 'rgba(69, 26, 3, 0.45)';
            ctx.lineWidth = 1.8;
            for (let vx = x + 14; vx < x + width - 10; vx += 16) {
                ctx.beginPath();
                ctx.moveTo(vx, y);
                ctx.lineTo(vx + (isTop ? 4 : -4), y + height);
                ctx.stroke();
            }

            // Nudo del tronco
            ctx.fillStyle = '#451a03';
            const knotY = isTop ? y + height * 0.4 : y + height * 0.6;
            ctx.beginPath();
            ctx.ellipse(x + width * 0.35, knotY, 6, 9, 0.1, 0, Math.PI * 2);
            ctx.fill();

            // 4. Borde del contorno
            ctx.strokeStyle = isMoving ? '#a855f7' : '#2d1406';
            ctx.lineWidth = isMoving ? 2.2 : 2;
            ctx.strokeRect(x, y, width, height);

            // 5. Capuchón de musgo verde brillante
            const mossY = isTop ? y + height - 16 : y;
            const mossHeight = 16;

            const mossGrad = ctx.createLinearGradient(0, mossY, 0, mossY + mossHeight);
            mossGrad.addColorStop(0, '#4ade80');
            mossGrad.addColorStop(0.5, '#22c55e');
            mossGrad.addColorStop(1, '#15803d');

            ctx.fillStyle = mossGrad;
            ctx.beginPath();
            if (isTop) {
                ctx.moveTo(x - 4, y + height - mossHeight);
                ctx.lineTo(x + width + 4, y + height - mossHeight);
                ctx.lineTo(x + width + 4, y + height - 4);
                for (let px = x + width + 4; px >= x - 4; px -= 12) {
                    ctx.quadraticCurveTo(px - 6, y + height + 6, px - 12, y + height - 2);
                }
                ctx.closePath();
            } else {
                ctx.moveTo(x - 4, y + mossHeight);
                ctx.lineTo(x + width + 4, y + mossHeight);
                ctx.lineTo(x + width + 4, y + 4);
                for (let px = x + width + 4; px >= x - 4; px -= 12) {
                    ctx.quadraticCurveTo(px - 6, y - 6, px - 12, y + 2);
                }
                ctx.closePath();
            }
            ctx.fill();
            ctx.strokeStyle = '#14532d';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 6. Lianas colgantes decorativas
            ctx.strokeStyle = '#15803d';
            ctx.lineWidth = 1.6;
            ctx.fillStyle = '#4ade80';

            const vineX = x + (ivyType === 0 ? 16 : (ivyType === 1 ? 48 : 32));
            const vineStartY = isTop ? y + height : y;
            const vineLength = isTop ? 24 : -18;

            ctx.beginPath();
            ctx.moveTo(vineX, vineStartY);
            ctx.quadraticCurveTo(vineX + 6, vineStartY + vineLength * 0.5, vineX - 2, vineStartY + vineLength);
            ctx.stroke();

            // Hoja en la punta de la liana
            ctx.beginPath();
            ctx.ellipse(vineX - 2, vineStartY + vineLength, 4, 2.5, 0.4, 0, Math.PI * 2);
            ctx.fill();

            // Indicador de gema mística para troncos móviles
            if (isMoving) {
                ctx.fillStyle = '#ffd600';
                ctx.shadowColor = '#ffd600';
                ctx.shadowBlur = 8;
                const gemY = isTop ? y + height - 22 : y + 22;
                ctx.beginPath();
                ctx.arc(x + width / 2, gemY, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }
    };

    function checkCircleRect(cx, cy, r, rx, ry, rw, rh) {
        const closestX = Math.max(rx, Math.min(cx, rx + rw));
        const closestY = Math.max(ry, Math.min(cy, ry + rh));
        const dx = cx - closestX;
        const dy = cy - closestY;
        return (dx * dx + dy * dy) < (r * r);
    }

    // ==================================================================
    // PAISAJE DINÁMICO (DÍA, ATARDECER, CREPÚSCULO Y NOCHE PLAY WIN)
    // ==================================================================
    const environment = {
        skyOffset: 0,
        hillsOffset: 0,
        groundOffset: 0,

        clouds: [
            { x: 30, y: 70, scale: 0.85, speed: 0.35 },
            { x: 190, y: 130, scale: 0.65, speed: 0.22 },
            { x: 330, y: 60, scale: 1.05, speed: 0.42 },
            { x: 450, y: 110, scale: 0.75, speed: 0.30 }
        ],

        // Estrellas titilantes para el modo nocturno
        stars: Array.from({ length: 28 }, () => ({
            x: Math.random() * V_WIDTH,
            y: Math.random() * 260,
            size: 1 + Math.random() * 2,
            blinkSpeed: 0.04 + Math.random() * 0.05
        })),

        update() {
            if (currentState !== STATE_GAMEOVER) {
                this.groundOffset = (this.groundOffset + trunks.speed) % 28;
                this.hillsOffset = (this.hillsOffset + trunks.speed * 0.25) % V_WIDTH;

                for (let i = 0; i < this.clouds.length; i++) {
                    const c = this.clouds[i];
                    c.x -= c.speed;
                    if (c.x < -120) {
                        c.x = V_WIDTH + 80;
                    }
                }
            }
        },

        draw(ctx) {
            const groundY = V_HEIGHT - 95;

            // 1. Cielo Dinámico según nivel / puntuación
            const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);

            if (score < 10) {
                // Día soleado radiante
                skyGrad.addColorStop(0, '#38bdf8');
                skyGrad.addColorStop(0.55, '#7dd3fc');
                skyGrad.addColorStop(0.85, '#bae6fd');
                skyGrad.addColorStop(1, '#fef08a');
            } else if (score < 20) {
                // Atardecer cálido y dorado
                skyGrad.addColorStop(0, '#f97316');
                skyGrad.addColorStop(0.5, '#fb923c');
                skyGrad.addColorStop(0.8, '#c084fc');
                skyGrad.addColorStop(1, '#fde047');
            } else if (score < 35) {
                // Crepúsculo morado místico
                skyGrad.addColorStop(0, '#1e1b4b');
                skyGrad.addColorStop(0.5, '#4c1d95');
                skyGrad.addColorStop(0.85, '#7e22ce');
                skyGrad.addColorStop(1, '#f472b6');
            } else {
                // Noche cósmica Play Win con auroras boreales
                skyGrad.addColorStop(0, '#030712');
                skyGrad.addColorStop(0.5, '#0f172a');
                skyGrad.addColorStop(0.85, '#1e1b4b');
                skyGrad.addColorStop(1, '#064e3b');
            }

            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

            // Estrellas en niveles avanzados (crepúsculo / noche)
            if (score >= 18) {
                this.drawStars(ctx);
            }

            // Sol o Luna según la hora
            if (score < 20) {
                this.drawSun(ctx, score >= 10);
            } else {
                this.drawMoon(ctx);
            }

            // Nubes
            this.drawClouds(ctx);

            // Colinas lejanas
            this.drawDistantHills(ctx);

            // Colinas cercanas
            this.drawNearHills(ctx);

            // Obstáculos (troncos)
            trunks.draw(ctx);

            // Partículas
            particles.draw(ctx);

            // Murciélago Local
            bat.draw(ctx);

            // Murciélago Rival (Multijugador 1v1 - Semitransparente)
            if (window.PlayWin && window.PlayWin.isLive()) {
                const opp = window.PlayWin.getOpponentState();
                if (opp && opp.isAlive) {
                    ctx.save();
                    ctx.globalAlpha = 0.52; // 52% opacidad para el rival
                    bat.draw(ctx, bat.x, opp.y, 1, false);

                    // Etiqueta flotante con el alias del rival
                    ctx.font = '700 11px "Inter", sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                    ctx.shadowBlur = 4;
                    ctx.fillText(opp.username || 'Rival', bat.x, opp.y - 28);
                    ctx.restore();
                }
            }

            // Textos flotantes (+1, ¡Nivel Up!)
            floatingTexts.draw(ctx);

            // Suelo con césped vivo y margaritas
            this.drawGround(ctx);
        },

        drawStars(ctx) {
            ctx.save();
            for (let i = 0; i < this.stars.length; i++) {
                const s = this.stars[i];
                const alpha = 0.35 + Math.sin(frames * s.blinkSpeed + i) * 0.45;
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, alpha)})`;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        },

        drawSun(ctx, isSunset) {
            ctx.save();
            const sunX = V_WIDTH - 65;
            const sunY = isSunset ? 120 : 70;
            const sunColor = isSunset ? '#fb923c' : '#fef08a';

            const haloGrad = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 55);
            haloGrad.addColorStop(0, isSunset ? 'rgba(251, 146, 60, 0.45)' : 'rgba(254, 240, 138, 0.45)');
            haloGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 55, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = sunColor;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },

        drawMoon(ctx) {
            ctx.save();
            const moonX = V_WIDTH - 70;
            const moonY = 80;

            // Halo suave
            const halo = ctx.createRadialGradient(moonX, moonY, 12, moonX, moonY, 40);
            halo.addColorStop(0, 'rgba(192, 132, 252, 0.35)');
            halo.addColorStop(1, 'rgba(192, 132, 252, 0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(moonX, moonY, 40, 0, Math.PI * 2);
            ctx.fill();

            // Luna creciente brillante
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath();
            ctx.arc(moonX - 7, moonY - 4, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },

        drawClouds(ctx) {
            ctx.save();
            const cloudAlpha = score >= 20 ? 0.45 : 0.88;
            for (let i = 0; i < this.clouds.length; i++) {
                const c = this.clouds[i];
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.scale(c.scale, c.scale);

                ctx.fillStyle = `rgba(255, 255, 255, ${cloudAlpha})`;
                ctx.beginPath();
                ctx.arc(0, 0, 22, 0, Math.PI * 2);
                ctx.arc(22, -6, 26, 0, Math.PI * 2);
                ctx.arc(46, -2, 20, 0, Math.PI * 2);
                ctx.arc(66, 4, 16, 0, Math.PI * 2);
                ctx.rect(0, 4, 66, 16);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }
            ctx.restore();
        },

        drawDistantHills(ctx) {
            ctx.save();
            const groundY = V_HEIGHT - 95;
            ctx.fillStyle = score >= 20 ? '#334155' : (score >= 10 ? '#b45309' : '#86efac');
            ctx.beginPath();
            ctx.moveTo(0, groundY);

            const hillStep = 90;
            const offset = this.hillsOffset * 0.4;
            for (let x = -hillStep * 2; x <= V_WIDTH + hillStep * 2; x += hillStep) {
                const hx = x - offset;
                ctx.quadraticCurveTo(hx + hillStep * 0.5, groundY - 60, hx + hillStep, groundY - 20);
            }
            ctx.lineTo(V_WIDTH, groundY);
            ctx.lineTo(0, groundY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        },

        drawNearHills(ctx) {
            ctx.save();
            const groundY = V_HEIGHT - 95;
            ctx.fillStyle = score >= 20 ? '#1e293b' : (score >= 10 ? '#78350f' : '#4ade80');
            ctx.beginPath();
            ctx.moveTo(0, groundY);

            const hillStep = 110;
            const offset = this.hillsOffset;
            for (let x = -hillStep * 2; x <= V_WIDTH + hillStep * 2; x += hillStep) {
                const hx = x - offset;
                ctx.quadraticCurveTo(hx + hillStep * 0.5, groundY - 45, hx + hillStep, groundY - 10);
            }
            ctx.lineTo(V_WIDTH, groundY);
            ctx.lineTo(0, groundY);
            ctx.closePath();
            ctx.fill();

            // Pequeñas siluetas de arbolitos en las colinas
            ctx.fillStyle = score >= 20 ? '#0f172a' : (score >= 10 ? '#451a03' : '#22c55e');
            for (let tx = 30; tx < V_WIDTH + 60; tx += 95) {
                const treeX = ((tx - offset + V_WIDTH * 2) % V_WIDTH);
                ctx.beginPath();
                ctx.arc(treeX, groundY - 32, 10, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        },

        drawGround(ctx) {
            ctx.save();
            const groundY = V_HEIGHT - 95;
            const groundHeight = 95;

            // 1. Capa superior de césped
            ctx.fillStyle = score >= 20 ? '#065f46' : '#22c55e';
            ctx.fillRect(0, groundY, V_WIDTH, 14);

            // Borde brillante de césped
            ctx.fillStyle = score >= 20 ? '#10b981' : '#86efac';
            ctx.fillRect(0, groundY, V_WIDTH, 3);

            // Franjas de briznas de césped en movimiento
            ctx.fillStyle = score >= 20 ? '#047857' : '#16a34a';
            for (let gx = -this.groundOffset; gx < V_WIDTH + 20; gx += 20) {
                ctx.beginPath();
                ctx.moveTo(gx, groundY + 14);
                ctx.lineTo(gx + 8, groundY + 2);
                ctx.lineTo(gx + 12, groundY + 14);
                ctx.fill();
            }

            // 2. Tierra fértil en scroll
            const soilGrad = ctx.createLinearGradient(0, groundY + 14, 0, V_HEIGHT);
            soilGrad.addColorStop(0, '#92400e');
            soilGrad.addColorStop(0.4, '#78350f');
            soilGrad.addColorStop(1, '#451a03');

            ctx.fillStyle = soilGrad;
            ctx.fillRect(0, groundY + 14, V_WIDTH, groundHeight - 14);

            // Piedritas
            ctx.fillStyle = '#b45309';
            for (let px = -this.groundOffset; px < V_WIDTH + 30; px += 28) {
                ctx.beginPath();
                ctx.arc(px + 4, groundY + 36, 3, 0, Math.PI * 2);
                ctx.arc(px + 16, groundY + 58, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Margaritas / luciérnagas flotantes
            for (let fx = 18; fx < V_WIDTH + 40; fx += 55) {
                const flowerX = ((fx - this.groundOffset * 1.2 + V_WIDTH * 2) % V_WIDTH);

                if (score >= 25) {
                    // Modo nocturno: Luciérnagas mágicas flotantes
                    const glowAlpha = 0.4 + Math.sin(frames * 0.08 + fx) * 0.45;
                    ctx.fillStyle = `rgba(250, 204, 21, ${glowAlpha})`;
                    ctx.shadowColor = '#facc15';
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.arc(flowerX, groundY - 10 + Math.sin(frames * 0.04 + fx) * 6, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                } else {
                    // Margaritas de día
                    ctx.strokeStyle = '#15803d';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(flowerX, groundY + 2);
                    ctx.lineTo(flowerX, groundY - 6);
                    ctx.stroke();

                    ctx.fillStyle = (fx % 110 === 0) ? '#f472b6' : '#ffffff';
                    ctx.beginPath();
                    ctx.arc(flowerX, groundY - 7, 3.2, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.arc(flowerX, groundY - 7, 1.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.restore();
        }
    };

    // ==================================================================
    // CONTROL DE FLUJO DEL JUEGO
    // ==================================================================
    function startGame() {
        audio.resume();
        currentState = STATE_PLAYING;
        score = 0;
        currentLevel = 1;
        hudScore.textContent = '0';
        if (hudLevel) hudLevel.textContent = '1';
        screenTitle.classList.remove('active');
        screenGameOver.classList.remove('active');
        if (levelUpBanner) levelUpBanner.classList.remove('show');
        trunks.reset();
        particles.reset();
        floatingTexts.reset();
        bat.reset();
        bat.jump();
    }

    function triggerGameOver() {
        if (currentState === STATE_GAMEOVER) return;
        currentState = STATE_GAMEOVER;
        gameOverTime = Date.now();
        screenShake = 16;
        audio.playHit();
        audio.playFall();

        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('playwin_bat_best', bestScore);
            if (hudBest) hudBest.textContent = bestScore;
        }

        // Notificar colisión al servidor Realtime (Muerte Súbita 1v1) con estado final
        if (window.PlayWin && window.PlayWin.isLive()) {
            window.PlayWin.sendTick({ x: bat.x, y: bat.y, score: score, isAlive: false });
            window.PlayWin.notifyCrash();
        }
    }

    function handleFlapInput(e) {
        if (e && e.type === 'touchstart') {
            e.preventDefault();
        }

        if (currentState === STATE_PLAYING && window.PlayWin && window.PlayWin.isLive()) {
            bat.jump();
        }
    }

    // ==================================================================
    // EVENT LISTENERS
    // ==================================================================
    canvas.addEventListener('touchstart', handleFlapInput, { passive: false });
    canvas.addEventListener('mousedown', handleFlapInput);

    if (btnStart) {
        btnStart.addEventListener('click', (e) => {
            e.stopPropagation();
            startGame();
        });
    }

    if (btnRestart) {
        btnRestart.addEventListener('click', (e) => {
            e.stopPropagation();
            startGame();
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
            e.preventDefault();
            handleFlapInput();
        }
    });

    // ==================================================================
    // RESPONSIVE & CANVAS SCALING
    // ==================================================================
    function resizeCanvas() {
        dpr = window.devicePixelRatio || 1;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        const targetAspect = V_WIDTH / V_HEIGHT;
        let displayW = screenW;
        let displayH = screenH;

        if (screenW / screenH > targetAspect) {
            displayW = screenH * targetAspect;
        } else {
            displayH = screenW / targetAspect;
        }

        if (screenW > 600) {
            displayW = Math.min(480, screenW * 0.85);
            displayH = displayW / targetAspect;
        }

        canvas.style.width = `${Math.floor(displayW)}px`;
        canvas.style.height = `${Math.floor(displayH)}px`;

        canvas.width = Math.floor(V_WIDTH * dpr);
        canvas.height = Math.floor(V_HEIGHT * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // ==================================================================
    // VISTA PREVIA DEL MURCIÉLAGO EN LA PANTALLA DE INICIO
    // ==================================================================
    function renderPreviewBat() {
        if (!previewCtx) return;
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        bat.draw(previewCtx, previewCanvas.width / 2, previewCanvas.height / 2 + 2, 1.4, true);
    }

    // ==================================================================
    // BUCLE PRINCIPAL DE JUEGO (FÍSICA FIJA 60 FPS INDEPENDIENTE DE 120Hz/144Hz)
    // ==================================================================
    let frameTimeLastMS = 0;
    let frameTimeBufferMS = 0;
    const FIXED_STEP_MS = 1000 / 60;

    function updateSimulation() {
        frames++;
        environment.update();
        bat.update();

        if (currentState === STATE_PLAYING) {
            trunks.update();
        }
        particles.update();
        floatingTexts.update();
    }

    function gameLoop(timeMS = 0) {
        requestAnimationFrame(gameLoop);

        if (!frameTimeLastMS) frameTimeLastMS = timeMS;
        let delta = timeMS - frameTimeLastMS;
        frameTimeLastMS = timeMS;
        if (delta > 100) delta = 100;
        frameTimeBufferMS += delta;

        while (frameTimeBufferMS >= FIXED_STEP_MS) {
            updateSimulation();
            frameTimeBufferMS -= FIXED_STEP_MS;
        }

        ctx.save();

        if (screenShake > 0) {
            const shakeX = (Math.random() - 0.5) * screenShake;
            const shakeY = (Math.random() - 0.5) * screenShake;
            ctx.translate(shakeX, shakeY);
            screenShake *= 0.88;
            if (screenShake < 0.5) screenShake = 0;
        }

        environment.draw(ctx);
        ctx.restore();

        if (currentState === STATE_TITLE && frames % 2 === 0) {
            renderPreviewBat();
        }
    }

    renderPreviewBat();
    requestAnimationFrame(gameLoop);

    // ==================================================================
    // CONEXIÓN CON EL SDK PLAYWIN (MULTIJUGADOR 1v1)
    // ==================================================================
    if (window.PlayWin) {
        window.PlayWin.init({
            gameId: 'flapy-flapy',
            callbacks: {
                onMatchReady: (data) => {
                    currentSeed = data.seed;
                    prng = mulberry32(currentSeed);
                    score = 0;
                    currentLevel = 1;
                    if (hudScore) hudScore.textContent = '0';
                    if (hudLevel) hudLevel.textContent = '1';
                    trunks.reset();
                    particles.reset();
                    floatingTexts.reset();
                    bat.reset();
                    lastTickSent = 0;
                    currentState = STATE_TITLE;
                },
                onMatchLive: () => {
                    startGame();
                },
                onMatchEnd: () => {
                    currentState = STATE_GAMEOVER;
                }
            }
        });
    }

})();