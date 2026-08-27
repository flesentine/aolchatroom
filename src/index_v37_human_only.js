import hotfixWorker, { ChatRoom as HotfixChatRoom } from "./index_v37_hotfix.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import { getCharacter } from "./characters.js";
import { simulatedDateTimeLabel } from "./social.js";
import { adaptiveAmbientAiEligible, ambientAiIntervalMs } from "./adaptive_ambient_policy_v37.js";

const AMBIENT_AI_MAX_TOKENS = 360;
const AMBIENT_AI_RECENT_LINES = 10;

function clean(value, max = 320) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractJson(value) {
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
    return clean(await response.clone().text(), 180);
  } catch {
    return "";
  }
}

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await hotfixWorker.fetch(request, env);
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
        humanOnlyModelBudget: false,
        ambientModelGenerationDisabled: false,
        adaptiveAmbientAi: true,
        ambientSingleProviderAttempt: true,
        ambientSingleCallExchange: true,
        humanModelFailureFallsBackBuiltIn: true
      }
    });
  }
};

export class ChatRoom extends HotfixChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37AmbientProviderCursor = 0;
    this.v37LastAmbientAiAt = 0;
    this.v37AdaptiveAmbientStats = {
      ambientAiAttempts: 0,
      ambientAiSuccesses: 0,
      ambientAiFailures: 0,
      ambientAiOutputRejects: 0,
      ambientAiLines: 0,
      ambientBuiltInPlansGenerated: 0,
      ambientAiRateSkips: 0,
      ambientAiHumanPrioritySkips: 0,
      humanModelFallbacks: 0,
      humanModelFallbackMisses: 0
    };
  }

  // A single healthy preferred provider is enough for low-rate ambient AI. The
  // inherited constrained-mode pre-queue is disabled in that state so this
  // layer can spend at most one provider request per ambient exchange.
  providerCapacityConstrained(now = Date.now()) {
    const preferred = this.preferredStructuredReadyProviders?.(now) || [];
    if (preferred.length >= 1) return false;
    return super.providerCapacityConstrained(now);
  }

  activeAmbientCharacters() {
    return [...(this.activeBotNames || [])]
      .map((name) => getCharacter(name))
      .filter(Boolean);
  }

  ambientAiPrompt() {
    const active = this.activeAmbientCharacters();
    const names = active.map((character) => character.name);
    const profiles = typeof this.promptProfiles === "function"
      ? this.promptProfiles(active.slice(0, 6), Math.min(6, active.length || 1))
      : names.join(", ");
    const recent = (this.history || [])
      .filter((row) => row?.kind === "human" || row?.kind === "bot")
      .slice(-AMBIENT_AI_RECENT_LINES)
      .map((row) => `${row.from}${row.target && row.target !== "room" ? ` -> ${row.target}` : ""}: ${clean(row.text, 180)}`)
      .join("\n");

    return `It is ${simulatedDateTimeLabel()}. You are generating ONE tiny ambient exchange in a public 1996 AOL Town Square chat room.\n\nONLINE BOTS: ${names.join(", ")}\n\nCHARACTER PROFILES:\n${profiles}\n\nRECENT CHAT:\n${recent || "none"}\n\nGenerate exactly TWO short consecutive bot lines. The second line must naturally react to the first, so this feels like real bot-to-bot interaction rather than two unrelated canned remarks. Use only ONLINE BOTS as speakers. Targets may be room or another ONLINE BOT. React to the actual recent conversation when useful, but do not repeat a subject that people are clearly tired of. Keep each line casual and short. Preserve character voice. Do not invent public-world facts, future technology, or hidden human facts. Do not explain that you are AI.\n\nReturn JSON only:\n{"messages":[{"speaker":"BotName","target":"room-or-BotName","text":"short line"},{"speaker":"DifferentBot","target":"room-or-first-Bot","text":"short reacting line"}]}`;
  }

  async generateAdaptiveAmbientAi(now = Date.now()) {
    const preferred = this.preferredStructuredReadyProviders?.(now) || [];
    const gate = adaptiveAmbientAiEligible({
      now,
      readyPreferredCount: preferred.length,
      lastAmbientAiAt: this.v37LastAmbientAiAt,
      pendingHumanCount: this.pendingHumans?.length || 0,
      aiQueueLength: this.aiQueue?.length || 0
    });

    if (!gate.ok) {
      if (gate.reason === "ambient-rate-limit") this.v37AdaptiveAmbientStats.ambientAiRateSkips += 1;
      if (gate.reason === "human-pending") this.v37AdaptiveAmbientStats.ambientAiHumanPrioritySkips += 1;
      return [];
    }

    const provider = preferred[this.v37AmbientProviderCursor % preferred.length];
    this.v37AmbientProviderCursor = (this.v37AmbientProviderCursor + 1) % 1000000;
    this.v37LastAmbientAiAt = now;
    this.v37AdaptiveAmbientStats.ambientAiAttempts += 1;

    const startedAt = Date.now();
    let result;
    try {
      result = await this.callProvider(provider, this.ambientAiPrompt(), AMBIENT_AI_MAX_TOKENS);
    } catch (error) {
      this.v37AdaptiveAmbientStats.ambientAiFailures += 1;
      this.noteProviderFailure?.(provider, 0, null, error?.message || "ambient connection error");
      return [];
    }

    const latencyMs = Date.now() - startedAt;
    if (!result?.ok) {
      this.v37AdaptiveAmbientStats.ambientAiFailures += 1;
      const detail = await responseDetail(result?.response);
      if (Number(result?.status || 0) === 200) {
        this.v37AdaptiveAmbientStats.ambientAiOutputRejects += 1;
        this.noteOutputReject?.(provider, "ambient AI returned no readable output");
      } else {
        this.noteProviderFailure?.(
          provider,
          Number(result?.status || 0),
          result?.response || null,
          detail || result?.error?.message || "ambient provider failed"
        );
      }
      return [];
    }

    let parsed = [];
    try {
      parsed = this.parseGroqMessages(extractJson(result.content), 2, "room") || [];
    } catch (error) {
      this.v37AdaptiveAmbientStats.ambientAiOutputRejects += 1;
      this.noteOutputReject?.(provider, `ambient JSON rejected: ${error?.message || "parse error"}`);
      return [];
    }

    const activeNames = new Set(this.activeAmbientCharacters().map((character) => character.name));
    const safe = parsed
      .filter((row) => activeNames.has(row?.speaker))
      .slice(0, 2)
      .map((row) => ({
        ...row,
        target: row.target === "room" || activeNames.has(row.target) ? row.target : "room",
        source: provider
      }));

    if (safe.length < 2 || safe[0].speaker === safe[1].speaker) {
      this.v37AdaptiveAmbientStats.ambientAiOutputRejects += 1;
      this.noteOutputReject?.(provider, "ambient AI did not return two distinct online bot speakers");
      return [];
    }

    this.rememberMessageProvider?.(safe, provider);
    this.noteProviderSuccess?.(provider, result.model, latencyMs, safe.length);
    this.v37AdaptiveAmbientStats.ambientAiSuccesses += 1;
    this.v37AdaptiveAmbientStats.ambientAiLines += safe.length;
    this.setAiStatus?.(`AI active · ${provider === "gemini" ? "Gemini" : "Groq"} · adaptive ambient`);
    return safe;
  }

  async generateBackgroundPlan() {
    const now = Date.now();
    const aiLines = await this.generateAdaptiveAmbientAi(now);
    if (aiLines.length) return aiLines;

    const ambient = ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this);
    if (!ambient) return [];
    this.v37AdaptiveAmbientStats.ambientBuiltInPlansGenerated += 1;

    const preferred = this.preferredStructuredReadyProviders?.(Date.now()) || [];
    if (!this.providerPoolDegraded?.(Date.now()) && preferred.length) {
      const seconds = Math.round(ambientAiIntervalMs(preferred.length) / 1000);
      this.setAiStatus?.(`AI constrained · adaptive ambient + built-in · ${seconds}s model budget`);
    }
    return [{ ...ambient, source: "built-in" }];
  }

  async generateHumanReplan(human) {
    const lines = await super.generateHumanReplan(human);
    if (Array.isArray(lines) && lines.length) return lines;

    const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
    if (fallback.length) {
      this.v37AdaptiveAmbientStats.humanModelFallbacks += 1;
      this.setAiStatus?.("AI human reply fallback · built-in");
      return fallback.map((item) => ({ ...item, source: "built-in" }));
    }

    this.v37AdaptiveAmbientStats.humanModelFallbackMisses += 1;
    return [];
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    const preferred = this.preferredStructuredReadyProviders?.(Date.now()) || [];
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        humanOnlyModelBudget: false,
        ambientModelGenerationDisabled: false,
        adaptiveAmbientAi: true,
        ambientSingleProviderAttempt: true,
        ambientSingleCallExchange: true,
        humanModelFailureFallsBackBuiltIn: true
      },
      adaptiveAmbientAi: {
        ...this.v37AdaptiveAmbientStats,
        preferredReadyProviders: preferred,
        nextIntervalMs: ambientAiIntervalMs(preferred.length),
        lastAmbientAiAgoMs: this.v37LastAmbientAiAt ? Math.max(0, Date.now() - this.v37LastAmbientAiAt) : null,
        policy: "one provider attempt creates a two-line AI bot exchange; built-in chatter fills between calls; humans remain priority"
      }
    };
  }
}
