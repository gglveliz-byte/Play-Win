/**
 * PLAY WIN — LIMITADOR DE PETICIONES (rate-limit.ts)
 * ==============================================================================
 * Ventana deslizante en memoria por clave (habitualmente la IP del cliente).
 *
 * ¿Por qué existe?
 * La bitácora afirmaba que existía un rate limiter de "10 intentos por IP/minuto"
 * en las rutas de autenticación. Se verificó que era FALSO: cero referencias en
 * todo el código (BUG-010). Sin él había fuerza bruta ilimitada de contraseñas
 * y spam ilimitado de correos de recuperación (que cuesta dinero real).
 *
 * ⚠️ LIMITACIÓN CONOCIDA Y ACEPTADA: el almacén vive en memoria del proceso.
 *    Con varias instancias desplegadas, cada una lleva su propio conteo, así que
 *    el límite efectivo se multiplica por el número de instancias. Para un
 *    despliegue multi-instancia esto debe migrarse a Redis. Se documenta aquí
 *    en lugar de dar una falsa sensación de seguridad.
 * ==============================================================================
 */

interface HitRecord {
  /** Marcas de tiempo de las peticiones, en milisegundos. */
  timestamps: number[];
}

const stores = new Map<string, Map<string, HitRecord>>();

/** Limpieza periódica para que el mapa no crezca indefinidamente. */
const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [, store] of stores) {
      for (const [key, record] of store) {
        // Descarta las marcas fuera de la ventana más larga configurada (1 hora).
        record.timestamps = record.timestamps.filter((t) => now - t < 3_600_000);
        if (record.timestamps.length === 0) store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // No mantener vivo el proceso solo por el temporizador.
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

export interface RateLimitResult {
  /** true si la petición está permitida. */
  allowed: boolean;
  /** Peticiones restantes en la ventana. */
  remaining: number;
  /** Segundos que faltan para poder reintentar (0 si está permitido). */
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Identificador del limitador (ej. 'auth:login'). Separa contadores. */
  name: string;
  /** Clave del sujeto limitado (ej. la IP). */
  key: string;
  /** Máximo de peticiones permitidas dentro de la ventana. */
  limit: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

/**
 * Registra una petición y decide si está permitida.
 * Consumir el cupo es un efecto secundario: llamar a esta función cuenta.
 */
export function checkRateLimit({ name, key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  ensureCleanup();

  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }

  const now = Date.now();
  const record = store.get(key) ?? { timestamps: [] };
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= limit) {
    store.set(key, record);
    const oldest = record.timestamps[0];
    const retryAfterMs = windowMs - (now - oldest);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  record.timestamps.push(now);
  store.set(key, record);

  return { allowed: true, remaining: limit - record.timestamps.length, retryAfterSeconds: 0 };
}

/**
 * Extrae la IP del cliente desde las cabeceras de la petición.
 * Detrás de un proxy (Vercel, Cloudflare) la IP real viene en `x-forwarded-for`.
 */
export function clientIpFrom(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') || 'desconocida';
}

/**
 * Purga todos los contadores. Existe para que las suites de prueba puedan
 * empezar desde cero sin que el estado de una prueba afecte a la siguiente.
 */
export function resetRateLimits(name?: string): void {
  if (name) stores.delete(name);
  else stores.clear();
}
