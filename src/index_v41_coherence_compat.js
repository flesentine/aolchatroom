// Phase 3F.3 production-only compatibility layer.
// Frozen index_v39_coherence.js remains unchanged for the frozen v39/v40 path.
// V41 production preserves the still-live v39 compatibility surface here while
// Phase 3B/3C/3D/3E remain authoritative for extracted reconnect, repair,
// world/date, and roster behavior.
import qualityWorker, { ChatRoom as V41QualityCompatChatRoom } from "./index_v41_quality_compat.js";
import { simulatedDateTimeLabel } from "./social.js";
import {
  V39_BOT_REENTRY_COOLDOWN_MS,
  auditFutureEventHistory,
  filterSelfDialogueLines
} from "./coherence_guard_v39.js";

const PASS = "conversation-coherence-v39";
const V39_HUMAN_RECONNECT_GRACE_MS = 5000;

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
    this.v39RecentBotLeaves = new Map();
    this.v39PendingHumanDisconnects = new Map();
    this.v39LastTargetRepair = null;
    this.v39LastCoherenceLock = null;
    this.v39Stats = {
      clarificationTargetRepairs: 0,
      coherenceVoiceLocks: 0,
      futureEventLinesBlocked: 0,
      selfDialogueLinesBlocked: 0,
      backgroundPlansFiltered: 0,
      botReentryBlocks: 0,
      humanDisconnectsDeferred: 0,
      transientHumanReconnects: 0,
      humanDisconnectsCommitted: 0
    };
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    if (reason !== "background") return super.queueScenePlan(lines, reason, trigger, front);
    const filtered = filterSelfDialogueLines(lines || []);
    if (filtered.blocked.length) {
      this.v39Stats.selfDialogueLinesBlocked += filtered.blocked.length;
      this.v39Stats.backgroundPlansFiltered += 1;
      this.broadcast?.({
        type: "scene_plan",
        action: "v39-self-dialogue-lines-blocked",
        blocked: filtered.blocked.length,
        kept: filtered.kept.length,
        reasons: [...new Set(filtered.blocked.map((row) => row._v39SelfDialogueReason).filter(Boolean))],
        at: Date.now()
      });
    }
    return super.queueScenePlan(filtered.kept, reason, trigger, front);
  }

  v39Snapshot(now = Date.now()) {
    const recentlyDeparted = [...new Set([
      ...this.v39RecentBotLeaves.keys(),
      ...(this.activeBotNames || [])
    ])]
      .map((name) => ({
        name,
        remainingMs: typeof this.v39ReentryRemaining === "function"
          ? this.v39ReentryRemaining(name, now)
          : 0
      }))
      .filter((row) => row.remainingMs > 0);
    const pendingHumanDisconnects = [...this.v39PendingHumanDisconnects.entries()]
      .map(([name, row]) => ({
        name,
        ageMs: Math.max(0, now - Number(row.at || now)),
        graceRemainingMs: Math.max(0, V39_HUMAN_RECONNECT_GRACE_MS - (now - Number(row.at || now))),
        code: row.code,
        reason: row.reason,
        wasClean: row.wasClean
      }));
    return {
      pass: PASS,
      simulatedDateTime: simulatedDateTimeLabel(),
      stats: { ...this.v39Stats },
      lastTargetRepair: this.v39LastTargetRepair,
      lastCoherenceLock: this.v39LastCoherenceLock,
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
