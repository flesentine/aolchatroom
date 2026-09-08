// Retained historical Phase 3G.5/3G.16 compatibility artifact.
// Phase 3G.17 removes this file from the v41 production inheritance/fetch spine.
// Frozen index_v37_human_only.js remains unchanged for the v37-v40 lineage.
// The extracted v41 diagnostic surface now lives in human_only_legacy_diagnostics_v41.js.
import productionTurnWorker, { ChatRoom as ProductionTurnChatRoom } from "./index_v41_production_turn_compat.js";
import { ambientAiIntervalMs } from "./adaptive_ambient_policy_v37.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await productionTurnWorker.fetch(request, env);
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
        humanOnlyModelBudget: false,
        ambientModelGenerationDisabled: false,
        adaptiveAmbientAi: true,
        ambientSingleProviderAttempt: true,
        ambientSingleCallExchange: true,
        humanModelFailureFallsBackBuiltIn: true
      }
    });
  }
};

export class ChatRoom extends ProductionTurnChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37LastAmbientAiAt = 0;
    this.v37AdaptiveAmbientStats = {
      ambientAiAttempts: 0,
      ambientAiSuccesses: 0,
      ambientAiFailures: 0,
      ambientAiOutputRejects: 0,
      ambientAiLines: 0,
      ambientBuiltInPlansGenerated: 0,
      ambientAiRateSkips: 0,
      ambientAiHumanPrioritySkips: 0
    };
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    const preferred = this.preferredStructuredReadyProviders?.(Date.now()) || [];
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        humanOnlyModelBudget: false,
        ambientModelGenerationDisabled: false,
        adaptiveAmbientAi: true,
        ambientSingleProviderAttempt: true,
        ambientSingleCallExchange: true,
        humanModelFailureFallsBackBuiltIn: true
      },
      adaptiveAmbientAi: {
        ...this.v37AdaptiveAmbientStats,
        humanModelFallbacks: Number(this.v37HumanFallbackStats?.humanModelFallbacks || 0),
        humanModelFallbackMisses: Number(this.v37HumanFallbackStats?.humanModelFallbackMisses || 0),
        preferredReadyProviders: preferred,
        nextIntervalMs: ambientAiIntervalMs(preferred.length),
        lastAmbientAiAgoMs: this.v37LastAmbientAiAt ? Math.max(0, Date.now() - this.v37LastAmbientAiAt) : null,
        policy: "one provider attempt creates a two-line AI bot exchange; built-in chatter fills between calls; humans remain priority"
      }
    };
  }
}
