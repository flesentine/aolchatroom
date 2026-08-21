import baseWorker, { ChatRoom as ObligationChatRoom } from "./index_v21.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const BRAIN_MIN_MOVES = 4;
const BRAIN_MAX_MOVES = 7;
const BRAIN_MAX_TOKENS = 320;
const VOICE_MAX_TOKENS = 420;

function clean(value, max = 180) {
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

function compactPlan(plan) {
  if (!plan) return null;
  return {
    provider: plan.provider || "",
    reason: plan.reason || "",
    subject: plan.subject || "",
    goal: plan.goal || "",
    moveCount: plan.moves?.length || 0,
    createdAt: plan.createdAt || 0
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
        pass: "brain-voice-split-v22",
        providerPriority: ["gemini", "groq", "workers-ai"],
        architecture: {
          brainVoiceSplit: true,
          brainMoves: [BRAIN_MIN_MOVES, BRAIN_MAX_MOVES],
          brainChoosesMeaningSpeakerTarget: true,
          voiceOnlyWritesSurfaceText: true,
          humanInterruptReplans: true
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

export class ChatRoom extends ObligationChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastBrainPlan = null;
    this.brainVoiceStats = {
      brainCalls: 0,
      brainSuccesses: 0,
      brainFailures: 0,
      brainOutputRejects: 0,
      voiceCalls: 0,
      voiceSuccesses: 0,
      voiceFailures: 0,
      fallbackSingleLayer: 0,
      plannedMoves: 0,
      voicedMoves: 0
    };
  }

  brainAllowedTargets() {
    return new Set(["room", ...(this.activeBotNames || []), ...this.humanNames()]);
  }

  validateBrainMoves(rawMoves, activeNames) {
    const speakers = new Set(activeNames);
    const targets = this.brainAllowedTargets();
    const moves = [];

    for (const raw of Array.isArray(rawMoves) ? rawMoves : []) {
      const speaker = clean(raw?.speaker, 24);
      const target = clean(raw?.target || "room", 24) || "room";
      const intent = clean(raw?.intent || "conversation", 30) || "conversation";
      const topic = clean(raw?.topic || "general", 30) || "general";
      const meaning = clean(raw?.meaning || raw?.beat || raw?.purpose, 180);
      if (!speakers.has(speaker) || !targets.has(target) || !meaning) continue;
      moves.push({ speaker, target, intent, topic, meaning });
      if (moves.length >= BRAIN_MAX_MOVES) break;
    }

    return moves;
  }

  async callBrainProvider(prompt, activeNames, reason) {
    this.brainVoiceStats.brainCalls += 1;
    const providers = this.orderedReadyProviders(Date.now());

    for (const provider of providers) {
      const startedAt = Date.now();
      let result;
      try {
        result = await this.callProvider(provider, prompt, BRAIN_MAX_TOKENS);
      } catch (error) {
        this.noteProviderFailure(provider, 0, null, error?.message || "brain connection error");
        continue;
      }

      const latencyMs = Date.now() - startedAt;
      if (!result?.ok) {
        if (Number(result?.status || 0) === 200) {
          this.noteOutputReject(provider, "brain returned no readable output");
          this.brainVoiceStats.brainOutputRejects += 1;
        } else {
          this.noteProviderFailure(provider, Number(result?.status || 0), result?.response || null, result?.error?.message || "brain provider failed");
        }
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(extractJson(result.content));
      } catch (error) {
        this.noteOutputReject(provider, `brain JSON rejected: ${error?.message || "parse error"}`);
        this.brainVoiceStats.brainOutputRejects += 1;
        continue;
      }

      const rawMoves = parsed?.moves || parsed?.scene?.moves || parsed?.plan?.moves || [];
      const moves = this.validateBrainMoves(rawMoves, activeNames);
      if (moves.length < 2) {
        this.noteOutputReject(provider, "brain plan had fewer than two valid moves");
        this.brainVoiceStats.brainOutputRejects += 1;
        continue;
      }

      // Count the structured reasoning call as a healthy provider success, but with
      // zero emitted chat lines. The voice call below records the actual line count.
      this.noteProviderSuccess(provider, result.model, latencyMs, 0);
      this.brainVoiceStats.brainSuccesses += 1;
      this.brainVoiceStats.plannedMoves += moves.length;

      const plan = {
        provider,
        reason,
        subject: clean(parsed?.subject || parsed?.scene?.subject || parsed?.plan?.subject, 80),
        goal: clean(parsed?.goal || parsed?.scene?.goal || parsed?.plan?.goal, 120),
        moves,
        createdAt: Date.now()
      };
      this.lastBrainPlan = plan;
      this.broadcast({
        type: "brain_plan",
        action: "created",
        provider,
        reason,
        subject: plan.subject,
        moveCount: moves.length,
        at: plan.createdAt
      });
      return plan;
    }

    this.brainVoiceStats.brainFailures += 1;
    return null;
  }

  brainPrompt(active, reason, human = null) {
    const activeNames = active.map((character) => character.name);
    const humanBlock = human
      ? `\nHUMAN INTERRUPTION:\n${human.from}: ${human.text}\nResolved target: ${human.target || "room"}\nThe human's contribution is now part of reality. Plan from it, not around it.`
      : "";

    return `You are the BRAIN for a 1996 AOL Town Square simulation. Decide what the next conversational moves MEAN. Do NOT write the final chat wording.\n\n${this.plannerContext()}${humanBlock}\n\nALLOWED BOT SPEAKERS:\n${activeNames.join(", ")}\n\nPlan ${BRAIN_MIN_MOVES}-${BRAIN_MAX_MOVES} connected conversational moves. Preserve open questions and resolved reply ownership. Prefer continuing an existing live scene. At most one secondary overlap. Do not make everyone react. If the human spoke, only people who plausibly noticed should respond. A move's meaning should be plain semantic intent, not AOL-styled text.\n\nReturn JSON only:\n{\"subject\":\"short scene subject\",\"goal\":\"what this exchange is doing\",\"moves\":[{\"speaker\":\"JennJenn\",\"target\":\"Crateman\",\"intent\":\"reply\",\"topic\":\"location\",\"meaning\":\"acknowledges that Crateman said he is from Lakewood and asks if he likes it there\"}]}\n\nReason: ${reason}.`;
  }

  async voiceBrainPlan(plan, active, human = null) {
    if (!plan?.moves?.length) return [];
    this.brainVoiceStats.voiceCalls += 1;

    const speakers = new Set(plan.moves.map((move) => move.speaker));
    const voiceProfiles = active.filter((character) => speakers.has(character.name));
    const moveText = plan.moves.map((move, index) =>
      `${index + 1}. ${move.speaker} -> ${move.target} | ${move.intent} | ${move.topic} | MEANING: ${move.meaning}`
    ).join("\n");
    const humanLine = human ? `\nLatest human line that caused this replan: ${human.from}: ${human.text}` : "";

    const prompt = `You are the VOICE layer for a 1996 AOL chat simulation. The brain already decided who speaks, who they address, and what each turn means. Your ONLY job is to write the short on-screen wording in each character's own typing voice.\n\nCHARACTER VOICE PROFILES:\n${this.promptProfiles(voiceProfiles, voiceProfiles.length || 1)}\n\nBRAIN PLAN:\n${moveText}${humanLine}\n\nRules:\n- Keep EXACTLY the same move order and intended meaning.\n- Do not invent new facts, topics, speakers, or targets.\n- Keep lines short enough for a 1996 chat room.\n- Apply each character's own casing, punctuation, slang, typo, and emoticon habits; do not make every person type badly.\n- Do not make the wording sound like an assistant or narrator.\n\nReturn JSON only with one message per numbered move:\n{\"messages\":[{\"speaker\":\"JennJenn\",\"text\":\"oh lakewood? u like it there?\",\"target\":\"Crateman\",\"intent\":\"reply\",\"topic\":\"location\"}]}`;

    const voiced = await this.callGroq(prompt, VOICE_MAX_TOKENS, plan.moves.length, "room");
    if (!voiced?.length) {
      this.brainVoiceStats.voiceFailures += 1;
      return [];
    }

    // The brain, not the voice model, owns conversational structure. We keep only
    // the generated surface text and re-attach the brain's speaker/target/intent/topic.
    const final = [];
    for (let i = 0; i < Math.min(plan.moves.length, voiced.length); i += 1) {
      const move = plan.moves[i];
      const text = clean(voiced[i]?.text, 320);
      if (!text) continue;
      final.push({
        speaker: move.speaker,
        text,
        target: move.target,
        intent: move.intent,
        topic: move.topic,
        source: voiced[i]?.source || this.lastSuccessfulProvider || plan.provider || "ai",
        brainMeaning: move.meaning,
        brainProvider: plan.provider
      });
    }

    if (final.length) {
      this.brainVoiceStats.voiceSuccesses += 1;
      this.brainVoiceStats.voicedMoves += final.length;
      this.broadcast({
        type: "brain_plan",
        action: "voiced",
        provider: this.lastSuccessfulProvider || plan.provider,
        brainProvider: plan.provider,
        reason: plan.reason,
        moveCount: final.length,
        at: Date.now()
      });
    } else {
      this.brainVoiceStats.voiceFailures += 1;
    }
    return final;
  }

  async generateBackgroundPlan() {
    this.ensureTalkers(Date.now());
    const active = this.activeCharacters().slice(0, 8);
    if (!active.length) return [];

    const brain = await this.callBrainProvider(this.brainPrompt(active, "background"), active.map((character) => character.name), "background");
    if (!brain) {
      this.brainVoiceStats.fallbackSingleLayer += 1;
      return super.generateBackgroundPlan();
    }

    const voiced = await this.voiceBrainPlan(brain, active, null);
    if (voiced.length >= 2) return voiced;
    this.brainVoiceStats.fallbackSingleLayer += 1;
    return super.generateBackgroundPlan();
  }

  async generateHumanReplan(human) {
    this.ensureTalkers(Date.now());
    if (human?.target && human.target !== "room") this.promoteTalker?.(human.target, Date.now());
    const active = this.activeCharacters().slice(0, 8);
    if (!active.length) return [];

    const brain = await this.callBrainProvider(this.brainPrompt(active, "human-replan", human), active.map((character) => character.name), "human-replan");
    if (!brain) {
      this.brainVoiceStats.fallbackSingleLayer += 1;
      return super.generateHumanReplan(human);
    }

    const voiced = await this.voiceBrainPlan(brain, active, human);
    if (voiced.length >= 1) return voiced;
    this.brainVoiceStats.fallbackSingleLayer += 1;
    return super.generateHumanReplan(human);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status") return response;

    try {
      const data = await response.json();
      return Response.json({
        ...data,
        pass: "brain-voice-split-v22",
        brainVoice: {
          ...this.brainVoiceStats,
          lastPlan: compactPlan(this.lastBrainPlan)
        }
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "brain-voice-split-v22",
      brainVoice: {
        ...this.brainVoiceStats,
        lastPlan: compactPlan(this.lastBrainPlan)
      }
    };
  }
}
