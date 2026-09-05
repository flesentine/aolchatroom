import worker, { ChatRoom as Phase2ChatRoom } from "./index_v41_generation_contract_base.js";
import { ChatRoom as V41CoherenceChatRoom } from "./index_v41_coherence_repair.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import {
  periodSafeHumanFallbackLines,
  trustedGenerationContractScope
} from "./era_fallback_v41.js";
import {
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice
} from "./generation_contract_v41_identity_choice_guard.js";

export default worker;

export class ChatRoom extends Phase2ChatRoom {
  async voiceBrainPlan(plan, active, human = null) {
    const voiced = await V41CoherenceChatRoom.prototype.voiceBrainPlan.call(this, plan, active, human);
    const evaluation = evaluatePrimaryHumanVoice({
      plan,
      lines: voiced,
      human,
      history: this.history || [],
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
    return trustedGenerationContractScope(this.v41LastGenerationContract, human);
  }

  v41DeterministicHumanFallback(human) {
    const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
    const eraDateKey = typeof this.currentEraDate === "function" ? this.currentEraDate() : "";
    return periodSafeHumanFallbackLines(fallback, human, eraDateKey, this.v41EraFallbackScope(human));
  }

  async generateHumanReplan(human) {
    // Semantic fallback scope must be created by this exact replan.
    this.v41LastGenerationContract = null;
    const lines = await super.generateHumanReplan(human);
    const eraDateKey = typeof this.currentEraDate === "function" ? this.currentEraDate() : "";
    return periodSafeHumanFallbackLines(lines, human, eraDateKey, this.v41EraFallbackScope(human));
  }

  queueV37DegradedFallback(now = Date.now(), forceSoon = false) {
    if (!this.providerPoolDegraded?.(now)) return false;

    // v37's degraded human path runs before normal replanning and therefore
    // bypasses generateHumanReplan(). Intercept only that human branch here;
    // the inherited ambient degraded path remains byte-for-byte authoritative.
    if (!this.pendingHumans?.length) return super.queueV37DegradedFallback(now, forceSoon);

    this.v37ProductionTurnStats.degradedModeTicks += 1;
    const retryMs = typeof this.shortestCooldownMs === "function"
      ? Math.max(0, Number(this.shortestCooldownMs(now) || 0))
      : 0;
    const retrySeconds = Math.max(1, Math.ceil((retryMs || 1000) / 1000));

    const human = this.pendingHumans.shift();
    this.v41LastGenerationContract = null;
    const replies = this.v41DeterministicHumanFallback(human) || [];
    const evaluation = evaluateHumanReplanPrimaryResponse({
      lines: replies,
      human,
      history: this.history || []
    });
    const rejected = Boolean(evaluation?.enforced && !evaluation.ok);
    let queued = 0;

    if (rejected) {
      // Total-provider degradation must not bypass Phase 2B's first-responder
      // ownership contract. Consume an invalid deterministic fallback instead
      // of repeatedly queueing/retrying a reply from the wrong bot.
      this.v41GenerationStats.humanReplanFallbackRejects += 1;
      this.v41GenerationStats.humanReplanFailClosedConsumes += 1;
      this.noteHumanReplanContract?.(evaluation, replies, human, null);
      this.broadcast?.({
        type: "generation_contract",
        action: "v41-degraded-human-fallback-fail-closed",
        reason: evaluation.reason || "",
        expectedSpeaker: evaluation.obligation?.speaker || "",
        expectedTarget: evaluation.obligation?.target || human?.from || "",
        discardedLines: Array.isArray(replies) ? replies.length : 0,
        at: Date.now()
      });
    } else if (replies.length) {
      queued = Number(this.queueAiLines?.(replies.slice(0, 3), "human") || 0);
    }

    if (!queued) {
      if (!rejected) this.pendingHumans.unshift(human);
      this.v37ProductionTurnStats.degradedFallbackMisses += 1;
    } else {
      this.v37ProductionTurnStats.degradedHumanFallbacksQueued += queued;
    }

    this.setAiStatus?.(`AI degraded · built-in fallback active · provider retry in ~${retrySeconds}s`);
    return queued > 0;
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
        deterministicFallbackScopesMixedEraTurns: true,
        deterministicFallbackRequiresFreshGenerationScope: true,
        degradedHumanFallbackDefersToSealed1996World: true,
        degradedHumanFallbackPreservesPhase2BPrimarySlot: true
      }
    };
  }
}

void evaluateHumanReplanPrimaryResponse;
