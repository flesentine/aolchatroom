// Phase 3G.11 shared v37 production-turn telemetry state owner.
// Frozen index_v37_hotfix.js remains unchanged for the v37-v40 lineage.
// All hotfix behaviors are extracted above this layer; V41 keeps only the shared
// stats object here because singleflight/readiness/failover/hygiene/shadow owners
// all write into the same externally visible production-turn diagnostics.
import v37Worker, { ChatRoom as V37ChatRoom } from "./index_v37.js";

export default v37Worker;

export class ChatRoom extends V37ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37ProductionTurnStats = {
      outerRequests: 0,
      tickRequests: 0,
      alarmRequests: 0,
      forceRequests: 0,
      baseTurnsStarted: 0,
      baseTurnsCompleted: 0,
      coalescedRequests: 0,
      replayTurns: 0,
      deferredAfterReplayCap: 0,
      maxConcurrentBaseTurns: 0,
      liveAiShadowPauses: 0,
      internalMetadataStrips: 0,
      internalMetadataDroppedLines: 0,
      requestLocalProviderRejects: 0,
      emergencyWorkersBrainRoutes: 0,
      workersDailyQuotaExhaustions: 0,
      degradedModeTicks: 0,
      degradedHumanFallbacksQueued: 0,
      degradedAmbientFallbacksQueued: 0,
      degradedFallbackMisses: 0,
      constrainedModeTicks: 0,
      backgroundAiPlansSuppressed: 0,
      capacitySheddingAmbientQueued: 0
    };
  }

}
