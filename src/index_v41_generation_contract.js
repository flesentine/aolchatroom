import worker, { ChatRoom as Phase2ChatRoom } from "./index_v41_generation_contract_base.js";
import { ChatRoom as V41SceneChatRoom } from "./index_v41_scene_coordinator.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import {
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice
} from "./generation_contract_v41_hardened.js";

export default worker;

export class ChatRoom extends Phase2ChatRoom {
  async voiceBrainPlan(plan, active, human = null) {
    // Render Voice exactly once through the inherited scene/Director stack,
    // then apply the hardened Phase 2A clause-order/normalization contract.
    // All Phase 2B fail-closed behavior remains inherited from Phase2ChatRoom.
    const voiced = await V41SceneChatRoom.prototype.voiceBrainPlan.call(this, plan, active, human);
    const evaluation = evaluatePrimaryHumanVoice({
      plan,
      lines: voiced,
      human,
      history: this.history || []
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

  v41DeterministicHumanFallback(human) {
    // Keep the provider-independent Phase 2B emergency path explicit at the
    // canonical production boundary. Never dynamically dispatch through later
    // provider-aware builtInHumanReply overrides.
    return ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
  }

  async generateHumanReplan(human) {
    // Phase 2B implementation remains in the byte-preserved base class; this
    // forward keeps the fail-closed boundary explicit in the canonical wrapper.
    return super.generateHumanReplan(human);
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
        failedHumanReplanUsesOnlyValidatedBuiltInFallback: true
      }
    };
  }
}

// Imported through the hardened contract and intentionally kept visible here:
// Phase 2B structural validation remains the inherited implementation's gate.
void evaluateHumanReplanPrimaryResponse;
