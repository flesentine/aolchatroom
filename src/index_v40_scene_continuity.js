import worldGateWorker, { ChatRoom as WorldGateChatRoom } from "./index_v39_world_gate.js";
import {
  V40_MAX_SCENE_TURNS,
  V40_MOMENTUM_WINDOW_MS,
  V40_TARGET_SCENE_TURNS,
  inferSceneMomentum,
  sceneMomentumPrompt,
  selectSceneCarryIndices
} from "./scene_continuity_v40.js";

const PASS = "scene-continuity-v40";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

async function roomV40Status(env, roomName = "town-square") {
  try {
    const id = env.CHAT_ROOMS.idFromName(roomName);
    const response = await env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v40-status"));
    return await json(response);
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomName = url.searchParams.get("room") || "town-square";

    if (url.pathname === "/api/v40-status") {
      const id = env.CHAT_ROOMS.idFromName(roomName);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v40-status"));
    }

    const response = await worldGateWorker.fetch(request, env);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;

    const runtime = url.pathname === "/api/everything" || url.pathname === "/api/full-status"
      ? await roomV40Status(env, roomName)
      : null;

    return Response.json({
      ...data,
      pass: PASS,
      deployVersion: 40,
      v40: {
        sceneContinuity: true,
        backgroundSceneCarry: true,
        momentumWindowMs: V40_MOMENTUM_WINDOW_MS,
        targetSceneTurns: V40_TARGET_SCENE_TURNS,
        maxSceneTurns: V40_MAX_SCENE_TURNS,
        humanScenePileOnBlocked: true,
        humanParticipantIdentityExclusion: true,
        unrelatedSideExchangeLimit: 1,
        statusEndpoint: "/api/v40-status",
        ...(runtime ? { runtime } : {})
      }
    });
  }
};

export class ChatRoom extends WorldGateChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v40Stats = {
      momentumPromptLocks: 0,
      backgroundPlansExamined: 0,
      backgroundPlansWithMomentum: 0,
      backgroundPlansCarried: 0,
      backgroundLinesCarried: 0,
      independentSideLines: 0,
      buildingSceneCarries: 0,
      liveSceneCarries: 0,
      agingSceneCarries: 0
    };
    // Phase 0 observation counters are deliberately parallel to the legacy v40
    // counters. Do not redefine the old counters: production captures already use
    // them as a baseline, even though backgroundPlansExamined includes empty input.
    this.v40ObservationStats = {
      backgroundQueueAttempts: 0,
      nonEmptyBackgroundInputs: 0,
      momentumAtQueueAttempts: 0,
      backgroundPlansQueued: 0,
      backgroundLinesQueued: 0
    };
    this.v40LastCarry = null;
  }

  currentAmbientMomentum(now = Date.now()) {
    return inferSceneMomentum(this.history || [], now, this.humanNames?.() || []);
  }

  livelyAmbientPrompt(now = Date.now()) {
    const base = super.livelyAmbientPrompt(now);
    const momentum = this.currentAmbientMomentum(now);
    if (!momentum) {
      return `${base}\n\nV40 ANTI-CHURN NOTE: do not start a fresh topic merely because the previous line ended. Prefer a natural reply, follow-up, reaction, or related tangent when recent chat still gives you something to work with.`;
    }
    this.v40Stats.momentumPromptLocks += 1;
    return `${base}\n\n${sceneMomentumPrompt(momentum)}`;
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    const now = Date.now();
    const momentum = reason === "background" ? this.currentAmbientMomentum(now) : null;
    if (reason === "background") {
      // Preserve original v40 counter semantics for before/after comparisons.
      this.v40Stats.backgroundPlansExamined += 1;
      if (momentum) this.v40Stats.backgroundPlansWithMomentum += 1;

      // Parallel Phase 0 observations use literal names so an empty refill attempt
      // cannot be mistaken for a generated or queued background plan.
      this.v40ObservationStats.backgroundQueueAttempts += 1;
      if ((lines || []).some((item) => item?.speaker && item?.text)) {
        this.v40ObservationStats.nonEmptyBackgroundInputs += 1;
      }
      if (momentum) this.v40ObservationStats.momentumAtQueueAttempts += 1;
    }

    const queued = super.queueScenePlan(lines, reason, trigger, front);
    if (reason === "background" && Number(queued || 0) > 0) {
      this.v40ObservationStats.backgroundPlansQueued += 1;
      this.v40ObservationStats.backgroundLinesQueued += Number(queued || 0);
    }
    if (!queued || reason !== "background" || !momentum?.sceneId) return queued;

    const planId = this.currentScenePlan?.id || "";
    if (!planId) return queued;
    const planItems = (this.aiQueue || [])
      .filter((item) => item?._scenePlanId === planId)
      .sort((a, b) => Number(a?._scenePlanStep || 0) - Number(b?._scenePlanStep || 0));
    if (!planItems.length) return queued;

    const carryIndices = new Set(selectSceneCarryIndices(planItems, momentum));
    let carried = 0;
    for (let index = 0; index < planItems.length; index += 1) {
      const item = planItems[index];
      if (!carryIndices.has(index)) continue;
      item._continuitySceneId = momentum.sceneId;
      this.registerSceneCarry?.(item, momentum.sceneId, planId);
      carried += 1;
    }

    if (!carried) return queued;
    this.v40Stats.backgroundPlansCarried += 1;
    this.v40Stats.backgroundLinesCarried += carried;
    this.v40Stats.independentSideLines += Math.max(0, planItems.length - carried);
    if (momentum.phase === "building") this.v40Stats.buildingSceneCarries += 1;
    else if (momentum.phase === "aging") this.v40Stats.agingSceneCarries += 1;
    else this.v40Stats.liveSceneCarries += 1;

    this.v40LastCarry = {
      sceneId: momentum.sceneId,
      topic: momentum.topic,
      phase: momentum.phase,
      priorTurns: momentum.turns,
      carriedLines: carried,
      independentLines: Math.max(0, planItems.length - carried),
      planId,
      at: now
    };
    this.broadcast?.({
      type: "scene_plan",
      action: "v40-background-scene-carry",
      ...this.v40LastCarry
    });
    return queued;
  }

  v40Snapshot(now = Date.now()) {
    return {
      pass: PASS,
      deployVersion: 40,
      stats: { ...this.v40Stats },
      observationStats: { ...this.v40ObservationStats },
      currentMomentum: this.currentAmbientMomentum(now),
      lastCarry: this.v40LastCarry,
      policy: {
        momentumWindowMs: V40_MOMENTUM_WINDOW_MS,
        targetSceneTurns: V40_TARGET_SCENE_TURNS,
        maxSceneTurns: V40_MAX_SCENE_TURNS,
        backgroundPlansCanCarryExistingSceneId: true,
        directHumanScenesRemainOwnedByHumanReplanPath: true,
        humanParticipantIdentityExclusion: "active-or-recent-90s",
        sideCrossTalkMayRemainIndependent: true,
        noExtraProviderCallForContinuity: true,
        legacyV40CounterSemanticsPreserved: true,
        phase0ObservationCountersAreAdditiveOnly: true
      }
    };
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    return {
      ...report,
      v40SceneContinuity: this.v40Snapshot(Date.now())
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/v40-status") {
      await this.ensureState();
      return Response.json(this.v40Snapshot(Date.now()));
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      pass: PASS,
      deployVersion: 40,
      v40SceneContinuity: this.v40Snapshot(Date.now())
    });
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: PASS,
      deployVersion: 40,
      v40SceneContinuity: this.v40Snapshot(Date.now())
    };
  }
}
