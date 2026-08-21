import baseWorker, { ChatRoom as AiFirstChatRoom } from "./index_v19.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const LABELS = { groq: "Groq", gemini: "Gemini", "workers-ai": "Workers AI" };

function extractJsonText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

function extractWorkersText(data) {
  if (typeof data === "string") return data;
  for (const value of [data?.response, data?.result?.response, data?.result?.text, data?.output_text, data?.choices?.[0]?.message?.content, data?.choices?.[0]?.text]) {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      try {
        const json = JSON.stringify(value);
        if (json && json !== "{}" && json !== "[]") return json;
      } catch {}
    }
  }
  if (Array.isArray(data?.result)) {
    const joined = data.result.map((item) => item?.text || item?.response || "").filter(Boolean).join("");
    if (joined) return joined;
  }
  return "";
}

async function responseDetail(response) {
  if (!response) return "";
  try {
    const text = await response.clone().text();
    return String(text || "").replace(/\s+/g, " ").slice(0, 180);
  } catch {
    return "";
  }
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
        pass: "provider-output-fix-v19.2",
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }
    if (url.pathname === "/api/ai-status") {
      const id = env.CHAT_ROOMS.idFromName("town-square");
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/ai-status"));
    }
    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends AiFirstChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.providerCursor = 0;
    this.outputRejectStats = new Map();
    this.providerLastDetail = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ai-status") {
      await this.ensureState();
      const now = Date.now();
      return Response.json({
        ok: true,
        pass: "provider-output-fix-v19.2",
        status: this.aiStatus,
        lastSuccessfulProvider: this.lastSuccessfulProvider || "",
        providers: this.configuredProviders().map((provider) => ({
          provider,
          label: LABELS[provider] || provider,
          ready: this.providerReady(provider, now),
          cooldownMs: Math.max(0, Number(this.providerCooldownUntil.get(provider) || 0) - now),
          ...(this.providerStats.get(provider) || {}),
          outputRejects: Number(this.outputRejectStats.get(provider) || 0),
          lastDetail: this.providerLastDetail.get(provider) || ""
        }))
      });
    }
    return super.fetch(request);
  }

  orderedReadyProviders(now = Date.now()) {
    const ready = this.configuredProviders().filter((provider) => this.providerReady(provider, now));
    if (!ready.length) return [];
    const start = this.providerCursor % ready.length;
    this.providerCursor = (this.providerCursor + 1) % 1000000;
    return [...ready.slice(start), ...ready.slice(0, start)];
  }

  shortestCooldownMs(now = Date.now()) {
    const waits = this.configuredProviders()
      .map((provider) => Math.max(0, Number(this.providerCooldownUntil.get(provider) || 0) - now))
      .filter((ms) => ms > 0);
    return waits.length ? Math.min(...waits) : 0;
  }

  noteProviderFailure(provider, status = 0, response = null, detail = "") {
    this.providerLastDetail.set(provider, String(detail || `HTTP ${status || 0}`).slice(0, 180));
    return super.noteProviderFailure(provider, status, response, detail);
  }

  noteOutputReject(provider, detail) {
    const count = Number(this.outputRejectStats.get(provider) || 0) + 1;
    this.outputRejectStats.set(provider, count);
    this.providerLastDetail.set(provider, String(detail || "output rejected").slice(0, 180));
    this.providerEvent(provider, { state: "output-rejected", detail: String(detail || "provider returned no usable chat").slice(0, 140) });
  }

  noteProviderSuccess(provider, model, latencyMs, messageCount) {
    this.providerLastDetail.set(provider, `success · ${messageCount} line${messageCount === 1 ? "" : "s"} · ${latencyMs}ms`);
    return super.noteProviderSuccess(provider, model, latencyMs, messageCount);
  }

  async callWorkersAiProvider(prompt, maxTokens) {
    const model = this.env.WORKERS_AI_MODEL || "@cf/google/gemma-4-26b-a4b-it";
    try {
      const data = await this.env.AI.run(model, {
        messages: [
          { role: "system", content: `It is ${simulatedDateTimeLabel()}. The world is 1996. Simulate fictional adult AOL chat users. Return only valid JSON.` },
          { role: "user", content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.9
      });
      const content = extractWorkersText(data);
      return { ok: Boolean(content), status: 200, response: null, model, content };
    } catch (error) {
      return { ok: false, status: 0, response: null, model, error };
    }
  }

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const configured = this.configuredProviders();
    const now = Date.now();
    const providers = this.orderedReadyProviders(now);

    if (!configured.length) {
      this.setAiStatus("AI unavailable · no providers configured");
      return [];
    }
    if (!providers.length) {
      const waitMs = this.shortestCooldownMs(now);
      this.setAiStatus(`AI waiting · provider retry in ~${Math.max(1, Math.ceil(waitMs / 1000))}s`);
      return [];
    }

    for (const provider of providers) {
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
        if (Number(result?.status || 0) === 200) {
          this.noteOutputReject(provider, "200 response but no readable model output");
          continue;
        }
        const detail = await responseDetail(result?.response);
        this.noteProviderFailure(provider, Number(result?.status || 0), result?.response || null, detail || result?.error?.message || "provider request failed");
        continue;
      }

      let messages = [];
      try {
        const json = extractJsonText(result.content);
        if (!json) {
          this.noteOutputReject(provider, "empty model output");
          continue;
        }
        messages = this.parseGroqMessages(json, maxMessages, defaultTarget);
      } catch (error) {
        this.noteOutputReject(provider, `unusable JSON/output: ${error?.message || "parse error"}`);
        continue;
      }

      if (!messages.length) {
        this.noteOutputReject(provider, "completion parsed but all lines were filtered");
        continue;
      }

      this.rememberMessageProvider(messages, provider);
      this.noteProviderSuccess(provider, result.model, latencyMs, messages.length);
      this.setAiStatus(`AI active · ${LABELS[provider] || provider}`);
      return messages.map((item) => ({ ...item, source: provider }));
    }

    const stillReady = this.configuredProviders().some((provider) => this.providerReady(provider, Date.now()));
    if (stillReady && this.lastSuccessfulProvider) this.setAiStatus(`AI active · ${LABELS[this.lastSuccessfulProvider] || this.lastSuccessfulProvider}`);
    else if (stillReady) this.setAiStatus("AI ready · retrying scene");
    else {
      const waitMs = this.shortestCooldownMs(Date.now());
      this.setAiStatus(`AI waiting · provider retry in ~${Math.max(1, Math.ceil(waitMs / 1000))}s`);
    }
    return [];
  }

  builtInHumanReply(human) {
    if (this.configuredProviders().length) return [];
    return super.builtInHumanReply(human);
  }

  builtInAmbient() {
    if (this.configuredProviders().length) return null;
    return super.builtInAmbient();
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    const now = Date.now();
    if (this.pendingHumans.length && this.configuredProviders().length && !this.hasReadyAi(now)) {
      const waitMs = this.shortestCooldownMs(now);
      this.setAiStatus(`AI waiting · provider retry in ~${Math.max(1, Math.ceil(waitMs / 1000))}s`);
      this.nextBotAt = now + Math.min(5000, Math.max(1000, waitMs || 2500));
      return;
    }
    return super.tick(forceSoon);
  }

  debugState(name) {
    const base = super.debugState(name);
    return { ...base, pass: "provider-output-fix-v19.2" };
  }
}
