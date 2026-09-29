import { randomUUID } from 'node:crypto';

/**
 * PLAY WIN — RIVALES DE DIVISIÓN Y SIMULADOR DE FANTASMAS (Ghost Bot)
 * Provee contrincantes competitivos instantáneos para evitar colas infinitas.
 * Cumple AGENTS.md y playwin-code-governance (< 350 líneas).
 */

export const DIVISION_RIVALS = [
  { id: '11111111-1111-4111-8111-111111111111', username: 'carlos_pro', avatar: '🏎️', rank: 'ORO', skillRating: 1845 },
  { id: '22222222-2222-4222-8222-222222222222', username: 'alex_pro', avatar: '🔥', rank: 'ORO', skillRating: 1820 },
  { id: '33333333-3333-4333-8333-333333333333', username: 'valkyria_99', avatar: '⚡', rank: 'PLATINO', skillRating: 1910 },
  { id: '44444444-4444-4444-8444-444444444444', username: 'titan_speed', avatar: '🏆', rank: 'DIAMANTE', skillRating: 2050 },
  { id: '55555555-5555-4555-8555-555555555555', username: 'novato_esports', avatar: '🚀', rank: 'ORO', skillRating: 1795 },
];

export function getDivisionRival(excludeUsername) {
  const filtered = DIVISION_RIVALS.filter(
    (r) => r.username.toLowerCase() !== (excludeUsername || '').toLowerCase()
  );
  const pool = filtered.length > 0 ? filtered : DIVISION_RIVALS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export class GhostSimulation {
  constructor(gameId, rival, onTick, onFinish, onCrash) {
    this.gameId = gameId;
    this.rival = rival;
    this.onTick = onTick;
    this.onFinish = onFinish;
    this.onCrash = onCrash;
    this.interval = null;
    this.progress = 0;
    this.score = 0;
    this.isAlive = true;
    this.startTime = Date.now();
  }

  start() {
    this.startTime = Date.now();
    this.interval = setInterval(() => {
      if (!this.isAlive) {
        this.stop();
        return;
      }

      const elapsed = (Date.now() - this.startTime) / 1000;
      let x = 0;
      let y = 0;

      if (this.gameId === 'carreras') {
        this.progress += 5.7 + Math.sin(elapsed * 0.4) * 0.5;
        y = this.progress * 10;
        x = Math.sin(elapsed * 0.75) * 380;
        this.score = Math.floor(this.progress);
      } else if (this.gameId === 'flapy-flapy') {
        this.score = Math.floor(elapsed * 1.25);
        x = 60;
        y = 190 + Math.sin(elapsed * 2.2) * 55;
        // Simulación de fallo humano competitivo tras superar 22 puntos
        if (this.score >= 22 && Math.random() < 0.007) {
          this.isAlive = false;
          this.onTick({ x, y, score: this.score, isAlive: false });
          this.stop();
          if (this.onCrash) this.onCrash();
          return;
        }
      } else if (this.gameId === 'sky') {
        this.progress += 1.8 + Math.sin(elapsed * 0.4) * 0.15;
        x = Math.sin(elapsed * 0.7) * 1.8;
        y = this.progress;
        this.score = Math.floor(this.progress);
        // Simulación de caída por salto impreciso tras 320m
        if (this.score >= 320 && Math.random() < 0.006) {
          this.isAlive = false;
          this.onTick({ x, y, score: this.score, isAlive: false });
          this.stop();
          if (this.onCrash) this.onCrash();
          return;
        }
      } else if (this.gameId === 'space') {
        this.progress += 28 + Math.sin(elapsed * 0.8) * 12;
        this.score = Math.floor(this.progress * 10);
        x = 150 + Math.sin(elapsed * 0.9) * 60;
        y = 280 + Math.cos(elapsed * 1.1) * 120;
        // Impacto letal en sectores avanzados (> 35s)
        if (elapsed >= 35 && Math.random() < 0.006) {
          this.isAlive = false;
          this.onTick({ x, y, score: this.score, isAlive: false });
          this.stop();
          if (this.onCrash) this.onCrash();
          return;
        }
      } else {
        this.score = Math.floor(elapsed * 6);
        x = Math.sin(elapsed) * 120;
        y = elapsed * 25;
      }

      this.onTick({ x, y, score: this.score, isAlive: this.isAlive });

      if (this.gameId === 'carreras' && (this.score >= 2600 || elapsed >= 42)) {
        this.stop();
        if (this.onFinish) this.onFinish();
      }
    }, 100);
  }

  pause() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  resume() {
    if (!this.interval && this.isAlive) {
      this.start();
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export function buildGhostRoom(gameId, entry, callbacks) {
  const roomId = `duel_${gameId}_${randomUUID().slice(0, 8)}`;
  const seed = Math.floor(Math.random() * 9000000) + 1000000;
  const rival = getDivisionRival(entry.player.username);
  const now = Date.now();

  const room = {
    roomId,
    gameId,
    status: 'COUNTDOWN',
    seed,
    isGhostMatch: true,
    playerA: { ...entry.player, socket: entry.socket, score: 0, lastTick: { timestamp: now, score: 0, x: 0, y: 0 }, tickHistory: [] },
    playerB: { ...rival, isBot: true, score: 0, lastTick: { timestamp: now, score: 0, x: 0, y: 0 } },
    startedAt: now,
    ghostSimulation: null,
  };

  setTimeout(() => {
    if (room.status === 'COUNTDOWN') {
      room.status = 'PLAYING';
      callbacks.onLive();
      room.ghostSimulation = new GhostSimulation(
        gameId,
        rival,
        (tick) => {
          room.playerB.score = tick.score;
          callbacks.onTick(tick);
        },
        () => {
          if (room.status === 'PLAYING') callbacks.onFinish(room, room.playerB, room.playerA);
        },
        () => {
          if (room.status === 'PLAYING' && callbacks.onCrash) callbacks.onCrash(room, room.playerA, room.playerB);
        }
      );
      room.ghostSimulation.start();
    }
  }, 3000);

  return { room, rival, roomId, seed };
}
