import v38Worker, { ChatRoom as V38ChatRoom } from "./index_v38_quality_guard.js";
import { simulatedDateTimeLabel } from "./social.js";
import {
  V39_BOT_REENTRY_COOLDOWN_MS,
  auditFutureEventHistory,
  filterSelfDialogueLines,
  futureEventViolation,
  inferClarificationTarget,
  reentryCooldownRemaining,
  withCoherenceConstraint
} from "./coherence_guard_v39.js";

const PASS = "conversation-coherence-v39";
const V39_HUMAN_RECONNECT_GRACE_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanNameFromAttachment(ws) {
  try {
    const attachment = ws?.deserializeAttachment?.() || {};
    return String(attachment.name || "Guest").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16) || "Guest";
  } catch {
    return "Guest";
  }
}

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

    const response = await v38Worker.fetch(request, env);
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

export class ChatRoom extends V38ChatRoom {
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

  lineViolation(text, now = Date.now(), context = this.recentContextText?.() || "", speaker = "") {
    const event = futureEventViolation(text, now);
    if (event) return event;
    return super.lineViolation(text, now, context, speaker);
  }

  noteViolation(violation, stage, speaker = "") {
    if (violation?.kind === "future-era-event") this.v39Stats.futureEventLinesBlocked += 1;
    return super.noteViolation(violation, stage, speaker);
  }

  explicitV39BotMention(text = "") {
    const lower = String(text || "").toLowerCase();
    return (this.activeBotNames || []).find((name) => lower.includes(String(name || "").toLowerCase())) || "";
  }

  resolveDirectTarget(text, sender = "") {
    const explicit = this.explicitV39BotMention(text);
    const baseline = super.resolveDirectTarget(text, sender);
    if (explicit) return baseline;

    const repair = inferClarificationTarget(this.history || [], text, sender, this.activeBotNames || [], Date.now());
    if (!repair?.name) return baseline;

    if (repair.messageId && this.pendingHumanReplyTo instanceof Map) {
      this.pendingHumanReplyTo.set(sender, repair.messageId);
    }
    this.setFocus?.(sender, repair.name, Date.now(), "v39-clarification-repair");
    this.v39Stats.clarificationTargetRepairs += 1;
    this.v39LastTargetRepair = {
      at: Date.now(),
      human: sender,
      text: String(text || "").slice(0, 220),
      baseline,
      repairedTarget: repair.name,
      replyTo: repair.messageId || "",
      anchor: repair.text,
      score: repair.score,
      reason: repair.reason
    };
    return repair.name;
  }

  async voiceBrainPlan(plan, active, human = null) {
    if (!human) return super.voiceBrainPlan(plan, active, human);
    const enriched = withCoherenceConstraint(plan, this.history || [], human);
    if (enriched?.constraint?.text) {
      this.v39Stats.coherenceVoiceLocks += 1;
      this.v39LastCoherenceLock = {
        at: Date.now(),
        human: human?.from || enriched.constraint.trigger?.from || "",
        trigger: String(enriched.constraint.trigger?.text || human?.text || "").slice(0, 220),
        anchorFrom: enriched.constraint.anchor?.from || "",
        anchorText: String(enriched.constraint.anchor?.text || "").slice(0, 220),
        mode: enriched.constraint.mode || "direct"
      };
    }
    return super.voiceBrainPlan(enriched.plan, active, human);
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

  v39ReentryRemaining(name, now = Date.now()) {
    return reentryCooldownRemaining(
      this.history || [],
      name,
      now,
      V39_BOT_REENTRY_COOLDOWN_MS,
      this.v39RecentBotLeaves.get(name) || 0
    );
  }

  desiredRoster(now = Date.now()) {
    const desired = super.desiredRoster(now) || [];
    const active = new Set(this.activeBotNames || []);
    return desired.filter((name) => active.has(name) || this.v39ReentryRemaining(name, now) <= 0);
  }

  announceBotLeave(name, now = Date.now()) {
    const wasActive = (this.activeBotNames || []).includes(name);
    const result = super.announceBotLeave(name, now);
    if (wasActive && !(this.activeBotNames || []).includes(name)) this.v39RecentBotLeaves.set(name, now);
    return result;
  }

  announceBotEnter(name, now = Date.now()) {
    const remainingMs = this.v39ReentryRemaining(name, now);
    if (remainingMs > 0) {
      this.v39Stats.botReentryBlocks += 1;
      this.broadcast?.({
        type: "presence_guard",
        action: "v39-bot-reentry-blocked",
        name,
        remainingMs,
        at: now
      });
      return false;
    }
    return super.announceBotEnter(name, now);
  }

  system(text, ...args) {
    const match = /^(.+?) has entered the room\.$/.exec(String(text || ""));
    if (match) {
      const name = String(match[1] || "");
      const pending = this.v39PendingHumanDisconnects.get(name);
      if (pending && Date.now() - Number(pending.at || 0) <= V39_HUMAN_RECONNECT_GRACE_MS) {
        this.v39PendingHumanDisconnects.delete(name);
        this.v39Stats.transientHumanReconnects += 1;
        this.broadcast?.({
          type: "connection_guard",
          action: "v39-transient-human-reconnect",
          name,
          closeCode: pending.code,
          closeReason: pending.reason,
          reconnectAfterMs: Date.now() - pending.at,
          at: Date.now()
        });
        return false;
      }
    }
    return super.system(text, ...args);
  }

  webSocketClose(ws, code = 1005, reason = "", wasClean = false) {
    const name = humanNameFromAttachment(ws);
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const pending = {
      token,
      at: Date.now(),
      code: Number(code || 0),
      reason: String(reason || "").slice(0, 160),
      wasClean: Boolean(wasClean)
    };
    this.v39PendingHumanDisconnects.set(name, pending);
    this.v39Stats.humanDisconnectsDeferred += 1;

    const settle = async () => {
      await sleep(V39_HUMAN_RECONNECT_GRACE_MS);
      const current = this.v39PendingHumanDisconnects.get(name);
      if (!current || current.token !== token) return;

      const stillConnected = (this.humanNames?.() || []).includes(name);
      this.v39PendingHumanDisconnects.delete(name);
      if (stillConnected) {
        this.v39Stats.transientHumanReconnects += 1;
        return;
      }

      this.v39Stats.humanDisconnectsCommitted += 1;
      return super.webSocketClose(ws, code, reason, wasClean);
    };

    const task = settle();
    if (typeof this.ctx?.waitUntil === "function") this.ctx.waitUntil(task);
    else task.catch(() => {});
  }

  historicalAudit(includeAll = false) {
    const base = super.historicalAudit(includeAll);
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || Date.now());
    const futureEvents = auditFutureEventHistory(this.history || [], floor);
    return {
      ...base,
      violations: Number(base?.violations || 0) + futureEvents.violations,
      blockers: Number(base?.blockers || 0) + futureEvents.blockers,
      examples: [...(base?.examples || []), ...(futureEvents.examples || [])].slice(-8),
      v39FutureEventViolations: futureEvents.violations,
      v39FutureEventExamples: futureEvents.examples
    };
  }

  v39Snapshot(now = Date.now()) {
    const recentlyDeparted = [...new Set([
      ...this.v39RecentBotLeaves.keys(),
      ...(this.activeBotNames || [])
    ])]
      .map((name) => ({ name, remainingMs: this.v39ReentryRemaining(name, now) }))
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
