function normalizedNow(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function normalizedDepth(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export class ProviderReadinessTurnCache {
  constructor() {
    this.sequence = 0;
    this.active = null;
    this.stats = {
      turnsStarted: 0,
      turnsCompleted: 0,
      baseSnapshotsBuilt: 0,
      baseCacheHits: 0,
      derivedSnapshotsBuilt: 0,
      derivedCacheHits: 0,
      invalidations: 0,
      lastTurnBaseEntries: 0,
      lastTurnDerivedEntries: 0
    };
  }

  begin(now = Date.now()) {
    const token = ++this.sequence;
    this.active = {
      token,
      startedAt: normalizedNow(now),
      baseByNow: new Map(),
      derivedByNowDepth: new Map()
    };
    this.stats.turnsStarted += 1;
    return token;
  }

  end(token) {
    if (!this.active || this.active.token !== token) return false;
    this.stats.lastTurnBaseEntries = this.active.baseByNow.size;
    this.stats.lastTurnDerivedEntries = this.active.derivedByNowDepth.size;
    this.active = null;
    this.stats.turnsCompleted += 1;
    return true;
  }

  invalidate() {
    if (!this.active) return false;
    this.active.baseByNow.clear();
    this.active.derivedByNowDepth.clear();
    this.stats.invalidations += 1;
    return true;
  }

  base(now, build) {
    if (typeof build !== "function") throw new TypeError("ProviderReadinessTurnCache.base requires build()");
    const at = normalizedNow(now);
    if (this.active?.baseByNow.has(at)) {
      this.stats.baseCacheHits += 1;
      return this.active.baseByNow.get(at);
    }

    const value = build(at);
    this.stats.baseSnapshotsBuilt += 1;
    if (this.active) this.active.baseByNow.set(at, value);
    return value;
  }

  derived(now, depth, build) {
    if (typeof build !== "function") throw new TypeError("ProviderReadinessTurnCache.derived requires build()");
    const at = normalizedNow(now);
    const generationDepth = normalizedDepth(depth);
    const key = `${at}:${generationDepth}`;

    if (this.active?.derivedByNowDepth.has(key)) {
      this.stats.derivedCacheHits += 1;
      return this.active.derivedByNowDepth.get(key);
    }

    const value = build(at, generationDepth);
    this.stats.derivedSnapshotsBuilt += 1;
    if (this.active) this.active.derivedByNowDepth.set(key, value);
    return value;
  }

  snapshot() {
    return {
      ...this.stats,
      active: Boolean(this.active),
      activeStartedAt: this.active?.startedAt ?? null,
      activeBaseEntries: this.active?.baseByNow.size || 0,
      activeDerivedEntries: this.active?.derivedByNowDepth.size || 0
    };
  }
}
