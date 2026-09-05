import worker, { ChatRoom as V41CoherenceChatRoom } from "./index_v41_coherence_repair.js";
import { ChatRoom as V37LivelyChatRoom } from "./index_v37_lively_ambient.js";
import { ChatRoom as PresenceFixedChatRoom } from "./index_v39_presence_fix.js";
import { WorldDateGuardAuthority } from "./world_date_guard_v41.js";

export default worker;

export class ChatRoom extends V41CoherenceChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.worldDateGuardCoordinator = new WorldDateGuardAuthority(this);
  }

  worldDateGuardAuthority() {
    return this.worldDateGuardCoordinator;
  }

  lineViolation(text, now = Date.now(), context = this.recentContextText?.() || "", speaker = "") {
    return this.worldDateGuardCoordinator.lineViolation(
      text,
      now,
      context,
      speaker,
      () => V37LivelyChatRoom.prototype.lineViolation.call(this, text, now, context, speaker)
    );
  }

  noteViolation(violation, stage, speaker = "") {
    return this.worldDateGuardCoordinator.noteViolation(
      violation,
      stage,
      speaker,
      () => V37LivelyChatRoom.prototype.noteViolation.call(this, violation, stage, speaker)
    );
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    return this.worldDateGuardCoordinator.say(
      from,
      text,
      kind,
      source,
      meta,
      (normalized) => PresenceFixedChatRoom.prototype.say.call(this, from, normalized, kind, source, meta)
    );
  }

  historicalAudit(includeAll = false) {
    return this.worldDateGuardCoordinator.historicalAudit(
      includeAll,
      () => V37LivelyChatRoom.prototype.historicalAudit.call(this, includeAll)
    );
  }

  v41Snapshot(now = Date.now()) {
    const base = super.v41Snapshot(now);
    return {
      ...base,
      worldDateGuard: this.worldDateGuardCoordinator.snapshot(),
      policy: {
        ...(base.policy || {}),
        worldDateGuardAuthority: true,
        layeredWorldDateOrderPreserved: true,
        eraConsoleNormalizationOwnedByV41: true,
        historicalWorldDateAuditOwnedByV41: true,
        legacyV38V39WorldDateOverridesBypassedInV41Production: true,
        legacyV38V39WorldDateCountersPreserved: true
      }
    };
  }
}
