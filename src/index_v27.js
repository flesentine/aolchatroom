import baseWorker, { ChatRoom as HumanizedChatRoom } from "./index_v26.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";
import {
  simulatedCutoff,
  individualKnowledgePrompt,
  historicalKnowledgeDebug,
  knowledgeGateForText,
  gateAvailable,
  episodeAvailableAtCutoff,
  factAvailableAtCutoff,
  futureKnowledgeViolation
} from "./historical_knowledge_v27.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const TIMELINE_STATE_KEY = "historicalKnowledgeV27State";
const V27_HARNESS_START_KEY = "realismHarnessV27Start";

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function grade(score) {
  if (score >= 94) return "A";
  if (score >= 88) return "A-";
  if (score >= 82) return "B+";
  if (score >= 76) return "B";
  if (score >= 70) return "B-";
  if (score >= 63) return "C+";
  if (score >= 56) return "C";
  if (score >= 48) return "D";
  return "F";
}

function earlierGate(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.date < b.date) return a;
  if (a.date > b.date) return b;
  return Number(a.hour || 0) <= Number(b.hour || 0) ? a : b;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      const cutoff = simulatedCutoff();
      return Response.json({
        ok: true,
        room: "Town Square",
        simulatedDate: simulatedDateLabel(),
        simulatedDateTime: simulatedDateTimeLabel(),
        pass: "historical-individual-knowledge-v27",
        providerPriority: PROVIDER_PRIORITY,
        historicalKnowledge: {
          hardCutoffDate: cutoff.dateKey,
          hardCutoffTimePT: `${String(cutoff.hour).padStart(2, "0")}:${String(cutoff.minute).padStart(2, "0")}`,
          individualAwarenessByAgeLocationInterests: true,
          privatePerCharacterKnowledge: true,
          pre1996LongTermKnowledgeAllowed: true,
          future1996KnowledgeBlocked: true,
          jan1WorldKnowledgeReset: true,
          personalRelationshipsPersistAcrossReset: true,
          futureBoundPersonalMemoriesLockUntilHistoricallyPossible: true,
          knowledgeStatusEndpoint: "/api/knowledge-status"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/knowledge-status") {
      const id = env.CHAT_ROOMS.idFromName("town-square");
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/knowledge-status"));
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends HumanizedChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v27Loaded = false;
    this.timeline27 = { version: 1, lastDateKey: "", loopCount: 0, lastRolloverAt: 0 };
    this.v27Stats = {
      rollovers: 0,
      transientHistoryClearedOnRollover: 0,
      memoriesTaggedWithHistoricalGate: 0,
      memoriesLockedByCutoff: 0,
      factsLockedByCutoff: 0,
      futureBotLinesBlocked: 0,
      knowledgePromptsBuilt: 0
    };
  }

  async ensureState() {
    await super.ensureState();

    if (!this.v27Loaded) {
      const [saved, harnessStarted] = await Promise.all([
        this.ctx.storage.get(TIMELINE_STATE_KEY),
        this.ctx.storage.get(V27_HARNESS_START_KEY)
      ]);
      if (saved && saved.version === 1) this.timeline27 = { ...this.timeline27, ...saved };

      let started = Number(harnessStarted || 0);
      if (!started) {
        started = Date.now();
        await this.ctx.storage.put(V27_HARNESS_START_KEY, started);
      }
      this.realismHarnessStartedAt = started;
      this.v27Loaded = true;
    }

    await this.refreshTimelineBoundary();
  }

  async refreshTimelineBoundary(now = Date.now()) {
    if (!this.v27Loaded) return;
    const cutoff = simulatedCutoff(now);
    const previous = String(this.timeline27.lastDateKey || "");

    if (previous && cutoff.dateKey < previous) {
      await this.handleHistoricalRollover(previous, cutoff.dateKey, now);
    }

    if (this.timeline27.lastDateKey !== cutoff.dateKey) {
      this.timeline27.lastDateKey = cutoff.dateKey;
      await this.ctx.storage.put(TIMELINE_STATE_KEY, this.timeline27);
    }
  }

  async handleHistoricalRollover(previousDateKey, nextDateKey, now = Date.now()) {
    // Jan 1 is a world-knowledge loop, not a relationship wipe. Remove transient
    // conversation context that could leak late-1996 facts backward, while keeping
    // social relationships, human facts, visits, and persistent episodic memory.
    const priorHistoryCount = (this.history || []).length;
    this.history = [];
    this.aiQueue = [];
    this.pendingHumans = [];
    this.currentScenePlan = null;
    this.lastScenePlan = null;
    this.planMetaByLine?.clear?.();
    this.sceneCarryByLine?.clear?.();
    this.sceneBoard?.clear?.();
    this.attentionByName?.clear?.();
    this.topicFatigueUntil?.clear?.();
    this.memoryRefsOffered = new Set();
    if (Array.isArray(this.openObligations)) this.openObligations = [];
    if (this.social) this.social.threads = [];

    this.culture = null;
    this.culturePromise = null;

    this.timeline27.loopCount = Number(this.timeline27.loopCount || 0) + 1;
    this.timeline27.lastRolloverAt = now;
    this.timeline27.lastDateKey = nextDateKey;
    this.v27Stats.rollovers += 1;
    this.v27Stats.transientHistoryClearedOnRollover += priorHistoryCount;

    await Promise.all([
      this.ctx.storage.put("history", []),
      this.ctx.storage.put(TIMELINE_STATE_KEY, this.timeline27)
    ]);
    this.persistSocial?.(true);

    this.broadcast({
      type: "timeline_boundary",
      action: "historical-year-reset",
      from: previousDateKey,
      to: nextDateKey,
      personalMemoryPreserved: true,
      at: now
    });
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    if (typeof this.ensureCulture === "function") await this.ensureCulture(Date.now());
    return super.tick(forceSoon);
  }

  brainPrompt(active, reason, human = null) {
    const base = super.brainPrompt(active, reason, human);
    const privateKnowledge = individualKnowledgePrompt(active, this.culture, Date.now());
    this.v27Stats.knowledgePromptsBuilt += 1;
    return `${base}\n\n${privateKnowledge}\n\nTIME-LOOP MEMORY RULES:\n- Personal continuity is separate from world chronology. A character may recognize a human, remember timeless preferences, and keep friendships/rivalries across January 1.\n- A personal memory containing information from later in 1996 is intentionally unavailable until that event/date becomes historically possible again. Never infer the hidden content.\n- Do not treat another character's private news awareness as shared room knowledge unless that character actually says it in the room.\n- A human mentioning a future event does not make the event true. Respond from the character's 1996 perspective.`;
  }

  rememberEpisode(bot, payload) {
    const row = super.rememberEpisode(bot, payload);
    if (!row) return row;

    const gate = knowledgeGateForText(row.text, row.at || Date.now());
    if (!gate) return row;

    const current = row.worldNotBefore
      ? { date: row.worldNotBefore, hour: Number(row.worldNotBeforeHour || 0) }
      : null;
    const chosen = earlierGate(current, gate);
    const changed = row.worldNotBefore !== chosen.date || Number(row.worldNotBeforeHour || 0) !== Number(chosen.hour || 0);
    row.worldNotBefore = chosen.date;
    row.worldNotBeforeHour = Number(chosen.hour || 0);
    row.worldKnowledgeBound = true;
    if (changed) {
      this.v27Stats.memoriesTaggedWithHistoricalGate += 1;
      this.persistMemory23?.(true);
    }
    return row;
  }

  memoryContext(active, reason, human = null) {
    const cutoff = simulatedCutoff();
    const originalByBot = this.memory23?.byBot || {};
    const originalHumans = this.social?.humans || {};
    let lockedEpisodes = 0;
    let lockedFacts = 0;

    const filteredByBot = {};
    for (const [bot, episodes] of Object.entries(originalByBot)) {
      const kept = (episodes || []).filter((episode) => {
        const allowed = episodeAvailableAtCutoff(episode, cutoff);
        if (!allowed) lockedEpisodes += 1;
        return allowed;
      });
      filteredByBot[bot] = kept;
    }

    const filteredHumans = {};
    for (const [name, humanState] of Object.entries(originalHumans)) {
      const facts = (humanState?.facts || []).filter((fact) => {
        const allowed = factAvailableAtCutoff(fact, cutoff);
        if (!allowed) lockedFacts += 1;
        return allowed;
      });
      filteredHumans[name] = { ...humanState, facts };
    }

    if (this.memory23) this.memory23.byBot = filteredByBot;
    if (this.social) this.social.humans = filteredHumans;
    try {
      const base = super.memoryContext(active, reason, human);
      this.v27Stats.memoriesLockedByCutoff = lockedEpisodes;
      this.v27Stats.factsLockedByCutoff = lockedFacts;
      return `${base}\nPERSONAL MEMORY CUTOFF: ${lockedEpisodes} episodic memories and ${lockedFacts} remembered facts are currently time-locked because their world information belongs later in 1996. Relationships and allowed timeless memories remain intact.`;
    } finally {
      if (this.memory23) this.memory23.byBot = originalByBot;
      if (this.social) this.social.humans = originalHumans;
    }
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") {
      const violation = futureKnowledgeViolation(text, Date.now());
      if (violation) {
        this.v27Stats.futureBotLinesBlocked += 1;
        this.broadcast({
          type: "historical_guard",
          action: "future-line-blocked",
          speaker: from,
          notBefore: violation.date,
          at: Date.now()
        });
        return false;
      }
    }
    return super.say(from, text, kind, source, meta);
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    const now = Date.now();
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || now);
    const bots = (this.history || [])
      .filter((row) => row?.kind === "bot" && Number(row.at || 0) >= floor)
      .slice(-180);

    const violations = bots.map((row) => ({ row, violation: futureKnowledgeViolation(row.text, row.at || now) }))
      .filter((item) => item.violation);
    const cutoffScore = clamp(100 - violations.length * 38);
    report.components ||= [];
    report.components.push({
      name: "Historical cutoff",
      score: Math.round(cutoffScore),
      weight: 7,
      details: {
        future1996Violations: violations.length,
        examples: violations.slice(-3).map((item) => ({ from: item.row.from, text: item.row.text, notBefore: item.violation.date }))
      }
    });

    const weightTotal = report.components.reduce((sum, row) => sum + Number(row.weight || 0), 0) || 1;
    const weighted = report.components.reduce((sum, row) => sum + Number(row.score || 0) * Number(row.weight || 0), 0) / weightTotal;
    report.score = Math.round(clamp(weighted));
    report.grade = grade(report.score);
    report.pass = "historical-individual-knowledge-v27";
    report.scope = includeAll ? "all retained messages" : "messages since v27 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.regressionFlags ||= [];
    if (violations.length) report.regressionFlags.push(`future historical knowledge leaked: ${violations.length} line(s)`);
    report.v27HistoricalKnowledge = {
      cutoff: simulatedCutoff(now),
      loopCount: Number(this.timeline27.loopCount || 0),
      personalMemoryPersists: true,
      futureBoundMemoriesLock: true
    };
    return report;
  }

  async knowledgeSnapshot(now = Date.now()) {
    if (typeof this.ensureCulture === "function") await this.ensureCulture(now);
    const active = this.activeCharacters?.().slice(0, 10) || [];
    return {
      ok: true,
      pass: "historical-individual-knowledge-v27",
      simulatedDateTime: simulatedDateTimeLabel(now),
      timeline: {
        ...this.timeline27,
        cutoff: simulatedCutoff(now)
      },
      memoryLocks: {
        episodic: Number(this.v27Stats.memoriesLockedByCutoff || 0),
        facts: Number(this.v27Stats.factsLockedByCutoff || 0)
      },
      awareness: historicalKnowledgeDebug(active, this.culture, now),
      stats: { ...this.v27Stats }
    };
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/knowledge-status") {
      return Response.json(await this.knowledgeSnapshot());
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({
        ...data,
        pass: "historical-individual-knowledge-v27",
        v27: {
          cutoff: simulatedCutoff(),
          loopCount: Number(this.timeline27.loopCount || 0),
          lastRolloverAt: Number(this.timeline27.lastRolloverAt || 0),
          ...this.v27Stats
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
      pass: "historical-individual-knowledge-v27",
      v27: {
        cutoff: simulatedCutoff(),
        timeline: { ...this.timeline27 },
        stats: { ...this.v27Stats }
      }
    };
  }
}
