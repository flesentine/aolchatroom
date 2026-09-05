import {
  V39_BOT_REENTRY_COOLDOWN_MS,
  reentryCooldownRemaining
} from "./coherence_guard_v39.js";

export const V41_BOT_REENTRY_COOLDOWN_MS = V39_BOT_REENTRY_COOLDOWN_MS;

export class BotRosterReentryAuthority {
  constructor(room, { cooldownMs = V41_BOT_REENTRY_COOLDOWN_MS } = {}) {
    this.room = room;
    this.cooldownMs = cooldownMs;
  }

  reentryRemaining(name, now = Date.now()) {
    return reentryCooldownRemaining(
      this.room.history || [],
      name,
      now,
      this.cooldownMs,
      this.room.v39RecentBotLeaves?.get?.(name) || 0
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
      this.room.v39RecentBotLeaves?.set?.(name, now);
    }
    return result;
  }

  announceBotEnter(name, now = Date.now(), delegate) {
    const remainingMs = this.reentryRemaining(name, now);
    if (remainingMs > 0) {
      if (this.room.v39Stats) this.room.v39Stats.botReentryBlocks += 1;
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

  snapshot(now = Date.now()) {
    const names = [...new Set([
      ...(this.room.v39RecentBotLeaves?.keys?.() || []),
      ...(this.room.activeBotNames || [])
    ])];
    const recentlyDeparted = names
      .map((name) => ({ name, remainingMs: this.reentryRemaining(name, now) }))
      .filter((row) => row.remainingMs > 0);
    return {
      authority: "v41-bot-roster-reentry",
      cooldownMs: this.cooldownMs,
      recentlyDeparted,
      activeBotsRemainRosterEligibleDuringCooldown: true,
      legacyV39CounterAndBroadcastPreserved: true,
      legacyV39RosterOverridesBypassedInV41Production: true
    };
  }
}
