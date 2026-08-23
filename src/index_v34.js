import baseWorker, { ChatRoom as V33ChatRoom } from "./index_v33.js";
import { CHARACTERS } from "./characters.js";
import { lifeBibleDebug } from "./life_bibles_v28.js";
import { typingStyleDebug } from "./typing.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const PASS = "everything-status-v34";
const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V34_HARNESS_START_KEY = "realismHarnessV34Start";

function compact(value, max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function responseJson(response) {
  if (!response) return { ok: false, error: "no response" };
  const status = Number(response.status || 0);
  try {
    const data = await response.json();
    return { httpStatus: status, ...data };
  } catch {
    try {
      const text = await response.text();
      return { ok: false, httpStatus: status, error: "non-json response", text: compact(text, 500) };
    } catch {
      return { ok: false, httpStatus: status, error: "unreadable response" };
    }
  }
}

async function inheritedApi(request, env, pathname, search = "") {
  try {
    const origin = new URL(request.url).origin;
    const response = await baseWorker.fetch(new Request(`${origin}${pathname}${search}`), env);
    return responseJson(response);
  } catch (error) {
    return { ok: false, error: compact(error?.message || "endpoint call failed", 300) };
  }
}

function publicCharacterBundle(character) {
  return {
    name: character.name,
    age: character.age,
    sex: character.sex,
    location: character.location,
    timezone: character.timezone,
    occupation: character.occupation,
    interests: character.interests || [],
    personality: character.personality || {},
    typing: character.typing || {},
    opinions: character.opinions || {},
    cannedFamilies: character.cannedFamilies || [],
    lifeBible: lifeBibleDebug(character.name),
    typingDebug: typingStyleDebug(character)
  };
}

function endpointMap() {
  return {
    everything: "/api/everything",
    alias: "/api/full-status",
    health: "/api/health",
    ai: "/api/ai-status",
    realismLive: "/api/realism-score",
    realismAllRetained: "/api/realism-score?all=1",
    historicalKnowledge: "/api/knowledge-status",
    lifeBibles: "/api/life-status",
    departures: "/api/departure-status",
    engagement: "/api/engagement-status",
    emergentLife: "/api/story-status",
    typing: "/api/typing-status",
    v33: "/api/v33-status"
  };
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
        pass: PASS,
        deployVersion: 34,
        inherits: "surgical-realism-guards-v33",
        providerPriority: PROVIDER_PRIORITY,
        comprehensiveStatus: {
          endpoint: "/api/everything",
          alias: "/api/full-status",
          includesRecentHistory: true,
          includesRuntimeQueues: true,
          includesScenePlannerState: true,
          includesProviderHealth: true,
          includesRealismLiveAndAllRetained: true,
          includesHistoricalKnowledge: true,
          includesDepartures: true,
          includesEngagement: true,
          includesEmergentLife: true,
          includesPublicCharacterProfiles: true,
          includesPublicLifeBibles: true,
          includesTypingProfiles: true,
          privateLifeBibleFactsHidden: true,
          compactOption: "/api/everything?compact=1"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/everything" || url.pathname === "/api/full-status") {
      const room = url.searchParams.get("room") || "town-square";
      const compactMode = url.searchParams.get("compact") === "1";
      const id = env.CHAT_ROOMS.idFromName(room);

      const runtimePromise = env.CHAT_ROOMS.get(id).fetch(
        new Request(`https://room.internal/v34-runtime?compact=${compactMode ? "1" : "0"}`)
      ).then(responseJson).catch((error) => ({ ok: false, error: compact(error?.message || "runtime status failed", 300) }));

      const [
        runtime,
        inheritedHealth,
        ai,
        realismLive,
        realismAll,
        knowledge,
        departures,
        engagement,
        story,
        v33
      ] = await Promise.all([
        runtimePromise,
        inheritedApi(request, env, "/api/health"),
        inheritedApi(request, env, "/api/ai-status"),
        inheritedApi(request, env, "/api/realism-score"),
        inheritedApi(request, env, "/api/realism-score", "?all=1"),
        inheritedApi(request, env, "/api/knowledge-status", `?room=${encodeURIComponent(room)}`),
        inheritedApi(request, env, "/api/departure-status", `?room=${encodeURIComponent(room)}`),
        inheritedApi(request, env, "/api/engagement-status", `?room=${encodeURIComponent(room)}`),
        inheritedApi(request, env, "/api/story-status", `?room=${encodeURIComponent(room)}`),
        inheritedApi(request, env, "/api/v33-status", `?room=${encodeURIComponent(room)}`)
      ]);

      const characters = compactMode
        ? CHARACTERS.map((character) => ({
            name: character.name,
            age: character.age,
            location: character.location,
            occupation: character.occupation
          }))
        : CHARACTERS.map(publicCharacterBundle);

      return Response.json({
        ok: true,
        pass: PASS,
        deployVersion: 34,
        generatedAt: Date.now(),
        generatedAtIso: new Date().toISOString(),
        room,
        simulatedDate: simulatedDateLabel(),
        simulatedDateTime: simulatedDateTimeLabel(),
        compact: compactMode,
        endpoints: endpointMap(),
        runtime,
        diagnostics: {
          inheritedHealth,
          ai,
          realism: {
            live: realismLive,
            allRetained: realismAll
          },
          historicalKnowledge: knowledge,
          departures,
          engagement,
          emergentLife: story,
          surgicalV33: v33
        },
        characters,
        privacy: {
          privateLifeBibleFactsHidden: true,
          rawPersistentHumanMemoryNotExposed: true,
          note: "This endpoint aggregates simulation diagnostics and public fictional-character data without publishing deliberately private life-bible secrets or raw persistent human-memory text."
        }
      });
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends V33ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v34Loaded = false;
  }

  async ensureState() {
    await super.ensureState();
    if (this.v34Loaded) return;
    let started = Number(await this.ctx.storage.get(V34_HARNESS_START_KEY) || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V34_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v34Loaded = true;
  }

  memorySummary() {
    const byBot = this.memory23?.byBot || {};
    const perBot = {};
    let totalEpisodes = 0;
    for (const [name, rows] of Object.entries(byBot)) {
      const count = Array.isArray(rows) ? rows.length : 0;
      if (!count) continue;
      totalEpisodes += count;
      perBot[name] = count;
    }
    return {
      totalEpisodes,
      botsWithEpisodes: Object.keys(perBot).length,
      perBot,
      stats: { ...(this.memory23Stats || {}) },
      lastCallback: this.lastCallback || null
    };
  }

  runtimeBundle(compactMode = false, now = Date.now()) {
    const history = (this.history || []).slice(compactMode ? -50 : -220);
    const aiQueue = (this.aiQueue || []).slice(compactMode ? 0 : -40).map((item) => ({
      speaker: item?.speaker || "",
      text: compact(item?.text || "", 220),
      target: item?.target || "room",
      intent: item?.intent || "",
      topic: item?.topic || "general",
      scenePlanId: item?._scenePlanId || item?.scenePlanId || "",
      planStep: item?._scenePlanStep || item?.planStep || 0
    }));
    const pendingHumans = (this.pendingHumans || []).map((row) => ({
      from: row?.from || "",
      text: compact(row?.text || "", 220),
      target: row?.target || "room",
      at: Number(row?.at || 0)
    }));

    let openScenes = [];
    try {
      if (typeof this.openScenes === "function") openScenes = this.openScenes(now) || [];
    } catch {}

    return {
      ok: true,
      pass: PASS,
      generatedAt: now,
      room: {
        humans: this.humanNames?.() || [],
        activeBots: [...(this.activeBotNames || [])],
        visibleUsers: this.visibleUsers?.() || [],
        occupancy: this.visibleUsers?.().length || 0,
        targetOccupancy: Number(this.targetOccupancy || 0),
        tos: this.tos || null,
        heat: Number(this.heat || 0),
        aiStatus: this.aiStatus || ""
      },
      timing: {
        nextBotInMs: Math.max(0, Number(this.nextBotAt || 0) - now),
        nextScenePlanInMs: Math.max(0, Number(this.nextScenePlanAt || 0) - now),
        lastSmartHumanAgoMs: this.lastSmartHumanAt ? Math.max(0, now - Number(this.lastSmartHumanAt)) : null
      },
      queues: {
        aiQueueLength: Number(this.aiQueue?.length || 0),
        aiQueue: compactMode ? undefined : aiQueue,
        pendingHumanCount: pendingHumans.length,
        pendingHumans
      },
      scenePlanner: {
        current: this.currentScenePlan || null,
        last: this.lastScenePlan || null,
        openScenes,
        stats: { ...(this.scenePlannerStats || {}) }
      },
      brainVoice: {
        stats: { ...(this.brainVoiceStats || {}) },
        lastPlan: this.lastBrainPlan || null
      },
      memory: this.memorySummary(),
      socialSummary: {
        persistedHumans: Object.keys(this.social?.humans || {}).length,
        threadCount: Object.keys(this.social?.threads || {}).length,
        onlineBotCount: this.activeBotNames?.length || 0,
        presence: this.social?.presence || null
      },
      history: compactMode ? history.map((row) => ({
        at: row.at,
        from: row.from,
        text: row.text,
        kind: row.kind,
        source: row.source,
        target: row.target,
        topic: row.topic
      })) : history
    };
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    report.pass = PASS;
    report.scope = includeAll ? "all retained messages" : "messages since v34 diagnostics activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.v34Diagnostics = {
      comprehensiveEndpoint: "/api/everything",
      diagnosticsOnly: true,
      simulationBehaviorInheritedFromV33: true
    };
    return report;
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/v34-runtime") {
      return Response.json(this.runtimeBundle(url.searchParams.get("compact") === "1", Date.now()));
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({ ...data, pass: PASS, v34: { diagnosticsOnly: true, comprehensiveEndpoint: "/api/everything" } });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: PASS,
      v34: {
        diagnosticsOnly: true,
        comprehensiveEndpoint: "/api/everything",
        memory: this.memorySummary()
      }
    };
  }
}
