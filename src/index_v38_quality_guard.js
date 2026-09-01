import v37Worker, { ChatRoom as V37LivelyChatRoom } from "./index_v37_lively_ambient.js";
import { simulatedDateTimeLabel } from "./social.js";
import {
  V38_TOPIC_COOLDOWN_MS,
  auditEraHistory,
  canonicalRoomTopic,
  filterFatiguedBackgroundLines,
  hardEraViolation,
  roomTopicFatigue,
  topicFatiguePromptNote
} from "./quality_guard_v38.js";

const PASS = "quality-guard-v38";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/v38-status") {
      const room = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(room);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v38-status"));
    }

    const response = await v37Worker.fetch(request, env);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;

    return Response.json({
      ...data,
      pass: PASS,
      deployVersion: 38,
      endpoints: { ...(data.endpoints || {}), v38: "/api/v38-status" },
      v38: {
        qualityGuard: true,
        hardEraBoundaryOnGeneratedLines: true,
        post1996ConsoleBoundary: true,
        roomWideTopicFatigue: true,
        backgroundOnlyTopicCooling: true,
        humanDirectedConversationExemptFromTopicCooling: true,
        diagnostics: data?.conversationDirectorV37?.qualityGuardV38 || null
      }
    });
  }
};

export class ChatRoom extends V37LivelyChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v38TopicCooling = new Map();
    this.v38QualityStats = {
      eraLinesBlocked: 0,
      topicFatigueActivations: 0,
      topicFatigueSceneCloses: 0,
      fatiguedBackgroundLinesBlocked: 0,
      backgroundPlansFiltered: 0
    };
  }

  lineViolation(text, now = Date.now(), context = this.recentContextText?.() || "", speaker = "") {
    const era = hardEraViolation(text, now);
    if (era) return era;
    return super.lineViolation(text, now, context, speaker);
  }

  noteViolation(violation, stage, speaker = "") {
    if (violation?.kind === "future-era-technology") {
      this.v38QualityStats.eraLinesBlocked += 1;
    }
    return super.noteViolation(violation, stage, speaker);
  }

  pruneV38TopicCooling(now = Date.now()) {
    for (const [topic, until] of this.v38TopicCooling.entries()) {
      if (Number(until || 0) <= now) this.v38TopicCooling.delete(topic);
    }
  }

  activeV38TopicCooling(now = Date.now()) {
    this.pruneV38TopicCooling(now);
    return [...this.v38TopicCooling.entries()]
      .filter(([, until]) => Number(until || 0) > now)
      .map(([topic, until]) => ({ topic, until, remainingMs: Math.max(0, Number(until || 0) - now) }));
  }

  detectRoomTopicFatigue(now = Date.now()) {
    return roomTopicFatigue(this.history || [], now);
  }

  applyRoomTopicFatigue(now = Date.now()) {
    const fatigue = this.detectRoomTopicFatigue(now);
    this.pruneV38TopicCooling(now);

    for (const row of fatigue.topics || []) {
      const previous = Number(this.v38TopicCooling.get(row.topic) || 0);
      if (previous <= now) this.v38QualityStats.topicFatigueActivations += 1;
      const until = now + V38_TOPIC_COOLDOWN_MS;
      this.v38TopicCooling.set(row.topic, Math.max(until, previous));
      if (this.topicFatigueUntil instanceof Map) {
        this.topicFatigueUntil.set(row.topic, Math.max(until, Number(this.topicFatigueUntil.get(row.topic) || 0)));
      }
    }

    const coolingRows = this.activeV38TopicCooling(now);
    if (!coolingRows.length) return fatigue;

    const authority = this.sceneLifecycleAuthority?.() || null;
    if (authority?.closeTopicFatigueScenes) {
      const closed = authority.closeTopicFatigueScenes(coolingRows, now);
      for (const row of closed) {
        this.v38QualityStats.topicFatigueSceneCloses += 1;
        this.broadcast?.({
          type: "scene_plan",
          action: "v38-room-topic-fatigue-close",
          sceneId: row.sceneId,
          topic: row.topic,
          turns: row.turns,
          at: now
        });
      }
      return fatigue;
    }

    const cooling = new Set(coolingRows.map((row) => row.topic));
    if (typeof this.openScenes !== "function") return fatigue;
    const humans = new Set(this.humanNames?.() || []);
    for (const scene of this.openScenes(now) || []) {
      if (this.sceneIsClosed?.(scene)) continue;
      const topic = canonicalRoomTopic({ topic: scene?.topic, text: scene?.lastText || "" });
      if (!topic || !cooling.has(topic)) continue;
      if (scene?.openQuestion?.target && humans.has(scene.openQuestion.target)) continue;
      if (this.recentHumanInScene?.(scene.id, now)) continue;

      scene.status = "closed";
      scene.closedAt = now;
      scene.closeReason = "v38 room-wide topic fatigue";
      if (this.sceneStats) this.sceneStats.closed = Number(this.sceneStats.closed || 0) + 1;
      this.v38QualityStats.topicFatigueSceneCloses += 1;
      this.broadcast?.({
        type: "scene_plan",
        action: "v38-room-topic-fatigue-close",
        sceneId: scene.id,
        topic,
        turns: Number(scene.turns || 0),
        at: now
      });
    }
    return fatigue;
  }

  livelyAmbientPrompt(now = Date.now()) {
    const fatigue = this.applyRoomTopicFatigue(now);
    const cooling = this.activeV38TopicCooling(now);
    const base = super.livelyAmbientPrompt(now);
    const note = topicFatiguePromptNote({
      ...fatigue,
      topics: cooling.map((row) => ({ topic: row.topic }))
    });
    return note ? `${base}\n\n${note}` : base;
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    if (reason !== "background") return super.queueScenePlan(lines, reason, trigger, front);

    const now = Date.now();
    this.applyRoomTopicFatigue(now);
    const cooling = this.activeV38TopicCooling(now).map((row) => row.topic);
    if (!cooling.length) return super.queueScenePlan(lines, reason, trigger, front);

    const filtered = filterFatiguedBackgroundLines(lines, cooling);
    if (filtered.blocked.length) {
      this.v38QualityStats.fatiguedBackgroundLinesBlocked += filtered.blocked.length;
      this.v38QualityStats.backgroundPlansFiltered += 1;
      this.broadcast?.({
        type: "scene_plan",
        action: "v38-room-topic-lines-blocked",
        topics: [...new Set(filtered.blocked.map((row) => row._v38FatiguedTopic).filter(Boolean))],
        blocked: filtered.blocked.length,
        kept: filtered.kept.length,
        at: now
      });
    }
    return super.queueScenePlan(filtered.kept, reason, trigger, front);
  }

  historicalAudit(includeAll = false) {
    const base = super.historicalAudit(includeAll);
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || Date.now());
    const era = auditEraHistory(this.history || [], floor);
    return {
      ...base,
      violations: Number(base?.violations || 0) + era.violations,
      blockers: Number(base?.blockers || 0) + era.blockers,
      examples: [...(base?.examples || []), ...(era.examples || [])].slice(-8),
      v38EraViolations: era.violations,
      v38EraExamples: era.examples
    };
  }

  v38Snapshot(now = Date.now()) {
    const fatigue = this.detectRoomTopicFatigue(now);
    const eraAudit = auditEraHistory(this.history || [], 0);
    return {
      pass: PASS,
      simulatedDateTime: simulatedDateTimeLabel(),
      stats: { ...this.v38QualityStats },
      activeTopicCooling: this.activeV38TopicCooling(now),
      detectedTopicFatigue: fatigue,
      eraAuditAllRetained: eraAudit,
      policy: {
        eraBoundaryRunsAtGeneratedLineValidation: true,
        backgroundTopicCoolingOnly: true,
        directHumanPlansNeverFilteredForTopicFatigue: true,
        cooldownMs: V38_TOPIC_COOLDOWN_MS
      }
    };
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    return { ...base, qualityGuardV38: this.v38Snapshot(Date.now()) };
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/v38-status") {
      return Response.json({ ok: true, pass: PASS, diagnostics: this.v38Snapshot(Date.now()) });
    }
    return super.fetch(request);
  }

  debugState(name) {
    return { ...super.debugState(name), pass: PASS, v38: this.v38Snapshot(Date.now()) };
  }
}
