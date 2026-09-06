// Phase 3G.5 production-only residual compatibility owner.
// Frozen index_v37_human_only.js remains unchanged for the v37-v40 lineage.
// V41 preserves only the still-live capacity, ambient-character, human fallback,
// constructor/diagnostic, and status surface; superseded adaptive ambient is omitted.
import hotfixWorker, { ChatRoom as HotfixChatRoom } from "./index_v37_hotfix.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import { getCharacter } from "./characters.js";
import { ambientAiIntervalMs } from "./adaptive_ambient_policy_v37.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await hotfixWorker.fetch(request, env);
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

export class ChatRoom extends HotfixChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37AmbientProviderCursor = 0;
    this.v37LastAmbientAiAt = 0;
    this.v37AdaptiveAmbientStats = {
      ambientAiAttempts: 0,
      ambientAiSuccesses: 0,
      ambientAiFailures: 0,
      ambientAiOutputRejects: 0,
      ambientAiLines: 0,
      ambientBuiltInPlansGenerated: 0,
      ambientAiRateSkips: 0,
      ambientAiHumanPrioritySkips: 0,
      humanModelFallbacks: 0,
      humanModelFallbackMisses: 0
    };
  }

  // A single healthy preferred provider is enough for the live v37 capacity
  // policy. Later lively ambient owns routine background generation itself.
  providerCapacityConstrained(now = Date.now()) {
    const preferred = this.preferredStructuredReadyProviders?.(now) || [];
    if (preferred.length >= 1) return false;
    return super.providerCapacityConstrained(now);
  }

  activeAmbientCharacters() {
    return [...(this.activeBotNames || [])]
      .map((name) => getCharacter(name))
      .filter(Boolean);
  }

  // The Director owns eligible direct-human turns, but still delegates unlocked
  // or non-direct human packets downward. Preserve the old safety fallback there.
  async generateHumanReplan(human) {
    const lines = await super.generateHumanReplan(human);
    if (Array.isArray(lines) && lines.length) return lines;

    const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
    if (fallback.length) {
      this.v37AdaptiveAmbientStats.humanModelFallbacks += 1;
      this.setAiStatus?.("AI human reply fallback · built-in");
      return fallback.map((item) => ({ ...item, source: "built-in" }));
    }

    this.v37AdaptiveAmbientStats.humanModelFallbackMisses += 1;
    return [];
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
        preferredReadyProviders: preferred,
        nextIntervalMs: ambientAiIntervalMs(preferred.length),
        lastAmbientAiAgoMs: this.v37LastAmbientAiAt ? Math.max(0, Date.now() - this.v37LastAmbientAiAt) : null,
        policy: "one provider attempt creates a two-line AI bot exchange; built-in chatter fills between calls; humans remain priority"
      }
    };
  }
}
