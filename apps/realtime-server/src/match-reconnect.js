/**
 * ==============================================================================
 * PLAY WIN REALTIME — GESTOR DE RECONEXIÓN Y VENTANA DE GRACIA (match-reconnect.js)
 * Gobernado por playwin-realtime-duels (Regla 2: 15s de gracia) y AGENTS.md
 * Tamaño estricto < 120 líneas.
 * ==============================================================================
 */

export class ReconnectManager {
  constructor(gracePeriodMs = 15000) {
    this.gracePeriodMs = gracePeriodMs;
    this.pending = new Map(); // playerId -> { timer, roomId, username, disconnectedAt, onForfeit }
    this.userToId = new Map(); // username.toLowerCase() -> playerId
  }

  schedule(playerId, username, roomId, onForfeit) {
    this.cancel(playerId);
    if (username) this.userToId.set(username.toLowerCase(), playerId);

    const timer = setTimeout(() => {
      this.pending.delete(playerId);
      if (username) this.userToId.delete(username.toLowerCase());
      try {
        onForfeit();
      } catch (err) {
        console.error('[ReconnectManager] Error en callback de forfeit:', err.message);
      }
    }, this.gracePeriodMs);

    this.pending.set(playerId, {
      timer,
      roomId,
      username,
      disconnectedAt: Date.now(),
    });
  }

  resolveId(identifier) {
    if (!identifier) return null;
    if (this.pending.has(identifier)) return identifier;
    if (typeof identifier === 'string' && this.userToId.has(identifier.toLowerCase())) {
      return this.userToId.get(identifier.toLowerCase());
    }
    return null;
  }

  cancel(identifier) {
    const playerId = this.resolveId(identifier);
    if (playerId && this.pending.has(playerId)) {
      const entry = this.pending.get(playerId);
      clearTimeout(entry.timer);
      this.pending.delete(playerId);
      if (entry.username) this.userToId.delete(entry.username.toLowerCase());
      return entry;
    }
    return null;
  }

  isPending(identifier) {
    return this.resolveId(identifier) !== null;
  }

  getPending(identifier) {
    const playerId = this.resolveId(identifier);
    return playerId ? (this.pending.get(playerId) || null) : null;
  }

  clear() {
    for (const [, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
    this.userToId.clear();
  }
}
