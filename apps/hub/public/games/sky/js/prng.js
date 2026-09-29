// ==================================================================
// PLAY WIN: SKY RUNNER 3D — DETERMINISTIC PRNG & TRACK GENERATOR
// Generador determinista Mulberry32 sincronizado por semilla (< 100 líneas)
// ==================================================================

export function createPRNG(seed = 123456) {
  let s = (seed >>> 0) || 123456;
  return function mulberry32() {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TrackManager {
  constructor(seed = 123456) {
    this.reset(seed);
  }

  reset(seed = 123456) {
    this.prng = createPRNG(seed);
    this.trackRows = [];
    this.trackGap = 0;
    this.trackSx = 3;
    this.trackSw = 3;
    this.ensureTrackUpTo(60);
  }

  ensureTrackUpTo(targetRow) {
    for (let i = this.trackRows.length; i <= targetRow; ) {
      const rand1 = this.prng();
      const rand2 = this.prng();
      const rand3 = this.prng();
      const rand4 = this.prng();

      if (this.trackGap < -8 && rand1 < Math.min(0.2, i / 10000)) {
        this.trackGap = 2 + Math.min(4, i / 400);
      }
      if (rand2 < 0.1) {
        this.trackSw = 2 + Math.floor(rand3 * 3);
        this.trackSx = Math.max(0, Math.min(7 - this.trackSw, this.trackSx - 2 + Math.floor(rand4 * 5)));
      }
      this.trackGap--;

      const p = [];
      for (let j = 7; j--; ) {
        const randTile = this.prng();
        p[j] = (i < 35)
          | (randTile > 0.9)
          | (this.trackGap < 0 && this.trackSx <= j && j < this.trackSx + this.trackSw && this.prng() > Math.min(0.2, i / 10000));
      }
      this.trackRows[i++] = p;
    }
  }

  cleanup(limitRow) {
    if (limitRow > 50 && this.trackRows[limitRow]) {
      this.trackRows[limitRow] = null;
    }
  }

  getRow(r) {
    this.ensureTrackUpTo(r);
    return this.trackRows[r];
  }
}
