// Phase 3G.7 production-only residual owner.
// Frozen index_v37_hotfix.js remains unchanged for the v37-v40 lineage.
// V41 keeps output-hygiene, paused shadow, shared stats, and residual diagnostics here;
// production-turn, provider-readiness, and provider-failover authorities are extracted above.
import v37Worker, { ChatRoom as V37ChatRoom } from "./index_v37.js";
import { stripInternalChatMetadata } from "./output_hygiene_v37.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await v37Worker.fetch(request, env);
    const url = new URL(request.url);
    if (url.pathname !== "/api/health" && url.pathname !== "/api/everything" && url.pathname !== "/api/full-status") {
      return response;
    }

    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v37: {
        ...(data.v37 || {}),
        liveAiShadowPausedForProviderStability: true,
        liveAiShadowResumedAfterSingleFlightValidation: false,
        shadowPacketsStillRecordedWhileModelPaused: true,
        internalMetadataOutputHygiene: true
      }
    });
  }
};

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

  maybeRunV37Shadow(now = Date.now()) {
    this.expireOldV37Shadows?.(now);
    const pending = this.v37PendingShadows?.[0];
    if (!pending?.shadow) return;
    if (pending.shadow.ai?.deferReason !== "live-model-shadow-paused") {
      this.v37ProductionTurnStats.liveAiShadowPauses += 1;
      pending.shadow.ai.status = "deferred-production-priority";
      pending.shadow.ai.deferReason = "live-model-shadow-paused";
      pending.shadow.ai.error = "live Director model calls paused after provider retry recurrence";
      this.replaceShadowHistory?.(pending.shadow);
    }
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const original = String(text || "");
    if (kind !== "bot") return super.say(from, original, kind, source, meta);

    const sanitized = stripInternalChatMetadata(original);
    if (sanitized !== original) this.v37ProductionTurnStats.internalMetadataStrips += 1;
    if (!sanitized) {
      this.v37ProductionTurnStats.internalMetadataDroppedLines += 1;
      return false;
    }
    return super.say(from, sanitized, kind, source, meta);
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        liveAiShadowPausedForProviderStability: true,
        liveAiShadowResumedAfterSingleFlightValidation: false,
        shadowPacketsStillRecordedWhileModelPaused: true,
        internalMetadataOutputHygiene: true
      }
    };
  }
}
