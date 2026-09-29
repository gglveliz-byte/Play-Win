// Carga la raíz del monorepo `.env` antes de leer cualquier secreto.
// Así cualquier consumidor de este módulo (servidor o suites de prueba)
// obtiene JWT_SECRET del entorno sin pasos manuales.
import './load-env.js';
import crypto from 'node:crypto';

/**
 * ==============================================================================
 * PLAY WIN ANTI-CHEAT ENGINE (anticheat.js)
 * Motor de Auditoría y Blindaje Ciberseguro para Duelos 1v1
 * Gobernado por AGENTS.md (Zero Client Trust) y playwin-code-governance (< 350L)
 * ==============================================================================
 */

/**
 * Secreto de firma de MatchTickets. Se lee EXCLUSIVAMENTE del entorno.
 * No existe valor por defecto: un fallback silencioso a un secreto quemado en
 * el código es lo que causó el BUG-002 de la auditoría.
 * Lo carga src/load-env.js al arrancar (ver src/server.js).
 */
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    '[PlayWin AntiCheat] Falta la variable de entorno obligatoria "JWT_SECRET".\n' +
      '  → Debe ser IDÉNTICA a la del Hub (apps/hub/.env.local).\n' +
      '  → Configúrala en la raíz: .env  (plantilla: .env.example)'
  );
}

// Límites físicos y teóricos máximos por segundo por videojuego
// CARRERAS: score = Math.floor(position.z / 10), velocity.z alcanza ~390/frame a 60fps
// → tasa real máxima: 390 * 60 / 10 ≈ 2340 m/s. Límite con margen: 2500.
export const GAME_PHYSICS_BOUNDS = {
  'carreras': {
    isDiscreteScore: false,
    maxScoreDeltaPerSec: 2500, // Máximo real con turbo nitro a 60fps (~2340 m/s)
    maxPositionJump: 800,      // Salto lateral máximo en un tick (50ms)
    maxPlayerX: 2200,          // Límites laterales de la pista (roadWidth + arcén)
    minMatchDurationMs: 4000,
  },
  'flapy-flapy': {
    isDiscreteScore: true,
    maxScoreRatePerSec: 1.25,  // Frecuencia máxima (~1.05 obstáculo/seg a dificultad máxima)
    maxScoreBurstDelta: 2,     // Máximo salto permitido en jitter de red ordinario
    maxPositionJump: 350,      // Salto vertical máximo permitido en un tick (50ms)
    minY: -25,                 // Techo: evita que el murciélago flote sobre las tuberías
    maxY: 575,                 // Suelo: evita que atraviese el terreno (noclip)
    expectedX: 88,             // Coordenada horizontal fija canónica del murciélago
    maxDeltaX: 45,             // Tolerancia lateral para evitar desplazamiento en X
    minMatchDurationMs: 2500,
  },
  'space': {
    // Score real máx: bomba mata ~10 cruceros (6.000) + combo x5 inmediato (~9.900/s)
    maxScoreDeltaPerSec: 15000, // Techo con 50% de margen sobre el pico realista de ~9.900/s
    // Velocidad de nave: 6.5px * 2.0 * gameSpeed; arrastre táctil ultra-wide: dist*0.45
    // → ~1.152px/frame en 4K; entre ticks 50ms (3 frames): max ~1.200px legítimos
    maxPositionJump: 1200,      // Teletransporte claro > 1.200px; arrastre legítimo ≤ 1.200px
    maxPlayerX: 2800,           // Pantalla 4K landscape + margen de spawn (+30px lateral)
    maxPlayerY: 1600,           // Pantalla 4K portrait + margen inferior
    minMatchDurationMs: 3500,
  },
  'sky': {
    maxScoreDeltaPerSec: 100,  // Velocidad de avance de plataformas 3D con margen
    maxPositionJump: 500,
    minMatchDurationMs: 3500,
  },
};

/**
 * 1. Verificación Criptográfica de Identidad (MatchTicket JWT)
 */
export function verifyMatchTicket(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signatureB64 !== expectedSig) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    // Validación de expiración (tokens efímeros duran 5 min)
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * 2. Detector de Speedhack y Saltos de Puntuación Imposibles
 */
export function validateTickPhysics(gameId, lastTick, currentTick, matchStartTime) {
  if (!lastTick || (lastTick.x === 0 && lastTick.y === 0 && (lastTick.score || 0) === 0)) {
    return { valid: true };
  }

  const bounds = GAME_PHYSICS_BOUNDS[gameId] || GAME_PHYSICS_BOUNDS['carreras'];
  const deltaMs = Math.max(currentTick.timestamp - lastTick.timestamp, 1);
  const deltaSec = deltaMs / 1000;

  // Tasa de incremento de puntaje
  const scoreDelta = (currentTick.score || 0) - (lastTick.score || 0);

  // Verificación 1: Puntuación negativa o decreciente anómala
  if (scoreDelta < 0) {
    return { valid: false, reason: 'SCORE_RETROGRADE_ANOMALY', severity: 'HIGH' };
  }

  // Verificación 2: Speedhack / Inyección de puntaje especializada
  if (bounds.isDiscreteScore) {
    // Para juegos discretos (obstáculos/tuberías paso a paso como flapy-flapy)
    const maxAllowedDelta = Math.max(
      bounds.maxScoreBurstDelta || 2,
      Math.ceil(deltaSec * (bounds.maxScoreRatePerSec || 1.25) * 1.4) + 1
    );
    if (scoreDelta > maxAllowedDelta) {
      return {
        valid: false,
        severity: scoreDelta > maxAllowedDelta + 3 ? 'HIGH' : 'MEDIUM',
        reason: 'SPEEDHACK_SCORE_OVERFLOW',
        details: { scoreDelta, maxAllowedDelta, deltaSec },
      };
    }

    // Invariante macro de partida para juegos discretos
    if (matchStartTime !== undefined && matchStartTime !== null) {
      const elapsedSec = Math.max((currentTick.timestamp - matchStartTime) / 1000, 0.1);
      const maxScoreEver = Math.ceil(elapsedSec * (bounds.maxScoreRatePerSec || 1.25) * 1.2) + 3;
      if ((currentTick.score || 0) > maxScoreEver) {
        return {
          valid: false,
          severity: 'HIGH',
          reason: 'SPEEDHACK_SCORE_OVERFLOW',
          details: { score: currentTick.score, maxAllowed: maxScoreEver, elapsedSec },
        };
      }
    }
  } else {
    // Para juegos de puntaje continuo (distancia métrica como carreras)
    const effectiveDeltaSec = Math.max(deltaSec, 0.08);
    const scoreRate = scoreDelta / effectiveDeltaSec;
    if (scoreRate > bounds.maxScoreDeltaPerSec * 1.6) {
      const isExtreme = scoreRate > bounds.maxScoreDeltaPerSec * 2.2 || scoreDelta > 600;
      return {
        valid: false,
        severity: isExtreme ? 'HIGH' : 'MEDIUM',
        reason: 'SPEEDHACK_SCORE_OVERFLOW',
        details: { scoreRate: Math.round(scoreRate), maxAllowed: bounds.maxScoreDeltaPerSec },
      };
    }

    // Invariante macro de partida para juegos continuos
    if (matchStartTime !== undefined && matchStartTime !== null) {
      const elapsedSec = Math.max((currentTick.timestamp - matchStartTime) / 1000, 0.1);
      const maxScoreEver = Math.ceil(elapsedSec * bounds.maxScoreDeltaPerSec * 1.25 + 200);
      if ((currentTick.score || 0) > maxScoreEver) {
        return {
          valid: false,
          severity: 'HIGH',
          reason: 'SPEEDHACK_SCORE_OVERFLOW',
          details: { score: currentTick.score, maxAllowed: maxScoreEver, elapsedSec },
        };
      }
    }
  }

  // Verificación 3: Teletransportación espacial y límites físicos según dimensiones del juego
  if (bounds.isDiscreteScore) {
    // En flapy-flapy el movimiento es vertical (eje Y)
    const yDelta = Math.abs((currentTick.y || 0) - (lastTick.y || 0));
    if (deltaMs < 250 && yDelta > bounds.maxPositionJump) {
      return {
        valid: false,
        severity: 'HIGH',
        reason: 'TELEPORT_POSITION_ANOMALY',
        details: { yDelta, maxAllowed: bounds.maxPositionJump },
      };
    }

    // Límites de techo y suelo (Anti-Ceiling Float y Anti-Underground Noclip)
    if (bounds.minY !== undefined && (currentTick.y || 0) < bounds.minY) {
      return {
        valid: false,
        severity: 'HIGH',
        reason: 'OUT_OF_BOUNDS_ANOMALY',
        details: { y: currentTick.y, minY: bounds.minY },
      };
    }
    if (bounds.maxY !== undefined && (currentTick.y || 0) > bounds.maxY) {
      return {
        valid: false,
        severity: 'HIGH',
        reason: 'OUT_OF_BOUNDS_ANOMALY',
        details: { y: currentTick.y, maxY: bounds.maxY },
      };
    }

    // Tolerancia horizontal (X es fija en el murciélago)
    if (bounds.expectedX !== undefined && bounds.maxDeltaX !== undefined) {
      const xDiff = Math.abs((currentTick.x || bounds.expectedX) - bounds.expectedX);
      if (xDiff > bounds.maxDeltaX) {
        return {
          valid: false,
          severity: 'HIGH',
          reason: 'TELEPORT_POSITION_ANOMALY',
          details: { x: currentTick.x, expectedX: bounds.expectedX },
        };
      }
    }
  } else {
    // Para juegos horizontales / 3D y shooters 2D (space)
    const xDelta = Math.abs((currentTick.x || 0) - (lastTick.x || 0));
    if (deltaMs < 250 && xDelta > bounds.maxPositionJump) {
      return {
        valid: false,
        severity: 'HIGH',
        reason: 'TELEPORT_POSITION_ANOMALY',
        details: { xDelta, maxAllowed: bounds.maxPositionJump },
      };
    }

    if (bounds.maxPlayerX && Math.abs(currentTick.x || 0) > bounds.maxPlayerX) {
      return {
        valid: false,
        severity: 'HIGH',
        reason: 'TELEPORT_POSITION_ANOMALY',
        details: { x: currentTick.x, maxAllowed: bounds.maxPlayerX },
      };
    }

    // Anti-Noclip vertical para juegos 2D con movimiento libre en Y (space)
    // carreras no define maxPlayerY, por lo que este bloque sólo se activa en space
    if (bounds.maxPlayerY !== undefined) {
      const yDelta = Math.abs((currentTick.y || 0) - (lastTick.y || 0));
      if (deltaMs < 250 && yDelta > bounds.maxPositionJump) {
        return {
          valid: false,
          severity: 'HIGH',
          reason: 'TELEPORT_POSITION_ANOMALY',
          details: { yDelta, maxAllowed: bounds.maxPositionJump },
        };
      }
      const cy = currentTick.y || 0;
      if (cy < -50 || cy > bounds.maxPlayerY) {
        return {
          valid: false,
          severity: 'HIGH',
          reason: 'OUT_OF_BOUNDS_ANOMALY',
          details: { y: cy, allowedRange: [-50, bounds.maxPlayerY] },
        };
      }
    }
  }

  return { valid: true };
}

/**
 * 3. Detector de Colusión / Cuentas Espejo (Anti-Sybil Farming)
 */
export function detectCollusion(entryA, entryB) {
  // Evitar que el mismo usuario juegue contra sí mismo
  if (entryA.player.id === entryB.player.id) {
    return { isCollusion: true, reason: 'SAME_ACCOUNT_MATCH' };
  }

  // Si ambas conexiones provienen de la misma IP local o idéntica en producción
  if (
    process.env.NODE_ENV === 'production' &&
    entryA.ip &&
    entryB.ip &&
    entryA.ip === entryB.ip &&
    entryA.ip !== '127.0.0.1' &&
    entryA.ip !== '::1'
  ) {
    return { isCollusion: true, reason: 'SAME_IP_COLLUSION' };
  }

  return { isCollusion: false };
}

/**
 * 4. Detector de Flood / Abuso de Paquetes WebSocket (Anti-DDoS / Macros)
 */
export function validatePacketRate(history = [], now = Date.now()) {
  const windowStart = now - 1000;
  const recentTicks = history.filter((t) => t > windowStart);
  recentTicks.push(now);

  if (recentTicks.length > 35) {
    return { valid: false, reason: 'PACKET_FLOOD_ANOMALY', count: recentTicks.length, history: recentTicks };
  }

  return { valid: true, history: recentTicks };
}
