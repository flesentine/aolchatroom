import worker, { ChatRoom as Phase2ChatRoom } from "./index_v41_generation_contract.js";
import { ChatRoom as V41SceneChatRoom } from "./index_v41_scene_coordinator.js";
import { evaluatePrimaryHumanVoice } from "./generation_contract_v41_hardened.js";

export default worker;

export class ChatRoom extends Phase2ChatRoom {
  async voiceBrainPlan(plan, active, human = null) {
    // Bypass Phase2ChatRoom.voiceBrainPlan so the inherited v37/v40/v41 scene
    // Voice path renders exactly once, then evaluate that surface with the
    // hardened clause-order/normalization contract.
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
}
