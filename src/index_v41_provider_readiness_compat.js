// Phase 3G.8 provider-readiness and degraded-fallback compatibility owner.
// Frozen index_v37_hotfix.js remains unchanged for the v37-v40 lineage.
// V41 owns readiness/capacity classification, degraded fallback, capacity shedding,
// and constrained background suppression here.
import failoverWorker, { ChatRoom as ProviderFailoverChatRoom } from "./index_v41_provider_failover_compat.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import {
  degradedBuiltInFallbackEligible,
  effectiveStructuredProviders,
  preferredStructuredReadyProviders,
  providerCapacityConstrained as providerBudgetConstrained
} from "./provider_failover_v37.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await failoverWorker.fetch(request, env);
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
        providerDegradedModeBuiltInFallback: true,
        effectiveStructuredProviderReadiness: true,
        humanPriorityProviderBudget: true,
        ambientAiCapacityShedding: true
      }
    });
  }
};

export class ChatRoom extends ProviderFailoverChatRoom {
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
    const preferred = this.preferredStructuredReadyProviders?.(now) || [];
    if (preferred.length >= 1) return false;
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

  v37Snapshot() {
    const base = super.v37Snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        providerDegradedModeBuiltInFallback: true,
        effectiveStructuredProviderReadiness: true,
        humanPriorityProviderBudget: true,
        ambientAiCapacityShedding: true
      }
    };
  }
}
