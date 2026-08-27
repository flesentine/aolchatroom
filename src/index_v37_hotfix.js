import v37Worker, { ChatRoom as V37ChatRoom } from "./index_v37.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import { CoalescingTurnGate } from "./production_turn_gate.js";
import { stripInternalChatMetadata } from "./output_hygiene_v37.js";
import {
  degradedBuiltInFallbackEligible,
  effectiveStructuredProviders,
  emergencyWorkersBrainEligible,
  isRequestLocalProviderFailure,
  isWorkersAiDailyQuotaExhaustion,
  nextUtcDailyQuotaResetAt,
  preferredStructuredReadyProviders,
  providerCapacityConstrained as providerBudgetConstrained
} from "./provider_failover_v37.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await v37Worker.fetch(request, env);
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
        productionTurnSingleFlight: true,
        productionTurnReplayCoalescing: true,
        liveAiShadowPausedForProviderStability: true,
        liveAiShadowResumedAfterSingleFlightValidation: false,
        shadowPacketsStillRecordedWhileModelPaused: true,
        internalMetadataOutputHygiene: true,
        requestLocalProviderFailuresDoNotTripGlobalCooldown: true,
        emergencyWorkersBrainFallback: true,
        providerDegradedModeBuiltInFallback: true,
        effectiveStructuredProviderReadiness: true,
        workersAiDailyQuotaState: true,
        humanPriorityProviderBudget: true,
        ambientAiCapacityShedding: true
      }
    });
  }
};

export class ChatRoom extends V37ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37WorkersDailyQuotaResetAt = 0;
    this.v37ProductionTurnStats = {
      outerRequests: 0,
      tickRequests: 0,
      alarmRequests: 0,
      forceRequests: 0,
      baseTurnsStarted: 0,
      baseTurnsCompleted: 0,
      coalescedRequests: 0,
      replayTurns: 0,
      deferredAfterReplayCap: 0,
      maxConcurrentBaseTurns: 0,
      liveAiShadowPauses: 0,
      internalMetadataStrips: 0,
      internalMetadataDroppedLines: 0,
      requestLocalProviderRejects: 0,
      emergencyWorkersBrainRoutes: 0,
      workersDailyQuotaExhaustions: 0,
      degradedModeTicks: 0,
      degradedHumanFallbacksQueued: 0,
      degradedAmbientFallbacksQueued: 0,
      degradedFallbackMisses: 0,
      constrainedModeTicks: 0,
      backgroundAiPlansSuppressed: 0,
      capacitySheddingAmbientQueued: 0
    };
    this.v37ProductionTurnGate = new CoalescingTurnGate({
      run: (source, forceSoon) => this.runV37BaseProductionTurn(source, forceSoon),
      maxReplays: 2,
      onCoalesce: () => { this.v37ProductionTurnStats.coalescedRequests += 1; },
      onReplay: () => { this.v37ProductionTurnStats.replayTurns += 1; },
      onDeferred: () => { this.v37ProductionTurnStats.deferredAfterReplayCap += 1; }
    });
  }

  hardReadyProviders(now = Date.now()) {
    const configured = this.configuredProviders?.() || [];
    if (typeof this.providerReady !== "function") return configured;
    return configured.filter((provider) => this.providerReady(provider, now));
  }

  softReadyProviders(now = Date.now()) {
    const hardReady = this.hardReadyProviders(now);
    if (typeof this.softReady !== "function") return hardReady;
    return hardReady.filter((provider) => this.softReady(provider, now));
  }

  preferredStructuredReadyProviders(now = Date.now()) {
    return preferredStructuredReadyProviders({
      configuredProviders: this.configuredProviders?.() || [],
      hardReadyProviders: this.hardReadyProviders(now),
      softReadyProviders: this.softReadyProviders(now)
    });
  }

  providerCapacityConstrained(now = Date.now()) {
    return providerBudgetConstrained({
      configuredProviders: this.configuredProviders?.() || [],
      hardReadyProviders: this.hardReadyProviders(now),
      softReadyProviders: this.softReadyProviders(now),
      minimumPreferredReady: 2
    });
  }

  effectiveStructuredReadyProviders(now = Date.now()) {
    return effectiveStructuredProviders({
      configuredProviders: this.configuredProviders?.() || [],
      hardReadyProviders: this.hardReadyProviders(now),
      softReadyProviders: this.softReadyProviders(now)
    });
  }

  providerPoolDegraded(now = Date.now()) {
    return degradedBuiltInFallbackEligible({
      configuredProviders: this.configuredProviders?.() || [],
      effectiveReadyProviders: this.effectiveStructuredReadyProviders(now)
    });
  }

  queueV37DegradedFallback(now = Date.now(), forceSoon = false) {
    if (!this.providerPoolDegraded(now)) return false;
    this.v37ProductionTurnStats.degradedModeTicks += 1;

    const retryMs = typeof this.shortestCooldownMs === "function"
      ? Math.max(0, Number(this.shortestCooldownMs(now) || 0))
      : 0;
    const retrySeconds = Math.max(1, Math.ceil((retryMs || 1000) / 1000));
    let queued = 0;

    if (this.pendingHumans?.length) {
      const human = this.pendingHumans.shift();
      const replies = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
      if (replies.length) queued = Number(this.queueAiLines?.(replies.slice(0, 3), "human") || 0);

      if (!queued) {
        this.pendingHumans.unshift(human);
        this.v37ProductionTurnStats.degradedFallbackMisses += 1;
      } else {
        this.v37ProductionTurnStats.degradedHumanFallbacksQueued += queued;
      }
    } else if (!(this.aiQueue?.length) && (forceSoon || now >= Number(this.nextBotAt || 0))) {
      const ambient = ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this);
      if (ambient) queued = Number(this.queueAiLines?.([ambient], "scene") || 0);
      if (queued) this.v37ProductionTurnStats.degradedAmbientFallbacksQueued += queued;
    }

    this.setAiStatus?.(`AI degraded · built-in fallback active · provider retry in ~${retrySeconds}s`);
    return queued > 0;
  }

  queueV37CapacitySheddingAmbient(now = Date.now(), forceSoon = false) {
    if (this.providerPoolDegraded(now) || !this.providerCapacityConstrained(now)) return false;
    this.v37ProductionTurnStats.constrainedModeTicks += 1;
    if (this.pendingHumans?.length || this.aiQueue?.length) return false;
    if (!forceSoon && now < Number(this.nextBotAt || 0)) return false;

    const ambient = ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this);
    if (!ambient) return false;
    const queued = Number(this.queueAiLines?.([ambient], "scene") || 0);
    if (!queued) return false;

    this.v37ProductionTurnStats.capacitySheddingAmbientQueued += queued;
    this.setAiStatus?.("AI constrained · human-priority · ambient built-in");
    return true;
  }

  async refillSceneAi(now = Date.now(), force = false) {
    if (this.providerCapacityConstrained(now)) {
      this.v37ProductionTurnStats.backgroundAiPlansSuppressed += 1;
      return false;
    }
    return super.refillSceneAi(now, force);
  }

  async runV37BaseProductionTurn(source, forceSoon = false) {
    this.v37ProductionTurnStats.baseTurnsStarted += 1;
    try {
      const now = Date.now();
      this.queueV37DegradedFallback(now, Boolean(forceSoon));
      this.queueV37CapacitySheddingAmbient(now, Boolean(forceSoon));

      if (source === "alarm") {
        const result = await super.alarm();
        this.maybeRunV37Shadow(Date.now());
        return result;
      }
      return await super.tick(Boolean(forceSoon));
    } finally {
      this.v37ProductionTurnStats.baseTurnsCompleted += 1;
      const gate = this.v37ProductionTurnGate?.snapshot?.();
      if (gate) {
        this.v37ProductionTurnStats.maxConcurrentBaseTurns = Math.max(
          this.v37ProductionTurnStats.maxConcurrentBaseTurns,
          Number(gate.maxConcurrent || 0)
        );
      }
    }
  }

  requestV37ProductionTurn(source, forceSoon = false) {
    this.v37ProductionTurnStats.outerRequests += 1;
    if (source === "alarm") this.v37ProductionTurnStats.alarmRequests += 1;
    else this.v37ProductionTurnStats.tickRequests += 1;
    if (forceSoon) this.v37ProductionTurnStats.forceRequests += 1;
    return this.v37ProductionTurnGate.request(source, Boolean(forceSoon));
  }

  async tick(forceSoon = false) {
    return this.requestV37ProductionTurn("tick", forceSoon);
  }

  async alarm() {
    return this.requestV37ProductionTurn("alarm", false);
  }

  noteProviderFailure(provider, status = 0, response = null, detail = "") {
    if (isWorkersAiDailyQuotaExhaustion(provider, detail)) {
      const now = Date.now();
      const resetAt = nextUtcDailyQuotaResetAt(now);
      this.v37ProductionTurnStats.workersDailyQuotaExhaustions += 1;
      this.v37WorkersDailyQuotaResetAt = Math.max(Number(this.v37WorkersDailyQuotaResetAt || 0), resetAt);

      const result = super.noteProviderFailure(provider, status, response, detail);
      if (this.providerCooldownUntil instanceof Map) {
        this.providerCooldownUntil.set(
          provider,
          Math.max(Number(this.providerCooldownUntil.get(provider) || 0), resetAt)
        );
      }
      this.providerLastDetail?.set?.(
        provider,
        `daily Workers AI quota exhausted · resets ${new Date(resetAt).toISOString()}`
      );
      return result;
    }

    if (isRequestLocalProviderFailure(status)) {
      this.v37ProductionTurnStats.requestLocalProviderRejects += 1;
      return this.noteOutputReject?.(
        provider,
        `HTTP ${Number(status)} request rejected: ${String(detail || "provider request rejected").slice(0, 120)}`
      );
    }
    return super.noteProviderFailure(provider, status, response, detail);
  }

  orderedReadyProviders(now = Date.now()) {
    const ordered = super.orderedReadyProviders(now);
    const configured = this.configuredProviders?.() || [];
    const workersHardReady = configured.includes("workers-ai")
      && (typeof this.providerReady !== "function" || this.providerReady("workers-ai", now));
    const workersSoftReady = typeof this.softReady !== "function" || this.softReady("workers-ai", now);

    if (!emergencyWorkersBrainEligible({
      orderedProviders: ordered,
      structuredBrainDepth: this.v35StructuredGenerationDepth,
      configuredProviders: configured,
      workersHardReady,
      workersSoftReady
    })) return ordered;

    this.v37ProductionTurnStats.emergencyWorkersBrainRoutes += 1;
    return ["workers-ai"];
  }

  maybeRunV37Shadow(now = Date.now()) {
    this.expireOldV37Shadows?.(now);
    const pending = this.v37PendingShadows?.[0];
    if (!pending?.shadow) return;
    if (pending.shadow.ai?.deferReason !== "live-model-shadow-paused") {
      this.v37ProductionTurnStats.liveAiShadowPauses += 1;
      pending.shadow.ai.status = "deferred-production-priority";
      pending.shadow.ai.deferReason = "live-model-shadow-paused";
      pending.shadow.ai.error = "live Director model calls paused after provider retry recurrence";
      this.replaceShadowHistory?.(pending.shadow);
    }
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const original = String(text || "");
    if (kind !== "bot") return super.say(from, original, kind, source, meta);

    const sanitized = stripInternalChatMetadata(original);
    if (sanitized !== original) this.v37ProductionTurnStats.internalMetadataStrips += 1;
    if (!sanitized) {
      this.v37ProductionTurnStats.internalMetadataDroppedLines += 1;
      return false;
    }
    return super.say(from, sanitized, kind, source, meta);
  }

  v37ProviderFailoverSnapshot(now = Date.now()) {
    const cooldowns = {};
    for (const provider of this.configuredProviders?.() || []) {
      cooldowns[provider] = {
        hardReady: typeof this.providerReady !== "function" ? true : this.providerReady(provider, now),
        hardCooldownRemainingMs: Math.max(0, Number(this.providerCooldownUntil?.get(provider) || 0) - now),
        softReady: typeof this.softReady !== "function" ? true : this.softReady(provider, now),
        softCooldownRemainingMs: Math.max(0, Number(this.providerSoftRejectUntil?.get(provider) || 0) - now)
      };
    }
    const workersResetAt = Math.max(0, Number(this.v37WorkersDailyQuotaResetAt || 0));
    const preferredReady = this.preferredStructuredReadyProviders(now);
    const constrained = this.providerCapacityConstrained(now);
    return {
      requestLocalStatuses: [400, 413, 422],
      rateLimitRetryAfterPreserved: true,
      preferredStructuredProviders: ["gemini", "groq"],
      preferredStructuredReadyProviders: preferredReady,
      providerCapacityConstrained: constrained,
      humanPriorityModelBudget: true,
      ambientAiSuppressedWhenConstrained: true,
      emergencyBrainProvider: "workers-ai",
      emergencyOnlyWhenPreferredUnavailable: true,
      degradedModeBuiltInFallback: true,
      workersAiDailyQuotaState: true,
      workersAiDailyQuotaExhausted: workersResetAt > now,
      workersAiDailyQuotaResetAt: workersResetAt > now ? new Date(workersResetAt).toISOString() : null,
      workersAiDailyQuotaResetRemainingMs: Math.max(0, workersResetAt - now),
      hardReadyProviders: this.hardReadyProviders(now),
      softReadyProviders: this.softReadyProviders(now),
      effectiveStructuredReadyProviders: this.effectiveStructuredReadyProviders(now),
      providerPoolDegraded: this.providerPoolDegraded(now),
      cooldowns
    };
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    const gate = this.v37ProductionTurnGate.snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        productionTurnSingleFlight: true,
        productionTurnReplayCoalescing: true,
        liveAiShadowPausedForProviderStability: true,
        liveAiShadowResumedAfterSingleFlightValidation: false,
        shadowPacketsStillRecordedWhileModelPaused: true,
        internalMetadataOutputHygiene: true,
        requestLocalProviderFailuresDoNotTripGlobalCooldown: true,
        emergencyWorkersBrainFallback: true,
        providerDegradedModeBuiltInFallback: true,
        effectiveStructuredProviderReadiness: true,
        workersAiDailyQuotaState: true,
        humanPriorityProviderBudget: true,
        ambientAiCapacityShedding: true
      },
      productionTurn: {
        ...this.v37ProductionTurnStats,
        gate
      },
      providerFailover: this.v37ProviderFailoverSnapshot(Date.now())
    };
  }
}
