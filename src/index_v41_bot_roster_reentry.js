import worker, { ChatRoom as V41WorldDateChatRoom } from "./index_v41_world_date_guard.js";
import { ChatRoom as V37LivelyChatRoom } from "./index_v37_lively_ambient.js";
import { BotRosterReentryAuthority } from "./bot_roster_reentry_v41.js";

export default worker;

export class ChatRoom extends V41WorldDateChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.botRosterReentryCoordinator = new BotRosterReentryAuthority(this);
  }

  botRosterReentryAuthority() {
    return this.botRosterReentryCoordinator;
  }

  v39ReentryRemaining(name, now = Date.now()) {
    return this.botRosterReentryCoordinator.reentryRemaining(name, now);
  }

  desiredRoster(now = Date.now()) {
    return this.botRosterReentryCoordinator.desiredRoster(
      now,
      () => V37LivelyChatRoom.prototype.desiredRoster.call(this, now)
    );
  }

  announceBotLeave(name, now = Date.now()) {
    return this.botRosterReentryCoordinator.announceBotLeave(
      name,
      now,
      () => V37LivelyChatRoom.prototype.announceBotLeave.call(this, name, now)
    );
  }

  announceBotEnter(name, now = Date.now()) {
    return this.botRosterReentryCoordinator.announceBotEnter(
      name,
      now,
      () => V37LivelyChatRoom.prototype.announceBotEnter.call(this, name, now)
    );
  }

  v41Snapshot(now = Date.now()) {
    const base = super.v41Snapshot(now);
    return {
      ...base,
      botRosterReentry: this.botRosterReentryCoordinator.snapshot(now),
      policy: {
        ...(base.policy || {}),
        botRosterReentryAuthority: true,
        botReentryCooldownMsPreserved: true,
        activeBotsRemainRosterEligibleDuringCooldown: true,
        legacyV39RosterOverridesBypassedInV41Production: true,
        legacyV39BotReentryCounterAndBroadcastPreserved: true
      }
    };
  }
}
