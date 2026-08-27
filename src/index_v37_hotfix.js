import v37Worker, { ChatRoom as V37ChatRoom } from "./index_v37.js";
import { CoalescingTurnGate } from "./production_turn_gate.js";
import { stripInternalChatMetadata } from "./output_hygiene_v37.js";
import {
  emergencyWorkersBrainEligible,
  isRequestLocalProviderFailure
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
        emergencyWorkersBrainFallback: true
      }
    });
  }
};

export class ChatRoom extends V37ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
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
      emergencyWorkersBrainRoutes: 0
    };
    this.v37ProductionTurnGate = new CoalescingTurnGate({
      run: (source, forceSoon) => this.runV37BaseProductionTurn(source, forceSoon),
      maxReplays: 2,
      onCoalesce: () => { this.v37ProductionTurnStats.coalescedRequests += 1; },
      onReplay: () => { this.v37ProductionTurnStats.replayTurns += 1; },
      onDeferred: () => { this.v37ProductionTurnStats.deferredAfterReplayCap += 1; }
    });
  }

  async runV37BaseProductionTurn(source, forceSoon = false) {
    this.v37ProductionTurnStats.baseTurnsStarted += 1;
    try {
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
    if (isRequestLocalProviderFailure(status)) {
      this.v37ProductionTurnStats.requestLocalProviderRejects += 1;
      // 400/413/422 describe this request, not provider availability. Treat them
      // like unusable model output so the existing soft-reject circuit can back off
      // repeated bad requests without poisoning the provider's global hard-health
      // cooldown used by unrelated Brain/Voice work.
      return this.noteOutputReject?.(
        provider,
        `HTTP ${Number(status)} request rejected: ${String(detail || "provider request rejected").slice(0, 120)}`
      );
    }
    // 429/5xx/network/credential failures remain true provider-health events. In
    // particular, preserve Retry-After on 429 rather than hammering the provider.
    return super.noteProviderFailure(provider, status, response, detail);
  }

  orderedReadyProviders(now = Date.now()) {
    const ordered = super.orderedReadyProviders(now);
    const configured = this.configuredProviders?.() || [];
    const workersHardReady = configured.includes("workers-ai")
      && (typeof this.providerReady !== "function" || this.providerReady("workers-ai", now));

    if (!emergencyWorkersBrainEligible({
      orderedProviders: ordered,
      structuredBrainDepth: this.v35StructuredBrainDepth,
      configuredProviders: configured,
      workersHardReady
    })) return ordered;

    // v35 intentionally keeps Workers AI out of normal structured Brain traffic
    // because Gemini/Groq produce better structured plans. Only restore Workers AI
    // when BOTH preferred structured providers are unavailable. This is a degraded
    // emergency route, not a new normal provider priority.
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
    return {
      requestLocalStatuses: [400, 413, 422],
      rateLimitRetryAfterPreserved: true,
      preferredStructuredProviders: ["gemini", "groq"],
      emergencyBrainProvider: "workers-ai",
      emergencyOnlyWhenPreferredUnavailable: true,
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
        emergencyWorkersBrainFallback: true
      },
      productionTurn: {
        ...this.v37ProductionTurnStats,
        gate
      },
      providerFailover: this.v37ProviderFailoverSnapshot(Date.now())
    };
  }
}
