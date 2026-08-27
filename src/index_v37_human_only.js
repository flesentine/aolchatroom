import hotfixWorker, { ChatRoom as HotfixChatRoom } from "./index_v37_hotfix.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";

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
        humanOnlyModelBudget: true,
        ambientModelGenerationDisabled: true,
        humanModelFailureFallsBackBuiltIn: true
      }
    });
  }
};

export class ChatRoom extends HotfixChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37HumanOnlyStats = {
      ambientModelPlansBlocked: 0,
      ambientBuiltInPlansGenerated: 0,
      humanModelFallbacks: 0,
      humanModelFallbackMisses: 0
    };
  }

  // Stabilization mode: ambient chatter must never spend Gemini/Groq/Workers AI.
  // Human-facing turns keep the full structured provider path below.
  async generateBackgroundPlan() {
    this.v37HumanOnlyStats.ambientModelPlansBlocked += 1;
    const ambient = ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this);
    if (!ambient) return [];
    this.v37HumanOnlyStats.ambientBuiltInPlansGenerated += 1;
    if (!this.providerPoolDegraded?.(Date.now())) {
      this.setAiStatus?.("AI human-priority · ambient built-in");
    }
    return [{ ...ambient, source: "built-in" }];
  }

  async generateHumanReplan(human) {
    const lines = await super.generateHumanReplan(human);
    if (Array.isArray(lines) && lines.length) return lines;

    const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
    if (fallback.length) {
      this.v37HumanOnlyStats.humanModelFallbacks += 1;
      this.setAiStatus?.("AI human reply fallback · built-in");
      return fallback.map((item) => ({ ...item, source: "built-in" }));
    }

    this.v37HumanOnlyStats.humanModelFallbackMisses += 1;
    return [];
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        humanOnlyModelBudget: true,
        ambientModelGenerationDisabled: true,
        humanModelFailureFallsBackBuiltIn: true
      },
      humanOnlyModelBudget: {
        ...this.v37HumanOnlyStats,
        policy: "all model calls reserved for human-facing turns; ambient chatter is built-in during provider stabilization"
      }
    };
  }
}
