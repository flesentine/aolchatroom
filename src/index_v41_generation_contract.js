import worker, { ChatRoom as Phase2ChatRoom } from "./index_v41_generation_contract_base.js";
import { ChatRoom as V41CoherenceChatRoom } from "./index_v41_coherence_repair.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import {
  periodSafeHumanFallbackLines,
  trustedGenerationContractScope
} from "./era_fallback_v41.js";
import {
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_identity_choice_guard.js";
import {
  deterministicPublicMediaLine,
  evaluatePublicMediaSurface,
  planWithPublicMediaGrounding,
  publicMediaCatalogSnapshot,
  publicMediaFactScope
} from "./public_media_fact_grounding_v41.js";
import {
  CoalescingHistoryWriter,
  V41_HISTORY_LIMIT
} from "./history_persistence_v41.js";

export default worker;

export class ChatRoom extends Phase2ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v41HistoryWriter = new CoalescingHistoryWriter({
      read: () => this.history || [],
      assign: (rows) => { this.history = rows; },
      write: (rows) => this.ctx.storage.put("history", rows),
      limit: V41_HISTORY_LIMIT
    });
    this.v41PublicMediaStats = {
      scopesDetected: 0,
      trustedScopes: 0,
      providerSurfacesAccepted: 0,
      providerSurfacesRejected: 0,
      groundedFallbacks: 0,
      uncertaintyFallbacks: 0,
      challengeRationalizationsBlocked: 0
    };
    this.v41LastPublicMediaGrounding = null;
  }

  persistHistory() {
    return this.v41HistoryWriter.request();
  }

  v41PublicMediaScope(human) {
    return publicMediaFactScope({
      human,
      history: this.history || [],
      eraDateKey: typeof this.currentEraDate === "function" ? this.currentEraDate() : ""
    });
  }

  notePublicMediaGrounding(scope, evaluation, surface = "", fallback = null) {
    if (!scope || !evaluation?.enforced) return;
    this.v41PublicMediaStats.scopesDetected += 1;
    if (scope.trusted) this.v41PublicMediaStats.trustedScopes += 1;
    if (evaluation.ok) this.v41PublicMediaStats.providerSurfacesAccepted += 1;
    else {
      this.v41PublicMediaStats.providerSurfacesRejected += 1;
      if (evaluation.reason === "public-media-challenge-rationalization") {
        this.v41PublicMediaStats.challengeRationalizationsBlocked += 1;
      }
    }
    this.v41LastPublicMediaGrounding = {
      at: Date.now(),
      ok: Boolean(evaluation.ok),
      reason: evaluation.reason || "",
      type: scope.type,
      kind: scope.kind,
      title: scope.title,
      trusted: Boolean(scope.trusted),
      available: Boolean(scope.available),
      source: scope.source || "",
      surface: String(surface || "").replace(/\s+/g, " ").trim().slice(0, 220),
      fallback: fallback ? {
        speaker: fallback.speaker || "",
        target: fallback.target || "room",
        text: String(fallback.text || "").replace(/\s+/g, " ").trim().slice(0, 220)
      } : null
    };
  }

  async voiceBrainPlan(plan, active, human = null) {
    const mediaScope = this.v41PublicMediaScope(human);
    const voicePlan = mediaScope ? planWithPublicMediaGrounding(plan, mediaScope) : plan;
    const voiced = await V41CoherenceChatRoom.prototype.voiceBrainPlan.call(this, voicePlan, active, human);
    let evaluation = evaluatePrimaryHumanVoice({
      plan: voicePlan,
      lines: voiced,
      human,
      history: this.history || [],
      eraDateKey: typeof this.currentEraDate === "function" ? this.currentEraDate() : ""
    });

    if (mediaScope && evaluation.enforced && evaluation.ok) {
      const mediaEvaluation = evaluatePublicMediaSurface(mediaScope, voiced?.[0]?.text || "");
      if (!mediaEvaluation.ok) {
        evaluation = {
          ...evaluation,
          ok: false,
          reason: mediaEvaluation.reason,
          evidence: {
            ...(evaluation.evidence || {}),
            publicMedia: {
              type: mediaScope.type,
              kind: mediaScope.kind,
              title: mediaScope.title,
              trusted: Boolean(mediaScope.trusted),
              available: Boolean(mediaScope.available),
              source: mediaScope.source || ""
            }
          }
        };
      }
      this.notePublicMediaGrounding(mediaScope, mediaEvaluation, voiced?.[0]?.text || "", null);
    }

    this.noteGenerationContract(evaluation, voicePlan, voiced, human);
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
    const eraDateKey = typeof this.currentEraDate === "function" ? this.currentEraDate() : "";
    const mediaScope = this.v41PublicMediaScope(human);
    if (mediaScope) {
      const obligation = humanReplanPrimaryObligation({ human, history: this.history || [] });
      if (obligation.enforced && obligation.speaker && obligation.target) {
        const grounded = deterministicPublicMediaLine(mediaScope, {
          speaker: obligation.speaker,
          target: obligation.target
        });
        const mediaEvaluation = evaluatePublicMediaSurface(mediaScope, grounded?.text || "");
        if (grounded && mediaEvaluation.ok) {
          this.v41PublicMediaStats.groundedFallbacks += 1;
          if (!mediaScope.trusted) this.v41PublicMediaStats.uncertaintyFallbacks += 1;
          if (this.v41LastPublicMediaGrounding) {
            this.v41LastPublicMediaGrounding = {
              ...this.v41LastPublicMediaGrounding,
              fallback: {
                speaker: grounded.speaker,
                target: grounded.target,
                text: grounded.text
              }
            };
          }
          return periodSafeHumanFallbackLines(
            [grounded],
            human,
            eraDateKey,
            this.v41EraFallbackScope(human)
          );
        }
      }
    }

    const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
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

  async webSocketMessage(ws, message) {
    if (typeof message === "string" && (message === "debug-refresh" || message === "pulse")) {
      // O1: both the new diagnostic refresh and legacy cached-client pulses are
      // non-scheduling messages. Normal clients use Cloudflare's ping/pong
      // auto-response and server alarms remain the sole room-liveness scheduler.
      const attachment = ws?.deserializeAttachment?.() || {};
      if (attachment.debug) this.sendDebug?.(ws, attachment.name || "Guest");
      return;
    }
    return super.webSocketMessage(ws, message);
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
      publicMediaFactGrounding: {
        stats: { ...this.v41PublicMediaStats },
        last: this.v41LastPublicMediaGrounding,
        catalog: publicMediaCatalogSnapshot()
      },
      historyPersistence: this.v41HistoryWriter?.snapshot?.() || null,
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
        degradedHumanFallbackPreservesPhase2BPrimarySlot: true,
        historyPersistenceSingleFlight: true,
        historyPersistenceSchemaPreserved: true,
        directPublicMediaFactsMustBeGrounded: true,
        unknownPublicMediaDetailsFailClosedToUncertainty: true,
        factualChallengeCannotInventReplacementTitle: true,
        publicMediaGroundingUsesNoAdditionalProviderCall: true
      }
    };
  }
}

void evaluateHumanReplanPrimaryResponse;
