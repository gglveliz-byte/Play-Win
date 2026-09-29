import { randomUUID } from 'node:crypto';

/**
 * PLAY WIN — RIVALES DE DIVISIÓN Y SIMULADOR DE FANTASMAS (Ghost Bot)
 * Provee contrincantes competitivos instantáneos para evitar colas infinitas.
 * Cumple AGENTS.md y playwin-code-governance (< 350 líneas).
 */

/**
 * RIVALES DE DIVISIÓN (bots de relleno).
 *
 * ⚠️ REGLAS DE DISEÑO — leer antes de tocar esta lista:
 *
 * 1. `rank` DEBE corresponder a `skillRating` según los umbrales oficiales de
 *    `constants.js`. Antes la lista era incoherente: un bot DIAMANTE con 2050
 *    de MMR aparecía contra jugadores de ORO de 1820, que es exactamente lo
 *    contrario de lo que promete el sharding por habilidad.
 *
 * 2. Debe haber VARIOS bots por división. Si solo existe uno por tramo, el
 *    jugador se enfrenta siempre al mismo rival y se nota artificial.
 *
 * 3. El MMR de cada bot está dentro de su banda de división, así que un jugador
 *    solo se empareja con rivales de su nivel.
 */
export const DIVISION_RIVALS = [
  // ── BRONZE (MMR 0–1399) ────────────────────────────────────────────────
  { id: 'b1000000-0000-4000-8000-000000000001', username: 'aprendiz_leo', avatar: '🌱', rank: 'BRONZE', skillRating: 1215 },
  { id: 'b1000000-0000-4000-8000-000000000002', username: 'nico_novato', avatar: '🥉', rank: 'BRONZE', skillRating: 1305 },

  // ── SILVER (MMR 1400–1599) ─────────────────────────────────────────────
  { id: 'b2000000-0000-4000-8000-000000000001', username: 'sofia_plata', avatar: '🥈', rank: 'SILVER', skillRating: 1450 },
  { id: 'b2000000-0000-4000-8000-000000000002', username: 'dani_runner', avatar: '💨', rank: 'SILVER', skillRating: 1550 },

  // ── GOLD (MMR 1600–1849) ───────────────────────────────────────────────
  { id: 'b3000000-0000-4000-8000-000000000001', username: 'carlos_pro', avatar: '🏎️', rank: 'GOLD', skillRating: 1680 },
  { id: 'b3000000-0000-4000-8000-000000000002', username: 'novato_esports', avatar: '🚀', rank: 'GOLD', skillRating: 1795 },

  // ── PLATINUM (MMR 1850–2099) ───────────────────────────────────────────
  { id: 'b4000000-0000-4000-8000-000000000001', username: 'valkyria_99', avatar: '⚡', rank: 'PLATINUM', skillRating: 1910 },
  { id: 'b4000000-0000-4000-8000-000000000002', username: 'alex_pro', avatar: '🔥', rank: 'PLATINUM', skillRating: 2005 },

  // ── DIAMOND (MMR 2100–2399) ────────────────────────────────────────────
  { id: 'b5000000-0000-4000-8000-000000000001', username: 'titan_speed', avatar: '🏆', rank: 'DIAMOND', skillRating: 2180 },
  { id: 'b5000000-0000-4000-8000-000000000002', username: 'kira_apex', avatar: '💎', rank: 'DIAMOND', skillRating: 2290 },

  // ── ELITE (MMR 2400+) ──────────────────────────────────────────────────
  { id: 'b6000000-0000-4000-8000-000000000001', username: 'zero_legend', avatar: '👑', rank: 'ELITE', skillRating: 2450 },
  { id: 'b6000000-0000-4000-8000-000000000002', username: 'nova_prime', avatar: '🌟', rank: 'ELITE', skillRating: 2600 },
];

/**
 * Elige un rival de división apropiado para el jugador.
 *
 * Prioriza la MISMA división que el jugador. Si esa división aún no tiene bots
 * (o el jugador no tiene pasaporte), cae a la lista completa antes que dejarle
 * esperando indefinidamente.
 *
 * @param {string} [excludeUsername] Evita que el rival sea el propio jugador.
 * @param {string} [preferredTier] División del jugador (BRONZE..ELITE).
 */
export function getDivisionRival(excludeUsername, preferredTier) {
  const notSelf = DIVISION_RIVALS.filter(
    (r) => r.username.toLowerCase() !== (excludeUsername || '').toLowerCase()
  );
  const base = notSelf.length > 0 ? notSelf : DIVISION_RIVALS;

  // Misma división primero: es lo que promete el sharding por habilidad.
  const sameTier = preferredTier ? base.filter((r) => r.rank === preferredTier) : [];
  const pool = sameTier.length > 0 ? sameTier : base;

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

export function buildGhostRoom(gameId, entry, callbacks, preferredTier) {
  const roomId = `duel_${gameId}_${randomUUID().slice(0, 8)}`;
  const seed = Math.floor(Math.random() * 9000000) + 1000000;
  // El rival se elige de la MISMA división que el jugador, no al azar.
  const rival = getDivisionRival(entry.player.username, preferredTier);
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
