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
      // ------------------------------------------------------------------
      // LA BANDA DE HUECOS SE MUEVE SOLA, fila a fila.
      //
      // Antes se quedaba quieta y sólo cambiaba de sitio un 10% de las veces, así
      // que el hueco se repetía en el mismo carril durante cientos de filas. Eso
      // hacía dos cosas mal: creaba paredes IMPOSIBLES de saltar (cuando la banda
      // tapaba todos los carriles) y, tras garantizar un paso, dejaba la pista
      // tan fácil que nadie caía nunca.
      //
      // Ahora la banda se desplaza un carril de vez en cuando y se ensancha con
      // la distancia. El paso siempre existe, pero hay que SEGUIRLO: mantenerse
      // vivo exige moverse, y ahí está la habilidad que decide el duelo.
      // ------------------------------------------------------------------
      if (this.prng() < 0.22) {
        this.trackSx = Math.max(0, Math.min(7 - this.trackSw, this.trackSx + (this.prng() < 0.5 ? -1 : 1)));
      }
      if (this.prng() < 0.04) {
        // La banda se ensancha MUY despacio: 2 carriles durante el primer minuto
        // largo y hasta 4 sólo en partidas muy largas. Con `i / 900` llegaba a 4
        // carriles en apenas un minuto y la pista se volvía tan estrecha que
        // nadie podía fallar, así que el duelo nunca se decidía.
        this.trackSw = 2 + (i > 3600 ? 1 : 0) + (i > 9000 ? 1 : 0);
      }

      const p = [];
      for (let j = 7; j--; ) {
        const randTile = this.prng();
        const dentroDeLaBanda = this.trackSx <= j && j < this.trackSx + this.trackSw;
        p[j] = (i < 35) || (randTile > 0.9) || dentroDeLaBanda;
      }

      // PASO GARANTIZADO: nunca una fila sin ningún carril sólido. Sin esto
      // aparecían paredes infranqueables y todo el mundo caía en el mismo metro,
      // así que el duelo no podía decidirse por habilidad.
      if (!p.some(Boolean)) p[this.trackSx % 7] = true;

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
