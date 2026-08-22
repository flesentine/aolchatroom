import baseWorker, { ChatRoom as HarnessChatRoom } from "./index_v24.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V25_HARNESS_START_KEY = "realismHarnessV25Start";
const HARD_HUMAN_GATE_BASE_MS = 5200;
const HARD_HUMAN_GATE_MAX_MS = 8200;
const VOICE_MAX_TOKENS = 420;
const SOFT_REJECT_THRESHOLD = 4;
const SOFT_REJECT_MS = {
  gemini: 60000,
  groq: 120000,
  "workers-ai": 300000
};

function clean(value, max = 320) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function lineKey(speaker, text) {
  return `${String(speaker || "")}\n${String(text || "")}`;
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

function voiceRows(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  for (const value of [parsed.messages, parsed.lines, parsed.responses, parsed.output, parsed.results]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function textFromVoiceRow(row) {
  if (typeof row === "string") return clean(row);
  if (!row || typeof row !== "object") return "";
  return clean(row.text || row.line || row.message || row.response || row.content || "");
}

function stableHumanGate(message) {
  const seed = `${message?.from || ""}|${message?.text || ""}|${Math.floor(Date.now() / 1000)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const reading = Math.min(900, String(message?.text || "").length * 18);
  const jitter = Math.abs(hash >>> 0) % 2100;
  return Math.min(HARD_HUMAN_GATE_MAX_MS, HARD_HUMAN_GATE_BASE_MS + reading + jitter);
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
        pass: "final-realism-polish-v25",
        providerPriority: PROVIDER_PRIORITY,
        polish: {
          directVoiceParsing: true,
          sceneContinuityAcrossHumanInterrupts: true,
          hardHumanReplyGateMs: [HARD_HUMAN_GATE_BASE_MS, HARD_HUMAN_GATE_MAX_MS],
          providerSoftRejectCircuitBreaker: true,
          newHarnessWindow: true
        },
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

export class ChatRoom extends HarnessChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v25HarnessLoaded = false;
    this.lastHumanLineAt = 0;
    this.noBotBefore = 0;
    this.sceneCarryByLine = new Map();
    this.providerRejectStreak = new Map();
    this.providerSoftRejectUntil = new Map();
    this.v25Stats = {
      hardGateActivations: 0,
      hardGateWaits: 0,
      directVoiceCalls: 0,
      directVoiceSuccesses: 0,
      directVoiceRejects: 0,
      directVoiceLines: 0,
      sceneCarries: 0,
      softCircuitTrips: 0,
      softCircuitSkips: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (this.v25HarnessLoaded) return;
    let started = Number(await this.ctx.storage.get(V25_HARNESS_START_KEY) || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V25_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v25HarnessLoaded = true;
  }

  softReady(provider, now = Date.now()) {
    return now >= Number(this.providerSoftRejectUntil.get(provider) || 0);
  }

  orderedReadyProviders(now = Date.now()) {
    const hardReady = super.orderedReadyProviders(now);
    if (!hardReady.length) return [];
    const filtered = hardReady.filter((provider) => {
      const ready = this.softReady(provider, now);
      if (!ready) this.v25Stats.softCircuitSkips += 1;
      return ready;
    });
    // Never let the soft breaker make the room completely silent. If every healthy
    // provider is temporarily suppressed, allow the highest-priority healthy one.
    return filtered.length ? filtered : hardReady.slice(0, 1);
  }

  noteOutputReject(provider, detail) {
    const streak = Number(this.providerRejectStreak.get(provider) || 0) + 1;
    this.providerRejectStreak.set(provider, streak);
    if (streak >= SOFT_REJECT_THRESHOLD) {
      const duration = SOFT_REJECT_MS[provider] || 120000;
      const until = Date.now() + duration;
      const previous = Number(this.providerSoftRejectUntil.get(provider) || 0);
      if (until > previous) {
        this.providerSoftRejectUntil.set(provider, until);
        this.v25Stats.softCircuitTrips += 1;
        this.providerEvent?.(provider, {
          state: "soft-suppressed",
          cooldownMs: duration,
          detail: `too many unusable outputs; soft retry pause after ${streak} rejects`
        });
      }
    }
    return super.noteOutputReject(provider, detail);
  }

  noteProviderSuccess(provider, model, latencyMs, messageCount) {
    // Brain-only successes use messageCount=0. Keep a reject streak until the
    // provider proves it can emit usable surface chat again.
    if (Number(messageCount || 0) > 0) {
      this.providerRejectStreak.set(provider, 0);
      this.providerSoftRejectUntil.delete(provider);
    }
    return super.noteProviderSuccess(provider, model, latencyMs, messageCount);
  }

  pushMessage(message) {
    const result = super.pushMessage(message);
    if (message?.kind === "human") {
      const row = (this.history || [])[this.history.length - 1];
      const at = Number(row?.at || Date.now());
      const delay = stableHumanGate(row || message);
      this.lastHumanLineAt = at;
      this.noBotBefore = Math.max(this.noBotBefore, at + delay);
      this.v25Stats.hardGateActivations += 1;
    }
    return result;
  }

  registerSceneCarry(item, sceneId, planId) {
    if (!item?.speaker || !item?.text || !sceneId) return;
    const key = lineKey(item.speaker, item.text);
    const rows = this.sceneCarryByLine.get(key) || [];
    rows.push({ sceneId, planId });
    this.sceneCarryByLine.set(key, rows.slice(-8));
  }

  claimSceneCarry(speaker, text) {
    const key = lineKey(speaker, text);
    const rows = this.sceneCarryByLine.get(key) || [];
    if (!rows.length) return null;
    const row = rows.shift();
    if (rows.length) this.sceneCarryByLine.set(key, rows);
    else this.sceneCarryByLine.delete(key);
    return row;
  }

  clearSceneCarryPlan(planId) {
    if (!planId) return;
    for (const [key, rows] of this.sceneCarryByLine.entries()) {
      const kept = rows.filter((row) => row.planId !== planId);
      if (kept.length) this.sceneCarryByLine.set(key, kept);
      else this.sceneCarryByLine.delete(key);
    }
  }

  discardPlannedFuture(reason = "human-interrupt") {
    const planId = this.currentScenePlan?.id || "";
    const result = super.discardPlannedFuture(reason);
    if (planId) this.clearSceneCarryPlan(planId);
    return result;
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    const queued = super.queueScenePlan(lines, reason, trigger, front);
    if (!queued || reason !== "human-replan" || !trigger) return queued;

    const humanRow = this.humanHistoryRow?.(trigger);
    const sceneId = humanRow?.sceneId || "";
    const planId = this.currentScenePlan?.id || "";
    if (!sceneId || !planId) return queued;

    let carried = 0;
    for (const item of this.aiQueue || []) {
      if (item?._scenePlanId !== planId) continue;
      item._continuitySceneId = sceneId;
      this.registerSceneCarry(item, sceneId, planId);
      carried += 1;
    }
    if (carried) this.v25Stats.sceneCarries += carried;
    return queued;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind !== "bot") return super.say(from, text, kind, source, meta);
    const carry = this.claimSceneCarry(from, text);
    if (!carry?.sceneId) return super.say(from, text, kind, source, meta);
    return super.say(from, text, kind, source, { ...meta, sceneId: carry.sceneId });
  }

  async voiceBrainPlan(plan, active, human = null) {
    if (!plan?.moves?.length) return [];
    this.brainVoiceStats.voiceCalls += 1;
    this.v25Stats.directVoiceCalls += 1;

    const speakers = new Set(plan.moves.map((move) => move.speaker));
    const voiceProfiles = active.filter((character) => speakers.has(character.name));
    const moveText = plan.moves.map((move, index) =>
      `${index + 1}. ${move.speaker} -> ${move.target} | ${move.intent} | ${move.topic} | MEANING: ${move.meaning}`
    ).join("\n");
    const humanLine = human ? `\nLatest human line that caused this replan: ${human.from}: ${human.text}` : "";

    const prompt = `You are the VOICE layer for a 1996 AOL chat simulation. The brain already decided who speaks, who they address, and what every move means. Your ONLY job is to write the short on-screen wording.\n\nCHARACTER VOICE PROFILES:\n${this.promptProfiles(voiceProfiles, voiceProfiles.length || 1)}\n\nBRAIN PLAN:\n${moveText}${humanLine}\n\nRules:\n- Return exactly one short line for each numbered move, in the same order.\n- Do not decide speakers, targets, topics, or conversational structure; those are already fixed.\n- Preserve the intended meaning without adding new facts.\n- Use each character's own casing, punctuation, slang, typo, and emoticon habits.\n- Keep it casual and 1996-appropriate.\n\nReturn JSON only:\n{\"messages\":[{\"text\":\"short chat line\"},{\"text\":\"next short chat line\"}]}`;

    const providers = this.orderedReadyProviders(Date.now());
    for (const provider of providers) {
      const startedAt = Date.now();
      let result;
      try {
        result = await this.callProvider(provider, prompt, VOICE_MAX_TOKENS);
      } catch (error) {
        this.noteProviderFailure(provider, 0, null, error?.message || "voice connection error");
        continue;
      }

      const latencyMs = Date.now() - startedAt;
      if (!result?.ok) {
        if (Number(result?.status || 0) === 200) {
          this.v25Stats.directVoiceRejects += 1;
          this.noteOutputReject(provider, "voice returned no readable output");
        } else {
          this.noteProviderFailure(provider, Number(result?.status || 0), result?.response || null, result?.error?.message || "voice provider failed");
        }
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(extractJson(result.content));
      } catch (error) {
        this.v25Stats.directVoiceRejects += 1;
        this.noteOutputReject(provider, `voice JSON rejected: ${error?.message || "parse error"}`);
        continue;
      }

      const rows = voiceRows(parsed);
      const final = [];
      for (let i = 0; i < plan.moves.length; i += 1) {
        const text = textFromVoiceRow(rows[i]);
        if (!text) continue;
        const move = plan.moves[i];
        final.push({
          speaker: move.speaker,
          text,
          target: move.target,
          intent: move.intent,
          topic: move.topic,
          source: provider,
          brainMeaning: move.meaning,
          brainProvider: plan.provider
        });
      }

      const minimumUseful = Math.min(plan.moves.length, human ? 1 : 2);
      if (final.length < minimumUseful) {
        this.v25Stats.directVoiceRejects += 1;
        this.noteOutputReject(provider, `voice returned only ${final.length}/${plan.moves.length} usable lines`);
        continue;
      }

      this.rememberMessageProvider?.(final, provider);
      this.noteProviderSuccess(provider, result.model, latencyMs, final.length);
      this.setAiStatus(`AI active · ${provider === "gemini" ? "Gemini" : provider === "groq" ? "Groq" : "Workers AI"}`);
      this.brainVoiceStats.voiceSuccesses += 1;
      this.brainVoiceStats.voicedMoves += final.length;
      this.v25Stats.directVoiceSuccesses += 1;
      this.v25Stats.directVoiceLines += final.length;
      this.broadcast({
        type: "brain_plan",
        action: "voiced-direct-v25",
        provider,
        brainProvider: plan.provider,
        reason: plan.reason,
        moveCount: final.length,
        at: Date.now()
      });
      return final;
    }

    this.brainVoiceStats.voiceFailures += 1;
    return [];
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    const now = Date.now();
    if (this.lastHumanLineAt && now < this.noBotBefore) {
      this.v25Stats.hardGateWaits += 1;
      this.nextBotAt = Math.max(Number(this.nextBotAt || 0), this.noBotBefore);
      return;
    }
    return super.tick(forceSoon);
  }

  v25Snapshot(now = Date.now()) {
    const softSuppressed = {};
    for (const provider of this.configuredProviders?.() || []) {
      softSuppressed[provider] = {
        rejectStreak: Number(this.providerRejectStreak.get(provider) || 0),
        softCooldownMs: Math.max(0, Number(this.providerSoftRejectUntil.get(provider) || 0) - now)
      };
    }
    return {
      ...this.v25Stats,
      hardGateRemainingMs: Math.max(0, this.noBotBefore - now),
      softSuppressed
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({
        ...data,
        pass: "final-realism-polish-v25",
        v25: this.v25Snapshot()
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "final-realism-polish-v25",
      v25: this.v25Snapshot()
    };
  }
}
