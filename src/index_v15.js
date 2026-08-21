import baseWorker, { ChatRoom as ContinuityChatRoom } from "./index_v14.js";
import { simulatedDateTimeLabel } from "./social.js";

const PROVIDER_LABELS = {
  groq: "Groq",
  gemini: "Gemini",
  "workers-ai": "Workers AI"
};

const DEFAULT_COOLDOWN_MS = {
  groq: 90000,
  gemini: 60000,
  "workers-ai": 30000
};

function messageKey(speaker, text) {
  return `${String(speaker || "")}\n${String(text || "")}`;
}

function retryAfterMs(response, fallbackMs) {
  const raw = response?.headers?.get?.("retry-after");
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(1000, Math.ceil(seconds * 1000));
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(1000, when - Date.now());
  return fallbackMs;
}

function extractJsonText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

function providerSystemPrompt() {
  return `It is ${simulatedDateTimeLabel()}. The world is 1996. You are simulating fictional adult AOL chat users. Never act like an assistant. Never invent or contradict a character's fixed profile facts, memories, or relationship history. Return only valid JSON.`;
}

export default baseWorker;

export class ChatRoom extends ContinuityChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.providerCooldownUntil = new Map();
    this.providerStats = new Map();
    this.pendingProviderByMessage = new Map();
    this.lastSuccessfulProvider = "";
    if (this.configuredProviders().length) this.aiStatus = "AI provider pool ready";
  }

  configuredProviders() {
    const providers = [];
    if (this.env.GROQ_API_KEY) providers.push("groq");
    if (this.env.GEMINI_API_KEY) providers.push("gemini");
    if (this.env.AI) providers.push("workers-ai");
    return providers;
  }

  providerReady(provider, now = Date.now()) {
    return now >= Number(this.providerCooldownUntil.get(provider) || 0);
  }

  providerEvent(provider, payload = {}) {
    const event = {
      type: "ai_provider",
      provider,
      label: PROVIDER_LABELS[provider] || provider,
      at: Date.now(),
      ...payload
    };
    this.broadcast(event);
  }

  noteProviderFailure(provider, status = 0, response = null, detail = "") {
    const fallback = DEFAULT_COOLDOWN_MS[provider] || 60000;
    let cooldownMs = fallback;
    if (response) cooldownMs = retryAfterMs(response, fallback);
    if (status === 401 || status === 403) cooldownMs = 10 * 60 * 1000;
    if (status >= 500 && status < 600) cooldownMs = Math.min(cooldownMs, 45000);
    this.providerCooldownUntil.set(provider, Date.now() + cooldownMs);
    const previous = this.providerStats.get(provider) || { successes: 0, failures: 0 };
    this.providerStats.set(provider, { ...previous, failures: previous.failures + 1, lastStatus: status, lastFailureAt: Date.now() });
    this.providerEvent(provider, {
      state: "cooldown",
      httpStatus: status || null,
      cooldownMs,
      detail: String(detail || "").slice(0, 120)
    });
  }

  noteProviderSuccess(provider, model, latencyMs, messageCount) {
    this.providerCooldownUntil.delete(provider);
    const previous = this.providerStats.get(provider) || { successes: 0, failures: 0 };
    this.providerStats.set(provider, { ...previous, successes: previous.successes + 1, lastSuccessAt: Date.now(), lastModel: model });
    this.lastSuccessfulProvider = provider;
    this.providerEvent(provider, {
      state: "success",
      model,
      latencyMs,
      messageCount
    });
  }

  async callGroqProvider(prompt, maxTokens) {
    const model = this.env.GROQ_MODEL || "openai/gpt-oss-20b";
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: providerSystemPrompt() },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        max_completion_tokens: maxTokens,
        temperature: 0.98
      })
    });

    if (!response.ok) return { ok: false, status: response.status, response, model };
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return { ok: Boolean(content), status: response.status, response, model, content };
  }

  async callGeminiProvider(prompt, maxTokens) {
    const model = this.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: providerSystemPrompt() }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) return { ok: false, status: response.status, response, model };
    const data = await response.json();
    const content = (data?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || "").join("");
    return { ok: Boolean(content), status: response.status, response, model, content };
  }

  async callWorkersAiProvider(prompt, maxTokens) {
    const model = this.env.WORKERS_AI_MODEL || "@cf/google/gemma-4-26b-a4b-it";
    try {
      const data = await this.env.AI.run(model, {
        messages: [
          { role: "system", content: providerSystemPrompt() },
          { role: "user", content: prompt }
        ],
        max_completion_tokens: maxTokens,
        temperature: 0.9
      });
      const raw = data?.response ?? data?.choices?.[0]?.message?.content ?? data?.result?.response ?? "";
      const content = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "";
      return { ok: Boolean(content), status: 200, response: null, model, content };
    } catch (error) {
      return { ok: false, status: 0, response: null, model, error };
    }
  }

  async callProvider(provider, prompt, maxTokens) {
    if (provider === "groq") return this.callGroqProvider(prompt, maxTokens);
    if (provider === "gemini") return this.callGeminiProvider(prompt, maxTokens);
    if (provider === "workers-ai") return this.callWorkersAiProvider(prompt, maxTokens);
    return { ok: false, status: 0, response: null, model: "" };
  }

  rememberMessageProvider(messages, provider) {
    for (const item of messages) {
      this.pendingProviderByMessage.set(messageKey(item.speaker, item.text), provider);
    }
    if (this.pendingProviderByMessage.size > 80) {
      const keys = [...this.pendingProviderByMessage.keys()];
      for (const key of keys.slice(0, keys.length - 60)) this.pendingProviderByMessage.delete(key);
    }
  }

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const providers = this.configuredProviders();
    const now = Date.now();
    let attempted = 0;

    for (const provider of providers) {
      if (!this.providerReady(provider, now)) continue;
      attempted += 1;
      const startedAt = Date.now();
      let result;

      try {
        result = await this.callProvider(provider, prompt, maxTokens);
      } catch (error) {
        this.noteProviderFailure(provider, 0, null, error?.message || "connection error");
        continue;
      }

      const latencyMs = Date.now() - startedAt;
      if (!result?.ok) {
        this.noteProviderFailure(provider, Number(result?.status || 0), result?.response || null, result?.error?.message || "provider request failed");
        continue;
      }

      let messages = [];
      try {
        messages = this.parseGroqMessages(extractJsonText(result.content), maxMessages, defaultTarget);
      } catch (error) {
        this.noteProviderFailure(provider, 0, null, `bad JSON: ${error?.message || "parse error"}`);
        continue;
      }

      if (!messages.length) {
        this.noteProviderFailure(provider, 0, null, "no usable chat lines");
        continue;
      }

      this.rememberMessageProvider(messages, provider);
      this.noteProviderSuccess(provider, result.model, latencyMs, messages.length);
      this.setAiStatus(`AI active · ${PROVIDER_LABELS[provider] || provider}`);
      return messages.map((item) => ({ ...item, source: provider }));
    }

    if (!providers.length) this.setAiStatus("AI unavailable · procedural fallback");
    else if (!attempted) this.setAiStatus("AI providers cooling down · procedural fallback");
    else this.setAiStatus("AI providers busy · procedural fallback");
    return [];
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") {
      const key = messageKey(from, text);
      const provider = this.pendingProviderByMessage.get(key);
      if (provider) {
        if (source === "groq" || source === "ai" || source === "built-in") source = provider;
        this.pendingProviderByMessage.delete(key);
      }
    }
    return super.say(from, text, kind, source, meta);
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      pass: "provider-router-v15a",
      aiProviders: {
        configured: this.configuredProviders(),
        lastSuccessful: this.lastSuccessfulProvider,
        cooldowns: this.configuredProviders().map((provider) => ({
          provider,
          remainingMs: Math.max(0, Number(this.providerCooldownUntil.get(provider) || 0) - now),
          ...(this.providerStats.get(provider) || {})
        }))
      }
    };
  }
}
