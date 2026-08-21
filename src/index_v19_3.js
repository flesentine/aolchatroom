import baseWorker, { ChatRoom as ProviderOutputChatRoom } from "./index_v19_2_live.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];

function blankQuality() {
  return {
    attempts: 0,
    successes: 0,
    failures: 0,
    outputRejects: 0,
    acceptedLines: 0,
    totalLatencyMs: 0,
    lastLatencyMs: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        room: "Town Square",
        simulatedDate: simulatedDateLabel(),
        simulatedDateTime: simulatedDateTimeLabel(),
        pass: "gemini-first-router-v19.3",
        providerPriority: PROVIDER_PRIORITY,
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }
    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends ProviderOutputChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.providerQuality = new Map();
  }

  qualityFor(provider) {
    if (!this.providerQuality.has(provider)) this.providerQuality.set(provider, blankQuality());
    return this.providerQuality.get(provider);
  }

  orderedReadyProviders(now = Date.now()) {
    const configured = new Set(this.configuredProviders());
    return PROVIDER_PRIORITY.filter((provider) => configured.has(provider) && this.providerReady(provider, now));
  }

  async callProvider(provider, prompt, maxTokens) {
    const quality = this.qualityFor(provider);
    quality.attempts += 1;
    return super.callProvider(provider, prompt, maxTokens);
  }

  noteProviderSuccess(provider, model, latencyMs, messageCount) {
    const quality = this.qualityFor(provider);
    quality.successes += 1;
    quality.acceptedLines += Number(messageCount || 0);
    quality.totalLatencyMs += Number(latencyMs || 0);
    quality.lastLatencyMs = Number(latencyMs || 0);
    quality.lastSuccessAt = Date.now();
    return super.noteProviderSuccess(provider, model, latencyMs, messageCount);
  }

  noteProviderFailure(provider, status = 0, response = null, detail = "") {
    const quality = this.qualityFor(provider);
    quality.failures += 1;
    quality.lastFailureAt = Date.now();
    return super.noteProviderFailure(provider, status, response, detail);
  }

  noteOutputReject(provider, detail) {
    const quality = this.qualityFor(provider);
    quality.outputRejects += 1;
    return super.noteOutputReject(provider, detail);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status") return response;

    try {
      const data = await response.json();
      const quality = {};
      for (const provider of PROVIDER_PRIORITY) {
        if (!this.configuredProviders().includes(provider)) continue;
        const row = this.qualityFor(provider);
        quality[provider] = {
          ...row,
          avgLatencyMs: row.successes ? Math.round(row.totalLatencyMs / row.successes) : 0,
          acceptanceRate: row.attempts ? Math.round((row.successes / row.attempts) * 100) : 0,
          acceptedLinesPerSuccess: row.successes ? Number((row.acceptedLines / row.successes).toFixed(1)) : 0
        };
      }
      return Response.json({
        ...data,
        pass: "gemini-first-router-v19.3",
        providerPriority: PROVIDER_PRIORITY,
        routingPolicy: "Gemini primary; Groq second; Workers AI third. Fall through only when the higher-priority provider is unavailable, rate-limited, or returns unusable output.",
        quality
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    const quality = {};
    for (const provider of this.configuredProviders()) quality[provider] = { ...this.qualityFor(provider) };
    return {
      ...base,
      pass: "gemini-first-router-v19.3",
      providerPriority: PROVIDER_PRIORITY,
      providerQuality: quality
    };
  }
}
