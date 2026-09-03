import worker, { ChatRoom as Phase2ChatRoom } from "./index_v41_generation_contract_base.js";
import { ChatRoom as V41SceneChatRoom } from "./index_v41_scene_coordinator.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import { periodSafeHumanFallbackLines } from "./era_fallback_v41.js";
import {
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice
} from "./generation_contract_v41_identity_choice_guard.js";

export default worker;

function clean(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export class ChatRoom extends Phase2ChatRoom {
  async voiceBrainPlan(plan, active, human = null) {
    // Render Voice exactly once through the inherited scene/Director stack,
    // then apply the final Phase 2A adversarial validation contract.
    // All Phase 2B fail-closed behavior remains inherited from Phase2ChatRoom.
    const voiced = await V41SceneChatRoom.prototype.voiceBrainPlan.call(this, plan, active, human);
    const evaluation = evaluatePrimaryHumanVoice({
      plan,
      lines: voiced,
      human,
      history: this.history || [],
      // Phase 2 semantic completeness must never overrule the sealed 1996
      // world inherited from v13. Supplying the room's mirror-date lets the
      // evaluator prefer period-correct ignorance when a human introduces a
      // future product or behavior.
      eraDateKey: typeof this.currentEraDate === "function" ? this.currentEraDate() : ""
    });
    this.noteGenerationContract(evaluation, plan, voiced, human);
    if (!evaluation.enforced || evaluation.ok) return voiced;

    this.broadcast?.({
      type: "generation_contract",
      action: "v41-primary-voice-rejected",
      reason: evaluation.reason,
      speaker: evaluation.contract?.move?.speaker || "",
      target: evaluation.contract?.move?.target || human?.from || "room",
      requirements: evaluation.contract?.requirements || [],
      at: Date.now()
    });
    return [];
  }

  v41EraFallbackScope(human) {
    const last = this.v41LastGenerationContract;
    if (!last?.human || !human) return "";
    if (clean(last.human.from, 32) !== clean(human.from, 32)) return "";
    if (clean(last.human.text, 180) !== clean(human.text, 180)) return "";
    const move = last.move || {};
    return clean([
      move.subject,
      move.goal,
      move.meaning,
      move.topic,
      JSON.stringify(move)
    ].filter(Boolean).join(" "), 1200);
  }

  v41DeterministicHumanFallback(human) {
    // Keep the provider-independent Phase 2B emergency path explicit at the
    // canonical production boundary. Never dynamically dispatch through later
    // provider-aware builtInHumanReply overrides.
    const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
    const eraDateKey = typeof this.currentEraDate === "function" ? this.currentEraDate() : "";
    return periodSafeHumanFallbackLines(fallback, human, eraDateKey, this.v41EraFallbackScope(human));
  }

  async generateHumanReplan(human) {
    // v37 also has its own provider-independent v14 fallback when Voice returns
    // empty. Post-process the completed inherited path so either fallback route
    // is period-safe without changing responder selection or provider routing.
    const lines = await super.generateHumanReplan(human);
    const eraDateKey = typeof this.currentEraDate === "function" ? this.currentEraDate() : "";
    return periodSafeHumanFallbackLines(lines, human, eraDateKey, this.v41EraFallbackScope(human));
  }

  async handlePendingHumanWithAi(now = Date.now()) {
    return super.handlePendingHumanWithAi(now);
  }

  v41Snapshot(now = Date.now()) {
    const snapshot = super.v41Snapshot(now);
    const stats = snapshot.generationContract?.stats || {};
    return {
      ...snapshot,
      phase: "2B",
      generationContract: {
        ...(snapshot.generationContract || {}),
        stats: {
          ...stats,
          humanReplanFailClosedConsumes: Number(stats.humanReplanFailClosedConsumes || 0)
        }
      },
      policy: {
        ...(snapshot.policy || {}),
        invalidValidatedFallbackConsumesLegacyRetry: true,
        missingRequiredHumanReplanResponseDropsEntireTail: true,
        failedHumanReplanUsesProviderIndependentV14Fallback: true,
        failedHumanReplanUsesOnlyValidatedBuiltInFallback: true,
        semanticCompletenessDefersToSealed1996World: true,
        deterministicFallbackDefersToSealed1996World: true,
        deterministicFallbackScopesMixedEraTurns: true
      }
    };
  }
}

// Imported through the final guard contract and intentionally kept visible here:
// Phase 2B structural validation remains the inherited implementation's gate.
void evaluateHumanReplanPrimaryResponse;
