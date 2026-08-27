import baseWorker, { ChatRoom as AdaptiveChatRoom } from "./index_v37_human_only.js";
import { simulatedDateTimeLabel } from "./social.js";
import {
  EXTENDED_ONLY_PROVIDERS,
  PROVIDER_LABELS_V37,
  ambientReadyProviders,
  configuredExtendedProviders,
  orderedExtendedProviders,
  providerPoolSummary
} from "./free_provider_pool_v37.js";

const MAX_PROVIDER_DETAIL = 220;

function clean(value, max = MAX_PROVIDER_DETAIL) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function providerSystemPrompt() {
  return `It is ${simulatedDateTimeLabel()}. The world is 1996. Simulate fictional adult AOL chat users. Never act like an assistant. Never invent or contradict fixed character facts, memories, or relationship history. Return only valid JSON.`;
}

async function responseDetail(response) {
  if (!response) return "";
  try { return clean(await response.clone().text()); } catch { return ""; }
}

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

function openAiContent(data) {
  const raw = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((part) => part?.text || part?.content || "").join("");
  return raw ? JSON.stringify(raw) : "";
}

export default {
  async fetch(request, env) {
    const response = await baseWorker.fetch(request, env);
    const url = new URL(request.url);
    if (url.pathname !== "/api/health" && url.pathname !== "/api/everything" && url.pathname !== "/api/full-status") return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v37: {
        ...(data.v37 || {}),
        extendedFreeProviderPool: true,
        cohereTrialProductionDisabledByDefault: true,
        extendedProviderSummary: providerPoolSummary(env)
      }
    });
  }
};

export class ChatRoom extends AdaptiveChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37ExtendedProviderStats = {
      calls: 0,
      successes: 0,
      failures: 0,
      byProvider: {}
    };
  }

  configuredProviders() {
    return configuredExtendedProviders(this.env || {}, super.configuredProviders?.() || []);
  }

  preferredStructuredReadyProviders(now = Date.now()) {
    return ambientReadyProviders({
      configured: this.configuredProviders(),
      hardReady: this.hardReadyProviders?.(now) || [],
      softReady: this.softReadyProviders?.(now) || []
    });
  }

  effectiveStructuredReadyProviders(now = Date.now()) {
    return orderedExtendedProviders({
      configured: this.configuredProviders(),
      hardReady: this.hardReadyProviders?.(now) || [],
      softReady: this.softReadyProviders?.(now) || [],
      structuredGenerationDepth: this.v35StructuredGenerationDepth
    });
  }

  providerPoolDegraded(now = Date.now()) {
    return this.configuredProviders().length > 0 && this.effectiveStructuredReadyProviders(now).length === 0;
  }

  orderedReadyProviders(now = Date.now()) {
    return orderedExtendedProviders({
      configured: this.configuredProviders(),
      hardReady: this.hardReadyProviders?.(now) || [],
      softReady: this.softReadyProviders?.(now) || [],
      structuredGenerationDepth: this.v35StructuredGenerationDepth
    });
  }

  noteExtendedProvider(provider, ok) {
    if (!EXTENDED_ONLY_PROVIDERS.has(provider)) return;
    this.v37ExtendedProviderStats.calls += 1;
    if (ok) this.v37ExtendedProviderStats.successes += 1;
    else this.v37ExtendedProviderStats.failures += 1;
    const row = this.v37ExtendedProviderStats.byProvider[provider] || { calls: 0, successes: 0, failures: 0 };
    row.calls += 1;
    if (ok) row.successes += 1;
    else row.failures += 1;
    this.v37ExtendedProviderStats.byProvider[provider] = row;
  }

  async callOpenAiCompatible({ provider, endpoint, apiKey, model, prompt, maxTokens, headers = {}, body = {} }) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: providerSystemPrompt() },
          { role: "user", content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.86,
        stream: false,
        ...body
      })
    });
    if (!response.ok) {
      this.noteExtendedProvider(provider, false);
      return { ok: false, status: response.status, response, model, error: new Error(await responseDetail(response) || `HTTP ${response.status}`) };
    }
    const data = await response.json();
    const content = openAiContent(data);
    const ok = Boolean(content && String(content).trim());
    this.noteExtendedProvider(provider, ok);
    return { ok, status: response.status, response, model: data?.model || model, content };
  }

  async callMistralProvider(prompt, maxTokens) {
    return this.callOpenAiCompatible({
      provider: "mistral",
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      apiKey: this.env.MISTRAL_API_KEY,
      model: this.env.MISTRAL_MODEL || "mistral-small-latest",
      prompt,
      maxTokens,
      body: { response_format: { type: "json_object" } }
    });
  }

  async callVercelAiGatewayProvider(prompt, maxTokens) {
    return this.callOpenAiCompatible({
      provider: "vercel-ai-gateway",
      endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
      apiKey: this.env.AI_GATEWAY_API_KEY,
      model: this.env.VERCEL_AI_MODEL || "openai/gpt-oss-20b",
      prompt,
      maxTokens
    });
  }

  async callOpenRouterProvider(prompt, maxTokens) {
    return this.callOpenAiCompatible({
      provider: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: this.env.OPENROUTER_API_KEY,
      model: this.env.OPENROUTER_MODEL || "openrouter/free",
      prompt,
      maxTokens,
      headers: {
        "HTTP-Referer": this.env.PUBLIC_APP_URL || "https://aolchatroom.pages.dev",
        "X-Title": "AOL 1996 Town Square"
      }
    });
  }

  async callHuggingFaceProvider(prompt, maxTokens) {
    return this.callOpenAiCompatible({
      provider: "huggingface",
      endpoint: "https://router.huggingface.co/v1/chat/completions",
      apiKey: this.env.HF_TOKEN,
      model: this.env.HF_MODEL || "openai/gpt-oss-120b:cheapest",
      prompt,
      maxTokens
    });
  }

  async callCerebrasProvider(prompt, maxTokens) {
    return this.callOpenAiCompatible({
      provider: "cerebras",
      endpoint: "https://api.cerebras.ai/v1/chat/completions",
      apiKey: this.env.CEREBRAS_API_KEY,
      model: this.env.CEREBRAS_MODEL || "gpt-oss-120b",
      prompt,
      maxTokens
    });
  }

  async callCohereTrialProvider(prompt, maxTokens) {
    const model = this.env.COHERE_MODEL || "command-r7b-12-2024";
    const response = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.COHERE_TRIAL_API_KEY}`,
        "Content-Type": "application/json",
        "X-Client-Name": "AOL 1996 Town Square"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: providerSystemPrompt() },
          { role: "user", content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.86,
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) {
      this.noteExtendedProvider("cohere-trial", false);
      return { ok: false, status: response.status, response, model, error: new Error(await responseDetail(response) || `HTTP ${response.status}`) };
    }
    const data = await response.json();
    const content = (data?.message?.content || []).map((part) => part?.text || "").join("");
    const ok = Boolean(content.trim());
    this.noteExtendedProvider("cohere-trial", ok);
    return { ok, status: response.status, response, model, content };
  }

  async callProvider(provider, prompt, maxTokens) {
    if (provider === "mistral") return this.callMistralProvider(prompt, maxTokens);
    if (provider === "vercel-ai-gateway") return this.callVercelAiGatewayProvider(prompt, maxTokens);
    if (provider === "openrouter") return this.callOpenRouterProvider(prompt, maxTokens);
    if (provider === "huggingface") return this.callHuggingFaceProvider(prompt, maxTokens);
    if (provider === "cerebras") return this.callCerebrasProvider(prompt, maxTokens);
    if (provider === "cohere-trial") return this.callCohereTrialProvider(prompt, maxTokens);
    return super.callProvider(provider, prompt, maxTokens);
  }

  providerEvent(provider, payload = {}) {
    this.broadcast?.({
      type: "ai_provider",
      provider,
      label: PROVIDER_LABELS_V37[provider] || provider,
      at: Date.now(),
      ...payload
    });
  }

  // Older realism/memory layers know the generic `ai` source plus the original
  // three provider names. Normalize only the newly-added providers to `ai`, while
  // retaining the concrete provider in message metadata for diagnostics.
  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot" && EXTENDED_ONLY_PROVIDERS.has(source)) {
      return super.say(from, text, kind, "ai", { ...meta, aiProvider: source, provider: source });
    }
    return super.say(from, text, kind, source, meta);
  }

  v37ProviderFailoverSnapshot(now = Date.now()) {
    const base = super.v37ProviderFailoverSnapshot(now);
    return {
      ...base,
      preferredStructuredProviders: ["gemini", "groq", "mistral", "vercel-ai-gateway"],
      preferredStructuredReadyProviders: this.preferredStructuredReadyProviders(now),
      effectiveStructuredReadyProviders: this.effectiveStructuredReadyProviders(now),
      providerPoolDegraded: this.providerPoolDegraded(now),
      adaptiveAmbientAi: true,
      ambientAiSuppressedWhenConstrained: false,
      humanEmergencyProviders: ["openrouter", "huggingface", "cerebras"],
      cohereTrialProductionDisabledByDefault: true
    };
  }

  async fetch(request) {
    const response = await super.fetch(request);
    const url = new URL(request.url);
    if (url.pathname !== "/ai-status") return response;
    const data = await json(response);
    if (!data) return response;
    const now = Date.now();
    const extendedProviders = this.configuredProviders()
      .filter((provider) => EXTENDED_ONLY_PROVIDERS.has(provider))
      .map((provider) => {
        const hardCooldownMs = Math.max(0, Number(this.providerCooldownUntil?.get(provider) || 0) - now);
        const softCooldownMs = Math.max(0, Number(this.providerSoftRejectUntil?.get(provider) || 0) - now);
        const stats = this.providerStats?.get(provider) || {};
        const quality = this.providerQuality?.get(provider) || {};
        return {
          provider,
          label: PROVIDER_LABELS_V37[provider] || provider,
          hardReady: typeof this.providerReady !== "function" ? true : this.providerReady(provider, now),
          softReady: typeof this.softReady !== "function" ? true : this.softReady(provider, now),
          hardCooldownMs,
          softCooldownMs,
          successes: Number(stats.successes || quality.successes || 0),
          failures: Number(stats.failures || quality.failures || 0),
          outputRejects: Number(this.outputRejectStats?.get(provider) || quality.outputRejects || 0),
          lastDetail: this.providerLastDetail?.get(provider) || ""
        };
      });
    return Response.json({ ...data, extendedFreeProviders: extendedProviders });
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        extendedFreeProviderPool: true,
        cohereTrialProductionDisabledByDefault: true
      },
      extendedFreeProviders: {
        configured: this.configuredProviders(),
        ambientEligibleReady: this.preferredStructuredReadyProviders(Date.now()),
        effectiveReady: this.effectiveStructuredReadyProviders(Date.now()),
        stats: this.v37ExtendedProviderStats,
        policy: "Mistral/Vercel may supply low-rate ambient AI; OpenRouter/HuggingFace/Cerebras are human/emergency fallbacks; Cohere trial requires ALLOW_DEV_TRIAL_PROVIDERS=1"
      }
    };
  }
}
