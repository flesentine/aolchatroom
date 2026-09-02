import worker, { RuntimeGenerationContractRoom as BaseRuntimeRoom } from "./runtime_generation_contract_worker.js";
import { ChatRoom as V41SceneChatRoom } from "../src/index_v41_scene_coordinator.js";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_hardened.js";

export default worker;

export class RuntimeGenerationContractRoom extends BaseRuntimeRoom {
  async voiceBrainPlan(plan, active, human = null) {
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
