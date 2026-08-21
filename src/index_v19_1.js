import baseWorker, { ChatRoom as AiFirstChatRoom } from "./index_v19.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const LABELS = {
  groq: "Groq",
  gemini: "Gemini",
  "workers-ai": "Workers AI"
};

function extractJsonText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
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
        pass: "provider-cooldown-fix-v19.1",
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        },
        models: {
          groq: env.GROQ_MODEL || "openai/gpt-oss-20b",
          gemini: env.GEMINI_MODEL || "gemini-3.5-flash-lite",
          workersAI: env.WORKERS_AI_MODEL || "@cf/google/gemma-4-26b-a4b-it"
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
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ai-status") {
      await this.ensureState();
      const now = Date.now();
      return Response.json({
        ok: true,
        pass: "provider-cooldown-fix-v19.1",
        status: this.aiStatus,
        lastSuccessfulProvider: this.lastSuccessfulProvider || "",
        providers: this.configuredProviders().map((provider) => ({
          provider,
          label: LABELS[provider] || provider,
          ready: this.providerReady(provider, now),
          cooldownMs: Math.max(0, Number(this.providerCooldownUntil.get(provider) || 0) - now),
          ...(this.providerStats.get(provider) || {}),
          outputRejects: Number(this.outputRejectStats.get(provider) || 0)
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

  noteOutputReject(provider, detail) {
    const count = Number(this.outputRejectStats.get(provider) || 0) + 1;
    this.outputRejectStats.set(provider, count);
    this.providerEvent(provider, {
      state: "output-rejected",
      detail: String(detail || "provider returned no usable chat").slice(0, 140)
    });
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
      const seconds = Math.max(1, Math.ceil(waitMs / 1000));
      this.setAiStatus(`AI waiting · provider retry in ~${seconds}s`);
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
        const detail = await responseDetail(result?.response);
        this.noteProviderFailure(
          provider,
          Number(result?.status || 0),
          result?.response || null,
          detail || result?.error?.message || "provider request failed"
        );
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
        // A formatting/scene-filter miss is not a provider outage. Do not put a healthy
        // provider into a 30-90 second circuit-breaker just because one completion was bad.
        this.noteOutputReject(provider, `unusable JSON/output: ${error?.message || "parse error"}`);
        continue;
      }

      if (!messages.length) {
        // Same rule here: content rejection is a generation miss, not a 429/5xx failure.
        this.noteOutputReject(provider, "completion parsed but all lines were filtered");
        continue;
      }

      this.rememberMessageProvider(messages, provider);
      this.noteProviderSuccess(provider, result.model, latencyMs, messages.length);
      this.setAiStatus(`AI active · ${LABELS[provider] || provider}`);
      return messages.map((item) => ({ ...item, source: provider }));
    }

    // All currently reachable providers answered, but their output was unusable. Keep AI
    // enabled and retry on the normal cadence rather than falsely declaring every provider
    // "cooling down" and switching the room back to canned chatter.
    if (this.configuredProviders().some((provider) => this.providerReady(provider, Date.now()))) {
      this.setAiStatus("AI retrying · outputs rejected, providers still healthy");
    } else {
      const waitMs = this.shortestCooldownMs(Date.now());
      this.setAiStatus(`AI waiting · provider retry in ~${Math.max(1, Math.ceil(waitMs / 1000))}s`);
    }
    return [];
  }

  builtInHumanReply(human) {
    // Once any AI provider is configured, never silently replace a human-facing reply with
    // substantive canned chatter merely because providers are temporarily rate-limited.
    if (this.configuredProviders().length) return [];
    return super.builtInHumanReply(human);
  }

  builtInAmbient() {
    // Same policy for room chatter: AI-aware or quiet. Procedural ambient chatter is only
    // used when the deployment has no AI providers configured at all.
    if (this.configuredProviders().length) return null;
    return super.builtInAmbient();
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    const now = Date.now();

    // Preserve a human message while all configured providers are in a real HTTP/network
    // cooldown. The inherited engine would otherwise dequeue it and lose the chance for an
    // AI-aware reply before the earliest provider recovers.
    if (this.pendingHumans.length && this.configuredProviders().length && !this.hasReadyAi(now)) {
      const waitMs = this.shortestCooldownMs(now);
      const seconds = Math.max(1, Math.ceil(waitMs / 1000));
      this.setAiStatus(`AI waiting · provider retry in ~${seconds}s`);
      this.nextBotAt = now + Math.min(5000, Math.max(1000, waitMs || 2500));
      return;
    }

    return super.tick(forceSoon);
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      pass: "provider-cooldown-fix-v19.1",
      providerRouting: {
        rotationCursor: this.providerCursor,
        status: this.aiStatus,
        providers: this.configuredProviders().map((provider) => ({
          provider,
          ready: this.providerReady(provider, now),
          cooldownMs: Math.max(0, Number(this.providerCooldownUntil.get(provider) || 0) - now),
          outputRejects: Number(this.outputRejectStats.get(provider) || 0),
          ...(this.providerStats.get(provider) || {})
        }))
      }
    };
  }
}
