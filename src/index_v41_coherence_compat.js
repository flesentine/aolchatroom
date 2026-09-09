// Phase 3F.3 production-only compatibility layer.
// Frozen index_v39_coherence.js remains unchanged for the frozen v39/v40 path.
// V41 production preserves the still-live v39 compatibility surface here while
// Phase 3B/3C/3D/3E remain authoritative for extracted reconnect, repair,
// world/date, and roster behavior.
import qualityWorker, { ChatRoom as V41QualityCompatChatRoom } from "./index_v41_quality_compat.js";
import { simulatedDateTimeLabel } from "./social.js";
import {
  V39_BOT_REENTRY_COOLDOWN_MS,
  auditFutureEventHistory
} from "./coherence_guard_v39.js";
import { V39BackgroundCompatibilityAuthority } from "./v39_background_compatibility_v41.js";

const PASS = "conversation-coherence-v39";
const V39_HUMAN_RECONNECT_GRACE_MS = 5000;
const EMPTY_V39_RECONNECT_STATS = Object.freeze({
  humanDisconnectsDeferred: 0,
  transientHumanReconnects: 0,
  humanDisconnectsCommitted: 0
});
const EMPTY_V39_REPAIR_STATS = Object.freeze({
  clarificationTargetRepairs: 0,
  coherenceVoiceLocks: 0
});
const EMPTY_V39_WORLD_DATE_STATS = Object.freeze({
  futureEventLinesBlocked: 0
});
const EMPTY_V39_ROSTER_STATS = Object.freeze({
  botReentryBlocks: 0
});

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

async function roomV39Diagnostics(env, room = "town-square") {
  try {
    const id = env.CHAT_ROOMS.idFromName(room);
    const response = await env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v39-status"));
    const data = await json(response);
    return data?.diagnostics || null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = url.searchParams.get("room") || "town-square";
    if (url.pathname === "/api/v39-status") {
      const id = env.CHAT_ROOMS.idFromName(room);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v39-status"));
    }

    const response = await qualityWorker.fetch(request, env);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;

    const diagnostics = await roomV39Diagnostics(env, room);
    return Response.json({
      ...data,
      pass: PASS,
      deployVersion: 39,
      endpoints: { ...(data.endpoints || {}), v39: "/api/v39-status" },
      v38: {
        ...(data.v38 || {}),
        diagnostics: data?.v38?.diagnostics || diagnostics?.inheritedV38 || null
      },
      v39: {
        conversationCoherence: true,
        clarificationTargetRepair: true,
        exactReplyVoiceAnchor: true,
        contradictionAcknowledgement: true,
        futureEventBoundary: true,
        ambientSelfDialogueSuppression: true,
        botReentryCooldown: true,
        botReentryCooldownMs: V39_BOT_REENTRY_COOLDOWN_MS,
        transientHumanReconnectGrace: true,
        humanReconnectGraceMs: V39_HUMAN_RECONNECT_GRACE_MS,
        diagnostics
      }
    });
  }
};

export class ChatRoom extends V41QualityCompatChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v39BackgroundCompatibilityCoordinator = new V39BackgroundCompatibilityAuthority(this);
  }

  v39BackgroundCompatibilityAuthority() {
    return this.v39BackgroundCompatibilityCoordinator;
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    return this.v39BackgroundCompatibilityCoordinator.queueScenePlan(
      lines,
      reason,
      trigger,
      front,
      (nextLines, nextReason, nextTrigger, nextFront) =>
        super.queueScenePlan(nextLines, nextReason, nextTrigger, nextFront)
    );
  }

  v39Snapshot(now = Date.now()) {
    const backgroundAuthority = this.v39BackgroundCompatibilityAuthority?.() || null;
    const backgroundStats = backgroundAuthority?.legacyV39Stats?.() || {
      selfDialogueLinesBlocked: 0,
      backgroundPlansFiltered: 0
    };
    const reconnectAuthority = this.humanReconnectLifecycleAuthority?.() || null;
    const reconnectStats = reconnectAuthority?.legacyV39Stats?.() || EMPTY_V39_RECONNECT_STATS;
    const pendingHumanDisconnects = reconnectAuthority?.legacyPendingHumanDisconnects?.(now) || [];
    const repairAuthority = this.coherenceRepairAuthority?.() || null;
    const repairStats = repairAuthority?.legacyV39Stats?.() || EMPTY_V39_REPAIR_STATS;
    const worldDateAuthority = this.worldDateGuardAuthority?.() || null;
    const worldDateStats = worldDateAuthority?.legacyV39Stats?.() || EMPTY_V39_WORLD_DATE_STATS;
    const rosterAuthority = this.botRosterReentryAuthority?.() || null;
    const rosterStats = rosterAuthority?.legacyV39Stats?.() || EMPTY_V39_ROSTER_STATS;
    const recentlyDeparted = rosterAuthority?.legacyRecentlyDeparted?.(now) || [];
    return {
      pass: PASS,
      simulatedDateTime: simulatedDateTimeLabel(),
      stats: { ...backgroundStats, ...repairStats, ...worldDateStats, ...rosterStats, ...reconnectStats },
      lastTargetRepair: repairAuthority?.legacyLastTargetRepair?.() || null,
      lastCoherenceLock: repairAuthority?.legacyLastCoherenceLock?.() || null,
      recentlyDeparted,
      pendingHumanDisconnects,
      inheritedV38: super.v38Snapshot(now),
      futureEventAuditAllRetained: auditFutureEventHistory(this.history || [], 0),
      policy: {
        directHumanVoiceAnchoredToExactReply: true,
        contradictionRepairPreferredOverRationalization: true,
        explicitNamedTargetsNeverOverriddenByRepair: true,
        selfDialogueFilteringBackgroundOnly: true,
        reentryCooldownMs: V39_BOT_REENTRY_COOLDOWN_MS,
        transientHumanReconnectGrace: true,
        humanReconnectGraceMs: V39_HUMAN_RECONNECT_GRACE_MS
      }
    };
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/v39-status") {
      return Response.json({ ok: true, pass: PASS, diagnostics: this.v39Snapshot(Date.now()) });
    }
    return super.fetch(request);
  }

  debugState(name) {
    return { ...super.debugState(name), pass: PASS, v39: this.v39Snapshot(Date.now()) };
  }
}
