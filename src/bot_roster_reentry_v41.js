import {
  V39_BOT_REENTRY_COOLDOWN_MS,
  reentryCooldownRemaining
} from "./coherence_guard_v39.js";

export const V41_BOT_REENTRY_COOLDOWN_MS = V39_BOT_REENTRY_COOLDOWN_MS;

export class BotRosterReentryAuthority {
  constructor(room, { cooldownMs = V41_BOT_REENTRY_COOLDOWN_MS } = {}) {
    this.room = room;
    this.cooldownMs = cooldownMs;
    this.recentBotLeaves = new Map();
    this.rosterStats = {
      botReentryBlocks: 0
    };
  }

  reentryRemaining(name, now = Date.now()) {
    return reentryCooldownRemaining(
      this.room.history || [],
      name,
      now,
      this.cooldownMs,
      this.recentBotLeaves.get(name) || 0
    );
  }

  desiredRoster(now = Date.now(), delegate) {
    const desired = delegate() || [];
    const active = new Set(this.room.activeBotNames || []);
    return desired.filter((name) => active.has(name) || this.reentryRemaining(name, now) <= 0);
  }

  announceBotLeave(name, now = Date.now(), delegate) {
    const wasActive = (this.room.activeBotNames || []).includes(name);
    const result = delegate();
    if (wasActive && !(this.room.activeBotNames || []).includes(name)) {
      this.recentBotLeaves.set(name, now);
    }
    return result;
  }

  announceBotEnter(name, now = Date.now(), delegate) {
    const remainingMs = this.reentryRemaining(name, now);
    if (remainingMs > 0) {
      this.rosterStats.botReentryBlocks += 1;
      this.room.broadcast?.({
        type: "presence_guard",
        action: "v39-bot-reentry-blocked",
        name,
        remainingMs,
        at: now
      });
      return false;
    }
    return delegate();
  }

  legacyV39Stats() {
    return { ...this.rosterStats };
  }

  legacyRecentlyDeparted(now = Date.now()) {
    const names = [...new Set([
      ...this.recentBotLeaves.keys(),
      ...(this.room.activeBotNames || [])
    ])];
    return names
      .map((name) => ({ name, remainingMs: this.reentryRemaining(name, now) }))
      .filter((row) => row.remainingMs > 0);
  }

  snapshot(now = Date.now()) {
    const recentlyDeparted = this.legacyRecentlyDeparted(now);
    return {
      authority: "v41-bot-roster-reentry",
      cooldownMs: this.cooldownMs,
      recentlyDeparted,
      rosterStats: this.legacyV39Stats(),
      stateOwnedByAuthority: true,
      activeBotsRemainRosterEligibleDuringCooldown: true,
      legacyV39CounterAndBroadcastPreserved: true,
      legacyV39RosterOverridesBypassedInV41Production: true
    };
  }
}
