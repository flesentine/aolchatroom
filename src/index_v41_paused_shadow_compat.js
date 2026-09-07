// Phase 3G.11 paused-shadow compatibility owner.
// Frozen index_v37_hotfix.js remains unchanged for the v37-v40 lineage.
// V41 keeps queued Director shadow packets recorded while permanently pausing
// live shadow model execution behind production provider traffic.
import residualWorker, { ChatRoom as SharedHotfixStateChatRoom } from "./index_v41_hotfix_residual_compat.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await residualWorker.fetch(request, env);
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
        shadowPacketsStillRecordedWhileModelPaused: true
      }
    });
  }
};

export class ChatRoom extends SharedHotfixStateChatRoom {
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

  v37Snapshot() {
    const base = super.v37Snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        liveAiShadowPausedForProviderStability: true,
        liveAiShadowResumedAfterSingleFlightValidation: false,
        shadowPacketsStillRecordedWhileModelPaused: true
      }
    };
  }
}
