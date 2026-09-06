import worker, { ChatRoom as V41CoherenceChatRoom } from "./index_v41_coherence_repair.js";
import { ChatRoom as V37HumanOnlyChatRoom } from "./index_v37_human_only.js";
import { ChatRoom as V41PresenceCompatChatRoom } from "./index_v41_presence_compat.js";
import { WorldDateGuardAuthority } from "./world_date_guard_v41.js";
import { auditFutureGameProductHistory } from "./v39_public_world_gate.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await worker.fetch(request, env);
    const url = new URL(request.url);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v39: {
        ...(data.v39 || {}),
        futureGameProductBoundary: true,
        auditedPublicClaimsBlockedPreDisplay: true,
        periodConsoleLabelNormalization: true
      }
    });
  }
};

export class ChatRoom extends V41CoherenceChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v39WorldGateStats ||= {
      futureGameProductLinesBlocked: 0,
      auditedPublicClaimsBlocked: 0,
      consoleLabelsNormalized: 0
    };
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
      () => V37HumanOnlyChatRoom.prototype.lineViolation.call(this, text, now, context, speaker)
    );
  }

  noteViolation(violation, stage, speaker = "") {
    return this.worldDateGuardCoordinator.noteViolation(
      violation,
      stage,
      speaker,
      () => V37HumanOnlyChatRoom.prototype.noteViolation.call(this, violation, stage, speaker)
    );
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    return this.worldDateGuardCoordinator.say(
      from,
      text,
      kind,
      source,
      meta,
      (normalized) => V41PresenceCompatChatRoom.prototype.say.call(this, from, normalized, kind, source, meta)
    );
  }

  historicalAudit(includeAll = false) {
    return this.worldDateGuardCoordinator.historicalAudit(
      includeAll,
      () => V37HumanOnlyChatRoom.prototype.historicalAudit.call(this, includeAll)
    );
  }

  v39Snapshot(now = Date.now()) {
    const base = V41PresenceCompatChatRoom.prototype.v39Snapshot.call(this, now);
    return {
      ...base,
      worldGateStats: { ...this.v39WorldGateStats },
      futureGameProductAuditAllRetained: auditFutureGameProductHistory(this.history || [], 0),
      worldGatePolicy: {
        futureGameProductBoundary: true,
        goldenEyeN64NotBefore: "1997-08-25",
        tonyHawkProSkaterNotBefore: "1999-08-31",
        auditedPublicClaimsBlockedBeforeDisplay: true,
        independentAuditAndSurfaceGateShareEvidenceModel: true,
        ps1BackLabelNormalizedToPlayStation: true
      }
    };
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
