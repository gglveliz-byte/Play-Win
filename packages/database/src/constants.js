/**
 * PLAY WIN — CONSTANTES DE NEGOCIO COMPARTIDAS (constants.js)
 * ==============================================================================
 * ÚNICA FUENTE DE VERDAD para los valores que rigen la competición y la
 * contabilidad.
 *
 * ¿Por qué existe este archivo?
 * Antes estos valores estaban escritos literalmente en 6+ archivos, tanto en
 * backend como en frontend. Un olvido al cambiarlos producía inconsistencia
 * contable entre lo MOSTRADO al jugador y lo PAGADO realmente (BUG-008).
 *
 * ⚠️ Si cambias un valor aquí, se propaga a todo el sistema. Verifica contra
 *    la base de datos antes de desplegar.
 * ==============================================================================
 */

/**
 * Tipos de asiento contable válidos para `wallet_ledger.type`.
 *
 * 🔴 NUNCA inventes otros nombres. El panel de administración buscaba
 *    'WHOP_DEPOSIT' y 'LEAGUE_PRIZE', que jamás se escriben: por eso mostraba
 *    siempre $0.00 (BUG-004).
 */
export const LEDGER_TYPES = Object.freeze({
  /** Depósito de dinero real (vía Whop o PayPal). */
  DEPOSIT: 'DEPOSIT',
  /** Premio de liga acreditado al cerrar la temporada. */
  PRIZE_WIN: 'PRIZE_WIN',
  /** Retiro solicitado por el jugador. */
  WITHDRAWAL: 'WITHDRAWAL',
  /** Cuota de entrada a un torneo (declarado, sin uso todavía). */
  ENTRY_FEE: 'ENTRY_FEE',
  /** Alta de membresía premium de Whop. Importe 0, solo traza. */
  WHOP_MEMBERSHIP_ACTIVATED: 'WHOP_MEMBERSHIP_ACTIVATED',
});

/** Proveedores de pago válidos para `wallet_ledger.provider`. */
export const LEDGER_PROVIDERS = Object.freeze({
  WHOP: 'WHOP',
  PAYPAL: 'PAYPAL',
  SYSTEM: 'SYSTEM',
});

/** Estados de un asiento contable. */
export const LEDGER_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
});

/**
 * Bolsa total de una micro-liga de 10 jugadores, en USD.
 * Debe coincidir con `league_groups.prize_pool` (DEFAULT 25.00).
 */
export const LEAGUE_PRIZE_POOL = 25.0;

/**
 * Reparto de la bolsa por posición final.
 * Debe coincidir EXACTAMENTE con el cálculo de `settle.ts`.
 */
export const PRIZE_SPLIT = Object.freeze({
  1: 15.0,
  2: 7.0,
  3: 3.0,
});

/**
 * Ajuste de Skill Rating (MMR) por posición final en la liga.
 *
 * 🔴 REGLA DOCTRINAL: el MMR se ajusta UNA SOLA VEZ por semana, al cerrar la
 *    temporada. Un duelo individual NUNCA mueve el `skill_rating`; solo otorga
 *    Season Points.
 *
 * Claves: posiciones exactas 1-3; `MID` = 4º a 7º; `LOW` = 8º a 9º; `LAST` = 10º.
 */
export const MMR_DELTAS = Object.freeze({
  1: 60,
  2: 35,
  3: 20,
  MID: 0,
  LOW: -25,
  LAST: -50,
});

/** Rango de posiciones que se consideran zona segura. */
export const MMR_MID_RANGE = Object.freeze({ FROM: 4, TO: 7 });
/** Rango de posiciones en zona de riesgo (sin llegar a último). */
export const MMR_LOW_RANGE = Object.freeze({ FROM: 8, TO: 9 });

/**
 * Season Points otorgados por cada duelo 1v1.
 * Estos puntos NO afectan al MMR.
 */
export const SEASON_POINTS = Object.freeze({
  WIN: 100,
  LOSS: 20,
  FORFEIT: 0,
  CHEAT: 0,
});

/** MMR inicial de un pasaporte nuevo (`game_passports.skill_rating` DEFAULT). */
export const INITIAL_SKILL_RATING = 1200;

/** Divisiones competitivas, de menor a mayor. */
export const RANK_TIERS = Object.freeze([
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'DIAMOND',
  'ELITE',
]);

/**
 * Umbrales de MMR para cada división.
 * Un jugador pertenece a la división más alta cuyo `min` no supere su MMR.
 *
 * Deben cubrir desde 0 hasta el infinito sin huecos.
 */
export const RANK_TIER_THRESHOLDS = Object.freeze([
  { tier: 'ELITE', min: 2400 },
  { tier: 'DIAMOND', min: 2100 },
  { tier: 'PLATINUM', min: 1850 },
  { tier: 'GOLD', min: 1600 },
  { tier: 'SILVER', min: 1400 },
  { tier: 'BRONZE', min: 0 },
]);

/**
 * Resuelve la división correspondiente a un Skill Rating.
 *
 * @param {number} skillRating MMR actual del jugador en un juego.
 * @returns {'BRONZE'|'SILVER'|'GOLD'|'PLATINUM'|'DIAMOND'|'ELITE'}
 */
export function resolveRankTier(skillRating) {
  const rating = Number.isFinite(Number(skillRating)) ? Number(skillRating) : INITIAL_SKILL_RATING;
  const match = RANK_TIER_THRESHOLDS.find((t) => rating >= t.min);
  return match ? match.tier : 'BRONZE';
}

/** Catálogo oficial de disciplinas. Única fuente de verdad de los `game_id`. */
export const GAMES = Object.freeze([
  { id: 'carreras', name: 'Speed Horizon 3D', badge: '3D RACING' },
  { id: 'flapy-flapy', name: 'Bati Vuelo 1v1', badge: 'PRECISION TAP' },
  { id: 'space', name: 'Fuerza Espacial', badge: 'ARCADE SHMUP' },
  { id: 'sky', name: 'Sky Runner 3D', badge: '3D RUNNER' },
]);

/** Lista simple de identificadores de juego, en orden canónico. */
export const GAME_IDS = Object.freeze(GAMES.map((g) => g.id));

/** Duración de la ventana de gracia de reconexión, en milisegundos. */
export const RECONNECT_GRACE_MS = 15000;

/** Espera antes de emparejar contra un rival de división (Ghost Bot), en ms. */
export const GHOST_MATCH_TIMEOUT_MS = 3500;

/**
 * Duración máxima de un duelo, en milisegundos.
 *
 * Sin este tope una partida podía no terminar NUNCA. Ocurre de verdad: en Sky
 * Runner los dos jugadores avanzan al mismo ritmo y la pista siempre ofrece un
 * paso practicable, así que dos jugadores buenos pueden sobrevivir
 * indefinidamente. El duelo se quedaba abierto, no se registraba resultado y la
 * sala seguía ocupada.
 *
 * Al agotarse el tiempo gana quien más puntuación tenga (en carreras, más
 * distancia; en Sky Runner, más tiempo sobrevivido).
 */
export const MATCH_TIME_LIMIT_MS = 180000; // 3 minutos
