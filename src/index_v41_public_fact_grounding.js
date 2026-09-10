import worker from "./index_v41_generation_contract.js";
import { ChatRoom as GenerationContractChatRoom } from "./index_v41_generation_contract.js";
import { ChatRoom as V41CoherenceChatRoom } from "./index_v41_coherence_repair.js";
import {
  periodSafeHumanFallbackLines
} from "./era_fallback_v41.js";
import {
  evaluatePrimaryHumanVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_identity_choice_guard.js";
import {
  WikidataPublicFactResolver,
  deterministicPublicFactLine,
  evaluatePublicFactSurface,
  planWithPublicFactGrounding,
  publicFactPolicySnapshot,
  publicFactRequest,
  unresolvedPublicFactScope
} from "./public_fact_grounding_v41.js";
import {
  unsupportedPublicFactPolicySnapshot,
  unsupportedPublicFactScope
} from "./public_fact_unsupported_guard_v41.js";

export default worker;

function clean(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export class ChatRoom extends GenerationContractChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v41PublicFactResolver = new WikidataPublicFactResolver({
      fetcher: (url, init) => this.v41FetchPublicFactSource(url, init)
    });
    this.v41PublicFactStats = {
      requestsDetected: 0,
      sourceResolved: 0,
      sourceUnresolved: 0,
      sourceUnavailable: 0,
      providerSurfacesAccepted: 0,
      providerSurfacesRejected: 0,
      groundedFallbacks: 0,
      uncertaintyFallbacks: 0,
      challengeRationalizationsBlocked: 0
    };
    this.v41LastPublicFactScope = null;
    this.v41LastPublicFactGrounding = null;
  }

  async v41FetchPublicFactSource(url, init = {}) {
    return fetch(url, init);
  }

  v41EraDateKey() {
    return typeof this.currentEraDate === "function" ? this.currentEraDate() : "";
  }

  async v41ResolvePublicFactScope(plan, human) {
    const eraDateKey = this.v41EraDateKey();
    const request = publicFactRequest({
      human,
      plan,
      history: this.history || [],
      previousScope: this.v41LastPublicFactScope
    });
    let scope = request
      ? await this.v41PublicFactResolver.resolve(request, eraDateKey)
      : unsupportedPublicFactScope({
          human,
          eraDateKey,
          previousScope: this.v41LastPublicFactScope
        });
    if (!scope) return null;

    this.v41PublicFactStats.requestsDetected += 1;
    const firstMove = Array.isArray(plan?.moves) ? plan.moves[0] : null;
    Object.assign(scope, {
      humanMessageId: clean(human?.messageId, 100),
      humanFrom: clean(human?.from, 32),
      humanTarget: clean(human?.target || "room", 32),
      humanText: clean(human?.text, 520),
      requiredSpeaker: clean(firstMove?.speaker, 32),
      requiredTarget: clean(firstMove?.target || human?.from || "room", 32),
      at: Date.now()
    });
    this.v41LastPublicFactScope = scope;

    if (scope.status === "resolved") this.v41PublicFactStats.sourceResolved += 1;
    else if (scope.status === "unavailable") this.v41PublicFactStats.sourceUnavailable += 1;
    else this.v41PublicFactStats.sourceUnresolved += 1;
    return scope;
  }

  v41PublicFactScopeMatchesHuman(scope, human) {
    if (!scope || !human) return false;
    const messageId = clean(human.messageId, 100);
    if (messageId && scope.humanMessageId) return messageId === scope.humanMessageId;
    return clean(human.from, 32) === scope.humanFrom
      && clean(human.target || "room", 32) === scope.humanTarget
      && clean(human.text, 520) === scope.humanText;
  }

  notePublicFactGrounding(scope, evaluation, surface = "", fallback = null) {
    if (!scope || !evaluation?.enforced) return;
    if (evaluation.ok) this.v41PublicFactStats.providerSurfacesAccepted += 1;
    else {
      this.v41PublicFactStats.providerSurfacesRejected += 1;
      if (evaluation.reason === "public-fact-challenge-rationalization") {
        this.v41PublicFactStats.challengeRationalizationsBlocked += 1;
      }
    }
    this.v41LastPublicFactGrounding = {
      at: Date.now(),
      ok: Boolean(evaluation.ok),
      reason: evaluation.reason || "",
      type: scope.type,
      relation: scope.relation,
      subject: scope.subject,
      trusted: Boolean(scope.trusted),
      available: Boolean(scope.available),
      status: scope.status || "unresolved",
      source: scope.source || "",
      sourceEntityId: scope.sourceEntityId || "",
      sourcePropertyId: scope.sourcePropertyId || "",
      surface: clean(surface, 220),
      fallback: fallback ? {
        speaker: fallback.speaker || "",
        target: fallback.target || "room",
        text: clean(fallback.text, 220)
      } : null
    };
  }

  async voiceBrainPlan(plan, active, human = null) {
    const factScope = await this.v41ResolvePublicFactScope(plan, human);
    const voicePlan = factScope ? planWithPublicFactGrounding(plan, factScope) : plan;
    const voiced = await V41CoherenceChatRoom.prototype.voiceBrainPlan.call(this, voicePlan, active, human);
    let evaluation = evaluatePrimaryHumanVoice({
      plan: voicePlan,
      lines: voiced,
      human,
      history: this.history || [],
      eraDateKey: this.v41EraDateKey()
    });

    if (factScope && evaluation.enforced && evaluation.ok) {
      const factEvaluation = evaluatePublicFactSurface(factScope, voiced?.[0]?.text || "");
      if (!factEvaluation.ok) {
        evaluation = {
          ...evaluation,
          ok: false,
          reason: factEvaluation.reason,
          evidence: {
            ...(evaluation.evidence || {}),
            publicFact: {
              type: factScope.type,
              relation: factScope.relation,
              subject: factScope.subject,
              trusted: Boolean(factScope.trusted),
              available: Boolean(factScope.available),
              status: factScope.status || "unresolved",
              source: factScope.source || "",
              sourceEntityId: factScope.sourceEntityId || "",
              sourcePropertyId: factScope.sourcePropertyId || ""
            }
          }
        };
      }
      this.notePublicFactGrounding(factScope, factEvaluation, voiced?.[0]?.text || "", null);
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

  v41DeterministicHumanFallback(human) {
    const eraDateKey = this.v41EraDateKey();
    let factScope = this.v41LastPublicFactScope;
    if (!this.v41PublicFactScopeMatchesHuman(factScope, human)) {
      const request = publicFactRequest({
        human,
        plan: null,
        history: this.history || [],
        previousScope: factScope
      });
      factScope = request
        ? unresolvedPublicFactScope(request, eraDateKey, "fallback-source-not-resolved")
        : unsupportedPublicFactScope({ human, eraDateKey, previousScope: factScope });
    }

    if (factScope) {
      const obligation = humanReplanPrimaryObligation({ human, history: this.history || [] });
      if (obligation.enforced && obligation.speaker && obligation.target) {
        const grounded = deterministicPublicFactLine(factScope, {
          speaker: obligation.speaker,
          target: obligation.target
        });
        const factEvaluation = evaluatePublicFactSurface(factScope, grounded?.text || "");
        if (grounded && factEvaluation.ok) {
          this.v41PublicFactStats.groundedFallbacks += 1;
          if (factScope.status !== "resolved") this.v41PublicFactStats.uncertaintyFallbacks += 1;
          this.v41LastPublicFactGrounding = {
            ...(this.v41LastPublicFactGrounding || {
              at: Date.now(),
              ok: false,
              reason: factScope.reason || "fallback",
              type: factScope.type,
              relation: factScope.relation,
              subject: factScope.subject,
              trusted: Boolean(factScope.trusted),
              available: Boolean(factScope.available),
              status: factScope.status || "unresolved",
              source: factScope.source || "",
              sourceEntityId: factScope.sourceEntityId || "",
              sourcePropertyId: factScope.sourcePropertyId || "",
              surface: ""
            }),
            fallback: {
              speaker: grounded.speaker,
              target: grounded.target,
              text: grounded.text
            }
          };
          return periodSafeHumanFallbackLines(
            [grounded],
            human,
            eraDateKey,
            this.v41EraFallbackScope(human)
          );
        }
      }
    }

    return super.v41DeterministicHumanFallback(human);
  }

  v41Snapshot(now = Date.now()) {
    const snapshot = super.v41Snapshot(now);
    return {
      ...snapshot,
      publicFactGrounding: {
        stats: { ...this.v41PublicFactStats },
        last: this.v41LastPublicFactGrounding,
        scope: this.v41LastPublicFactScope ? {
          type: this.v41LastPublicFactScope.type,
          relation: this.v41LastPublicFactScope.relation,
          subject: this.v41LastPublicFactScope.subject,
          status: this.v41LastPublicFactScope.status,
          trusted: Boolean(this.v41LastPublicFactScope.trusted),
          available: Boolean(this.v41LastPublicFactScope.available),
          source: this.v41LastPublicFactScope.source,
          sourceEntityId: this.v41LastPublicFactScope.sourceEntityId,
          sourcePropertyId: this.v41LastPublicFactScope.sourcePropertyId
        } : null,
        resolver: this.v41PublicFactResolver?.snapshot?.() || null,
        policy: {
          ...publicFactPolicySnapshot(),
          ...unsupportedPublicFactPolicySnapshot()
        }
      },
      policy: {
        ...(snapshot.policy || {}),
        directPublicFactsUseStructuredGrounding: true,
        publicFactSourceIsExternalStructuredData: true,
        recognizedUnsupportedPublicFactsFailClosedToUncertainty: true,
        historicallyAmbiguousRelationsFailClosed: true,
        publicFactChallengeCannotInventReplacementSubject: true,
        publicFactGroundingUsesNoAdditionalProviderCall: true
      }
    };
  }
}
