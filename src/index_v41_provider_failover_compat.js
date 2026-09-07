// Phase 3G.9 provider-failure, quota, and emergency-routing compatibility owner.
// Frozen index_v37_hotfix.js remains unchanged for the v37-v40 lineage.
// V41 owns provider failure classification, Workers AI daily-quota state,
// emergency structured routing, and merged failover diagnostics here.
import residualWorker, { ChatRoom as ResidualHotfixChatRoom } from "./index_v41_hotfix_residual_compat.js";
import {
  emergencyWorkersBrainEligible,
  isRequestLocalProviderFailure,
  isWorkersAiDailyQuotaExhaustion,
  nextUtcDailyQuotaResetAt
} from "./provider_failover_v37.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await residualWorker.fetch(request, env);
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
        requestLocalProviderFailuresDoNotTripGlobalCooldown: true,
        emergencyWorkersBrainFallback: true,
        workersAiDailyQuotaState: true
      }
    });
  }
};

export class ChatRoom extends ResidualHotfixChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37WorkersDailyQuotaResetAt = 0;
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
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        requestLocalProviderFailuresDoNotTripGlobalCooldown: true,
        emergencyWorkersBrainFallback: true,
        workersAiDailyQuotaState: true
      },
      providerFailover: this.v37ProviderFailoverSnapshot(Date.now())
    };
  }
}
