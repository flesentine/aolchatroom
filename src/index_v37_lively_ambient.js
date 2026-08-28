import humanDirectorWorker, { ChatRoom as HumanDirectorChatRoom } from "./index_v37_human_director.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import { PROVIDER_LABELS_V37 } from "./free_provider_pool_v37.js";
import { simulatedDateTimeLabel } from "./social.js";
import {
  LIVELY_AMBIENT_MIN_LINES,
  LIVELY_AMBIENT_MAX_LINES,
  livelyAmbientEligible,
  livelyAmbientIntervalMs
} from "./lively_ambient_policy_v37.js";

const LIVELY_AMBIENT_MAX_TOKENS = 620;
const LIVELY_AMBIENT_RECENT_LINES = 14;
const EXHAUSTED_SCENE_TURNS = 15;
const RECENT_HUMAN_SCENE_MS = 90 * 1000;

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
  try { return clean(await response.clone().text(), 180); } catch { return ""; }
}

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await humanDirectorWorker.fetch(request, env);
    const url = new URL(request.url);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v37: {
        ...(data.v37 || {}),
        adaptiveAmbientAi: false,
        livelyAmbientAi: true,
        ambientSingleCallBurst: true,
        ambientAiDominantWhenHealthy: true,
        ambientBuiltInFillerBetweenCalls: false,
        ambientBuiltInOnlyOnProviderFailure: true,
        ambientBurstLines: [LIVELY_AMBIENT_MIN_LINES, LIVELY_AMBIENT_MAX_LINES]
      }
    });
  }
};

export class ChatRoom extends HumanDirectorChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37LastLivelyAmbientAiAt = 0;
    this.v37LivelyAmbientStats = {
      attempts: 0,
      successes: 0,
      failures: 0,
      outputRejects: 0,
      lines: 0,
      rateSkips: 0,
      humanPrioritySkips: 0,
      queueSkips: 0,
      naturalPauses: 0,
      builtInFailureFallbacks: 0,
      exhaustedScenesClosedBeforePlan: 0
    };
  }

  recentHumanInScene(sceneId, now = Date.now()) {
    if (!sceneId) return null;
    return [...(this.history || [])].reverse().find((row) =>
      row?.kind === "human"
      && row.sceneId === sceneId
      && now - Number(row.at || 0) <= RECENT_HUMAN_SCENE_MS
    ) || null;
  }

  closeExhaustedAmbientScenes(now = Date.now()) {
    if (typeof this.openScenes !== "function") return 0;
    const humans = new Set(this.humanNames?.() || []);
    let closed = 0;
    for (const scene of this.openScenes(now) || []) {
      if (Number(scene?.turns || 0) < EXHAUSTED_SCENE_TURNS) continue;
      if (scene?.openQuestion?.target && humans.has(scene.openQuestion.target)) continue;
      if (this.recentHumanInScene(scene.id, now)) continue;
      scene.status = "closed";
      scene.closedAt = now;
      scene.closeReason = "v37 lively ambient fatigue boundary";
      if (this.sceneStats) this.sceneStats.closed = Number(this.sceneStats.closed || 0) + 1;
      if (scene.topic && scene.topic !== "general" && this.topicFatigueUntil instanceof Map) {
        const until = now + 2 * 60 * 1000;
        this.topicFatigueUntil.set(scene.topic, Math.max(until, Number(this.topicFatigueUntil.get(scene.topic) || 0)));
      }
      closed += 1;
      this.v37LivelyAmbientStats.exhaustedScenesClosedBeforePlan += 1;
      this.broadcast?.({
        type: "scene_plan",
        action: "v37-lively-fatigue-close",
        sceneId: scene.id,
        topic: scene.topic || "general",
        turns: Number(scene.turns || 0),
        at: now
      });
    }
    return closed;
  }

  livelyAmbientPrompt(now = Date.now()) {
    const active = this.activeAmbientCharacters?.() || [];
    const names = active.map((character) => character.name);
    const profiles = typeof this.promptProfiles === "function"
      ? this.promptProfiles(active.slice(0, 8), Math.min(8, active.length || 1))
      : names.join(", ");
    const recent = (this.history || [])
      .filter((row) => row?.kind === "human" || row?.kind === "bot")
      .slice(-LIVELY_AMBIENT_RECENT_LINES)
      .map((row) => `${row.from}${row.target && row.target !== "room" ? ` -> ${row.target}` : ""}: ${clean(row.text, 180)}`)
      .join("\n");
    const fatigued = typeof this.fatiguedScene === "function" ? this.fatiguedScene(now) : null;
    const fatigueNote = fatigued
      ? `\nSTALE-SCENE WARNING: scene ${fatigued.id} has already run ${Number(fatigued.turns || 0)} turns on ${fatigued.topic || "a subject"}. Do not keep grinding that subject. Let it die, tangent away, or start something ordinary and different.`
      : "";

    return `It is ${simulatedDateTimeLabel()}. Generate ONE small burst of live conversation for a crowded public 1996 AOL Town Square room.\n\nONLINE BOTS: ${names.join(", ")}\n\nCHARACTER PROFILES:\n${profiles}\n\nRECENT CHAT:\n${recent || "none"}${fatigueNote}\n\nThis should feel like people in a noisy chat room, not assistants taking turns. Generate ${LIVELY_AMBIENT_MIN_LINES}-${LIVELY_AMBIENT_MAX_LINES} short sends using 2-4 ONLINE BOTS. Keep one main exchange and at most one small side exchange. It is fine for a comment to be ignored. It is fine for somebody to misunderstand, joke, disagree, tangent, or drop a subject. Do not wrap everything up neatly. Do not make everyone react. Continue a live exchange only when it still has something new to do; otherwise change naturally. Keep most sends 2-12 words. Preserve each character's own voice without forcing catchphrases. Use only facts established in CHARACTER PROFILES or RECENT CHAT. Do not invent future technology, post-1996 products, hidden human facts, or public-world claims. Do not explain anything as an AI.\n\nReturn JSON only:\n{"messages":[{"speaker":"BotName","target":"room-or-BotName","text":"short chat send","intent":"reply-or-ambient","topic":"short-topic"}]}`;
  }

  async generateLivelyAmbientAi(now = Date.now()) {
    const preferred = this.preferredStructuredReadyProviders?.(now) || [];
    const gate = livelyAmbientEligible({
      now,
      readyPreferredCount: preferred.length,
      lastAmbientAiAt: this.v37LastLivelyAmbientAiAt,
      pendingHumanCount: this.pendingHumans?.length || 0,
      aiQueueLength: this.aiQueue?.length || 0
    });

    if (!gate.ok) {
      if (gate.reason === "ambient-rate-limit") this.v37LivelyAmbientStats.rateSkips += 1;
      if (gate.reason === "human-pending") this.v37LivelyAmbientStats.humanPrioritySkips += 1;
      if (gate.reason === "queue-not-empty") this.v37LivelyAmbientStats.queueSkips += 1;
      return { lines: [], reason: gate.reason, preferred };
    }

    const provider = preferred[this.v37AmbientProviderCursor % preferred.length];
    this.v37AmbientProviderCursor = (this.v37AmbientProviderCursor + 1) % 1000000;
    this.v37LastLivelyAmbientAiAt = now;
    this.v37LivelyAmbientStats.attempts += 1;

    const startedAt = Date.now();
    let result;
    try {
      result = await this.callProvider(provider, this.livelyAmbientPrompt(now), LIVELY_AMBIENT_MAX_TOKENS);
    } catch (error) {
      this.v37LivelyAmbientStats.failures += 1;
      this.noteProviderFailure?.(provider, 0, null, error?.message || "lively ambient connection error");
      return { lines: [], reason: "provider-failure", provider, preferred };
    }

    const latencyMs = Date.now() - startedAt;
    if (!result?.ok) {
      this.v37LivelyAmbientStats.failures += 1;
      const detail = await responseDetail(result?.response);
      if (Number(result?.status || 0) === 200) {
        this.v37LivelyAmbientStats.outputRejects += 1;
        this.noteOutputReject?.(provider, "lively ambient AI returned no readable output");
      } else {
        this.noteProviderFailure?.(
          provider,
          Number(result?.status || 0),
          result?.response || null,
          detail || result?.error?.message || "lively ambient provider failed"
        );
      }
      return { lines: [], reason: "provider-failure", provider, preferred };
    }

    let parsed = [];
    try {
      parsed = this.parseGroqMessages(extractJson(result.content), LIVELY_AMBIENT_MAX_LINES, "room") || [];
    } catch (error) {
      this.v37LivelyAmbientStats.outputRejects += 1;
      this.noteOutputReject?.(provider, `lively ambient JSON rejected: ${error?.message || "parse error"}`);
      return { lines: [], reason: "output-reject", provider, preferred };
    }

    const activeNames = new Set((this.activeAmbientCharacters?.() || []).map((character) => character.name));
    const safe = parsed
      .filter((row) => activeNames.has(row?.speaker))
      .slice(0, LIVELY_AMBIENT_MAX_LINES)
      .map((row) => ({
        ...row,
        target: row.target === "room" || activeNames.has(row.target) ? row.target : "room",
        source: provider,
        _v37LivelyAmbient: true
      }));
    const distinctSpeakers = new Set(safe.map((row) => row.speaker));

    if (safe.length < LIVELY_AMBIENT_MIN_LINES || distinctSpeakers.size < 2) {
      this.v37LivelyAmbientStats.outputRejects += 1;
      this.noteOutputReject?.(provider, `lively ambient returned ${safe.length} lines from ${distinctSpeakers.size} speakers`);
      return { lines: [], reason: "output-reject", provider, preferred };
    }

    this.rememberMessageProvider?.(safe, provider);
    this.noteProviderSuccess?.(provider, result.model, latencyMs, safe.length);
    this.v37LivelyAmbientStats.successes += 1;
    this.v37LivelyAmbientStats.lines += safe.length;
    this.setAiStatus?.(`AI active · ${PROVIDER_LABELS_V37[provider] || provider} · lively ambient`);
    return { lines: safe, reason: "success", provider, preferred };
  }

  async generateBackgroundPlan() {
    const now = Date.now();
    this.closeExhaustedAmbientScenes(now);
    const result = await this.generateLivelyAmbientAi(now);
    if (result.lines.length) return result.lines;

    if (["ambient-rate-limit", "queue-not-empty", "human-pending"].includes(result.reason)) {
      this.v37LivelyAmbientStats.naturalPauses += 1;
      if (result.reason === "ambient-rate-limit") this.setAiStatus?.("AI active · lively ambient · natural pause");
      return [];
    }

    const ambient = ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this);
    if (!ambient) return [];
    this.v37LivelyAmbientStats.builtInFailureFallbacks += 1;
    return [{ ...ambient, source: "built-in" }];
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    const preferred = this.preferredStructuredReadyProviders?.(Date.now()) || [];
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        adaptiveAmbientAi: false,
        livelyAmbientAi: true,
        ambientSingleCallBurst: true,
        ambientAiDominantWhenHealthy: true,
        ambientBuiltInFillerBetweenCalls: false,
        ambientBuiltInOnlyOnProviderFailure: true,
        ambientStillLegacyAuthoritative: false,
        ambientLivelySingleCallAuthoritative: true
      },
      livelyAmbientAi: {
        ...this.v37LivelyAmbientStats,
        preferredReadyProviders: preferred,
        burstLines: [LIVELY_AMBIENT_MIN_LINES, LIVELY_AMBIENT_MAX_LINES],
        nextIntervalMs: livelyAmbientIntervalMs(preferred.length),
        lastAmbientAiAgoMs: this.v37LastLivelyAmbientAiAt ? Math.max(0, Date.now() - this.v37LastLivelyAmbientAiAt) : null,
        policy: "one provider request creates a 3-5 line, 2-4 speaker room burst; built-in is failure-only while AI providers are healthy"
      }
    };
  }
}
