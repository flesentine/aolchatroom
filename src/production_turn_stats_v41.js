// Phase 3G.12 shared v37 production-turn telemetry schema.
// This is state only: behavioral ownership lives in the extracted v41 layers.
export function createV37ProductionTurnStats() {
  return {
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
