import baseWorker, { ChatRoom as GeminiFirstChatRoom } from "./index_v19_3.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const PLAN_MIN_TURNS = 4;
const PLAN_MAX_TURNS = 7;
const HUMAN_REPLAN_MIN_GAP_MS = 2100;
const PLAN_STALE_MS = 3 * 60 * 1000;

function lineKey(speaker, text) {
  return `${String(speaker || "")}\n${String(text || "")}`;
}

function short(value, max = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        room: "Town Square",
        simulatedDate: simulatedDateLabel(),
        simulatedDateTime: simulatedDateTimeLabel(),
        pass: "scene-planner-replan-v20",
        providerPriority: ["gemini", "groq", "workers-ai"],
        scenePlanner: {
          minTurns: PLAN_MIN_TURNS,
          maxTurns: PLAN_MAX_TURNS,
          humanInterruptReplans: true
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }
    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends GeminiFirstChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.scenePlanSequence = 0;
    this.scenePlanRevision = 0;
    this.currentScenePlan = null;
    this.lastScenePlan = null;
    this.planMetaByLine = new Map();
    this.scenePlannerStats = {
      plansCreated: 0,
      backgroundPlans: 0,
      humanReplans: 0,
      humanInterrupts: 0,
      plannedTurns: 0,
      emittedTurns: 0,
      rejectedTurns: 0,
      discardedTurns: 0,
      completedPlans: 0,
      staleTurnsBlocked: 0,
      emptyPlans: 0
    };
  }

  nextScenePlanId() {
    this.scenePlanSequence = (this.scenePlanSequence + 1) % 1679616;
    return `p${Date.now().toString(36)}${this.scenePlanSequence.toString(36)}`;
  }

  registerPlanMeta(item, meta) {
    const key = lineKey(item.speaker, item.text);
    const rows = this.planMetaByLine.get(key) || [];
    rows.push(meta);
    this.planMetaByLine.set(key, rows.slice(-8));
  }

  claimPlanMeta(speaker, text) {
    const key = lineKey(speaker, text);
    const rows = this.planMetaByLine.get(key) || [];
    if (!rows.length) return null;
    const meta = rows.shift();
    if (rows.length) this.planMetaByLine.set(key, rows);
    else this.planMetaByLine.delete(key);
    return meta;
  }

  removePlanMeta(planId) {
    if (!planId) return;
    for (const [key, rows] of this.planMetaByLine.entries()) {
      const kept = rows.filter((row) => row.planId !== planId);
      if (kept.length) this.planMetaByLine.set(key, kept);
      else this.planMetaByLine.delete(key);
    }
  }

  queuedPlanTurnCount(planId = "") {
    return (this.aiQueue || []).filter((item) => item?._scenePlanId && (!planId || item._scenePlanId === planId)).length;
  }

  finishPlan(plan, status, reason = "") {
    if (!plan) return;
    plan.status = status;
    plan.finishedAt = Date.now();
    if (reason) plan.finishReason = reason;
    this.lastScenePlan = { ...plan };
    if (this.currentScenePlan?.id === plan.id) this.currentScenePlan = null;
    if (status === "completed") this.scenePlannerStats.completedPlans += 1;
    this.broadcast({
      type: "scene_plan",
      action: status,
      planId: plan.id,
      revision: plan.revision,
      reason: plan.reason,
      finishReason: reason || "",
      emittedTurns: plan.emittedTurns || 0,
      discardedTurns: plan.discardedTurns || 0,
      at: Date.now()
    });
  }

  discardPlannedFuture(reason = "human-interrupt") {
    const plan = this.currentScenePlan;
    const before = (this.aiQueue || []).length;
    const removed = [];
    this.aiQueue = (this.aiQueue || []).filter((item) => {
      if (!item?._scenePlanId) return true;
      removed.push(item);
      return false;
    });

    if (!removed.length) return 0;
    const removedIds = new Set(removed.map((item) => item._scenePlanId).filter(Boolean));
    for (const id of removedIds) this.removePlanMeta(id);
    this.scenePlannerStats.discardedTurns += removed.length;

    if (plan) {
      plan.discardedTurns = Number(plan.discardedTurns || 0) + removed.filter((item) => item._scenePlanId === plan.id).length;
      this.finishPlan(plan, "interrupted", reason);
    }

    this.broadcast({
      type: "scene_plan",
      action: "discarded-future",
      reason,
      count: before - this.aiQueue.length,
      at: Date.now()
    });
    return removed.length;
  }

  humanHistoryRow(human) {
    const now = Date.now();
    return [...(this.history || [])].reverse().find((row) =>
      row?.kind === "human"
      && row.from === human?.from
      && row.text === human?.text
      && now - Number(row.at || 0) <= 12000
    ) || null;
  }

  plannerContext() {
    const social = typeof this.socialContextPrompt === "function" ? this.socialContextPrompt() : "";
    const transcript = this.recentTranscript(20) || "The room has been quiet.";
    return `${social}\n\nRECENT ROOM TRANSCRIPT:\n${transcript}`;
  }

  async generateBackgroundPlan() {
    this.ensureTalkers(Date.now());
    const active = this.activeCharacters().slice(0, 8);
    if (!active.length) return [];

    const prompt = `You are the scene planner for a crowded 1996 AOL Town Square room.\n\n${this.plannerContext()}\n\nFIXED PROFILES FOR THE ONLY BOTS ALLOWED TO SPEAK:\n${this.promptProfiles(active, 8)}\n\nPlan the next ${PLAN_MIN_TURNS}-${PLAN_MAX_TURNS} sends as ONE short conversational arc, with at most one small secondary overlap. Continue a live conversation when one has momentum. Each turn must make sense because of something already said or because of an earlier turn in this plan. Do not create a string of unrelated topic starters. Do not have everybody speak. Silence between these planned sends will be handled by the engine. Keep the wording short and casual; the voice layer will preserve each character's typing fingerprint.\n\nOutput JSON only:\n{\"messages\":[{\"speaker\":\"JennJenn\",\"text\":\"...\",\"target\":\"NYMike23\",\"intent\":\"thread-reply\",\"topic\":\"work\"}]}\n\nOnly use speakers from: ${active.map((character) => character.name).join(", ")}.`;

    return this.callGroq(prompt, 480, PLAN_MAX_TURNS, "room");
  }

  async generateHumanReplan(human) {
    this.ensureTalkers(Date.now());
    if (human?.target && human.target !== "room") this.promoteTalker?.(human.target, Date.now());
    const active = this.activeCharacters().slice(0, 8);
    if (!active.length) return [];

    const row = this.humanHistoryRow(human);
    const humanTarget = human?.target || row?.target || "room";
    const humanTopic = row?.topic || "general";
    const directInstruction = humanTarget !== "room"
      ? `The human's message belongs to ${humanTarget}. That character should understand it as part of their exchange and, if a reply is natural, the FIRST planned bot turn should normally be ${humanTarget}.`
      : `The human addressed the room. Decide which one or two people actually noticed. Do not make the whole room answer.`;

    const prompt = `A real human just INTERRUPTED the current 1996 AOL conversation. Throw away any previously planned future turns and re-plan from what is now actually on screen.\n\n${this.plannerContext()}\n\nFIXED PROFILES FOR THE ONLY BOTS ALLOWED TO SPEAK:\n${this.promptProfiles(active, 8)}\n\nHUMAN INTERRUPTION:\n${human.from}: ${human.text}\nResolved target: ${humanTarget}\nResolved topic: ${humanTopic}\n${directInstruction}\n\nCreate ${PLAN_MIN_TURNS}-${PLAN_MAX_TURNS} plausible NEXT bot sends. The plan must incorporate the human's contribution instead of continuing as though they never spoke. If the human answered an open question without naming the asker, preserve the resolved conversational ownership. If their message changes the subject, let the old scene fade naturally. If it is ambiguous, one character may ask a short clarification instead of magically understanding. Do not make every bot respond to the human.\n\nOutput JSON only:\n{\"messages\":[{\"speaker\":\"JennJenn\",\"text\":\"...\",\"target\":\"${human.from}\",\"intent\":\"reply\",\"topic\":\"${humanTopic}\"}]}\n\nOnly use speakers from: ${active.map((character) => character.name).join(", ")}.`;

    return this.callGroq(prompt, 500, PLAN_MAX_TURNS, "room");
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    const cleanLines = (lines || []).filter((item) => item?.speaker && item?.text).slice(0, PLAN_MAX_TURNS);
    if (!cleanLines.length) {
      this.scenePlannerStats.emptyPlans += 1;
      return 0;
    }

    const plan = {
      id: this.nextScenePlanId(),
      revision: ++this.scenePlanRevision,
      reason,
      provider: cleanLines[0]?.source || this.lastSuccessfulProvider || "ai",
      createdAt: Date.now(),
      status: "active",
      plannedTurns: cleanLines.length,
      emittedTurns: 0,
      rejectedTurns: 0,
      discardedTurns: 0,
      triggerFrom: trigger?.from || "",
      triggerText: short(trigger?.text || "", 120),
      triggerTarget: trigger?.target || "room",
      triggerMessageId: this.humanHistoryRow(trigger)?.messageId || ""
    };

    this.currentScenePlan = plan;
    this.scenePlannerStats.plansCreated += 1;
    this.scenePlannerStats.plannedTurns += cleanLines.length;
    if (reason === "human-replan") this.scenePlannerStats.humanReplans += 1;
    else this.scenePlannerStats.backgroundPlans += 1;

    const queuedItems = cleanLines.map((item, index) => {
      const queued = {
        ...item,
        source: item.source || this.lastSuccessfulProvider || "ai",
        intent: item.intent || (reason === "human-replan" ? "reply" : "conversation"),
        target: item.target || "room",
        topic: item.topic || "general",
        _scenePlanId: plan.id,
        _scenePlanRevision: plan.revision,
        _scenePlanStep: index + 1,
        _scenePlanReason: reason
      };
      this.registerPlanMeta(queued, {
        planId: plan.id,
        revision: plan.revision,
        step: index + 1,
        reason
      });
      return queued;
    });

    if (front) this.aiQueue = [...queuedItems, ...(this.aiQueue || [])];
    else this.aiQueue.push(...queuedItems);

    this.broadcast({
      type: "scene_plan",
      action: "created",
      planId: plan.id,
      revision: plan.revision,
      reason,
      provider: plan.provider,
      plannedTurns: plan.plannedTurns,
      triggerFrom: plan.triggerFrom,
      triggerTarget: plan.triggerTarget,
      at: plan.createdAt
    });
    return queuedItems.length;
  }

  async refillSceneAi(now = Date.now(), force = false) {
    if (this.pendingHumans.length) return false;
    if (this.queuedPlanTurnCount() > 0) return false;
    if (!this.hasReadyAi(now)) return false;
    if (!force && now < Number(this.nextScenePlanAt || 0)) return false;

    this.lastScenePlanAt = now;
    this.nextScenePlanAt = now + this.sceneRefillDelay();
    this.aiCoverageStats.sceneCalls += 1;

    const lines = await this.generateBackgroundPlan();
    const queued = this.queueScenePlan(lines, "background", null, false);
    this.aiCoverageStats.sceneLinesQueued += queued;
    if (!queued) this.aiCoverageStats.emptyAiCalls += 1;
    return queued > 0;
  }

  async handlePendingHumanWithAi(now = Date.now()) {
    if (!this.pendingHumans.length || !this.hasReadyAi(now)) return "none";

    const elapsed = now - Number(this.lastSmartHumanAt || 0);
    if (elapsed < HUMAN_REPLAN_MIN_GAP_MS) {
      this.nextBotAt = Math.max(Number(this.nextBotAt || 0), now + (HUMAN_REPLAN_MIN_GAP_MS - elapsed));
      return "wait";
    }

    const human = this.pendingHumans.shift();
    if (!human) return "none";
    this.lastSmartHumanAt = now;
    this.aiCoverageStats.humanCalls += 1;

    const lines = await this.generateHumanReplan(human);
    const queued = this.queueScenePlan(lines, "human-replan", human, true);
    this.aiCoverageStats.humanLinesQueued += queued;

    if (!queued) {
      this.aiCoverageStats.emptyAiCalls += 1;
      this.pendingHumans.unshift(human);
      return "failed";
    }
    return "queued";
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    let planMeta = null;
    const aiSource = ["groq", "gemini", "workers-ai", "ai"].includes(String(source || ""));
    if (kind === "bot" && aiSource) planMeta = this.claimPlanMeta(from, text);

    if (planMeta && this.currentScenePlan && planMeta.planId !== this.currentScenePlan.id) {
      this.scenePlannerStats.staleTurnsBlocked += 1;
      return false;
    }

    const enriched = planMeta ? {
      ...meta,
      scenePlanId: planMeta.planId,
      planStep: planMeta.step,
      planRevision: planMeta.revision,
      planReason: planMeta.reason
    } : meta;

    const result = super.say(from, text, kind, source, enriched);

    if (planMeta) {
      const plan = this.currentScenePlan?.id === planMeta.planId ? this.currentScenePlan : null;
      if (plan) {
        if (result) {
          plan.emittedTurns += 1;
          this.scenePlannerStats.emittedTurns += 1;
        } else {
          plan.rejectedTurns += 1;
          this.scenePlannerStats.rejectedTurns += 1;
        }
        const remaining = this.queuedPlanTurnCount(plan.id);
        if (remaining === 0) this.finishPlan(plan, "completed", result ? "all planned turns consumed" : "last planned turn rejected");
      }
    }

    return result;
  }

  async tick(forceSoon = false) {
    await this.ensureState();

    if (this.currentScenePlan && Date.now() - Number(this.currentScenePlan.createdAt || 0) > PLAN_STALE_MS) {
      this.discardPlannedFuture("plan-stale");
    }

    if (this.pendingHumans.length && this.queuedPlanTurnCount() > 0) {
      this.scenePlannerStats.humanInterrupts += 1;
      this.discardPlannedFuture("human-interrupt");
      this.nextScenePlanAt = Date.now();
    }

    const result = await super.tick(forceSoon);

    if (this.currentScenePlan && this.queuedPlanTurnCount(this.currentScenePlan.id) === 0) {
      this.finishPlan(this.currentScenePlan, "completed", "queue drained");
    }
    return result;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status") return response;

    try {
      const data = await response.clone().json();
      return Response.json({
        ...data,
        pass: "scene-planner-replan-v20",
        scenePlanner: {
          currentPlan: this.currentScenePlan ? { ...this.currentScenePlan, queuedTurns: this.queuedPlanTurnCount(this.currentScenePlan.id) } : null,
          lastPlan: this.lastScenePlan,
          stats: { ...this.scenePlannerStats }
        }
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "scene-planner-replan-v20",
      scenePlanner: {
        currentPlan: this.currentScenePlan ? { ...this.currentScenePlan, queuedTurns: this.queuedPlanTurnCount(this.currentScenePlan.id) } : null,
        lastPlan: this.lastScenePlan,
        stats: { ...this.scenePlannerStats }
      }
    };
  }
}
