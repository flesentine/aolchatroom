import baseWorker, { ChatRoom as TextureChatRoom } from "./index_v18.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const HUMAN_AI_MIN_GAP_MS = 2600;
const AI_QUEUE_LOW_WATER = 2;
const AI_BATCH_MAX = 6;

const REFILL_WINDOWS = {
  quiet: [30000, 50000],
  chat: [16000, 26000],
  burst: [9500, 17000]
};

function randomInt(min, max) {
  return min + Math.floor(Math.random() * Math.max(1, max - min + 1));
}

function isAiSource(source) {
  return ["groq", "gemini", "workers-ai", "ai"].includes(String(source || ""));
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
        pass: "ai-first-scene-coverage-v19",
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
    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends TextureChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastSmartHumanAt = 0;
    this.lastScenePlanAt = 0;
    this.nextScenePlanAt = Date.now() + 4500;
    this.aiCoverageStats = {
      sceneCalls: 0,
      sceneLinesQueued: 0,
      humanCalls: 0,
      humanLinesQueued: 0,
      botLines: 0,
      aiBotLines: 0,
      proceduralBotLines: 0,
      emptyAiCalls: 0
    };
  }

  readyProviders(now = Date.now()) {
    return this.configuredProviders().filter((provider) => this.providerReady(provider, now));
  }

  hasReadyAi(now = Date.now()) {
    return this.readyProviders(now).length > 0;
  }

  sceneRefillDelay() {
    const phase = this.roomPhase || "chat";
    const [min, max] = REFILL_WINDOWS[phase] || REFILL_WINDOWS.chat;
    return randomInt(min, max);
  }

  pushMessage(message) {
    if (message?.kind === "bot") {
      this.aiCoverageStats.botLines += 1;
      if (isAiSource(message.source)) this.aiCoverageStats.aiBotLines += 1;
      else this.aiCoverageStats.proceduralBotLines += 1;
    }
    return super.pushMessage(message);
  }

  async generateAiSceneBatch() {
    this.ensureTalkers(Date.now());
    const active = this.activeCharacters().slice(0, 8);
    if (!active.length) return [];

    const recent = this.recentTranscript(16) || "The room has been quiet.";
    const humanNames = this.humanNames();
    const prompt = `You are planning the NEXT few sends in a crowded 1996 AOL Town Square room.\n\nFIXED PROFILES FOR THE ONLY BOTS ALLOWED TO SPEAK IN THIS BATCH:\n${this.promptProfiles(active, 8)}\n\nReal humans present: ${humanNames.join(", ") || "none"}. Never invent facts about them.\n\nRECENT ROOM TRANSCRIPT:\n${recent}\n\nGenerate 4 to ${AI_BATCH_MAX} plausible NEXT chat lines as one small conversational scene plan. Continue an existing live scene whenever possible. Most lines should answer, react to, clarify, disagree with, or naturally extend something somebody actually said. Do NOT generate six unrelated conversation starters. One secondary overlapping exchange is okay. If a question is open, let somebody plausibly answer it. If the room has no momentum, start only ONE ordinary-life subject. Keep each line short, messy, casual, and 1996-appropriate. It is fine for one participant to send twice. Do not make every visible person speak.\n\nOutput JSON only:\n{"messages":[{"speaker":"JennJenn","text":"...","target":"NYMike23","intent":"thread-reply","topic":"work"}]}\n\nOnly use speakers from: ${active.map((character) => character.name).join(", ")}.`;

    return this.callGroq(prompt, 360, AI_BATCH_MAX, "room");
  }

  queueAiLines(lines, reason = "scene") {
    let queued = 0;
    for (const item of (lines || []).slice(0, AI_BATCH_MAX)) {
      if (!item?.speaker || !item?.text) continue;
      this.aiQueue.push({
        ...item,
        source: item.source || this.lastSuccessfulProvider || "ai",
        intent: item.intent || (reason === "human" ? "reply" : "conversation"),
        target: item.target || "room",
        topic: item.topic || "general"
      });
      queued += 1;
    }
    return queued;
  }

  async refillSceneAi(now = Date.now(), force = false) {
    if (this.pendingHumans.length) return false;
    if (this.aiQueue.length >= AI_QUEUE_LOW_WATER) return false;
    if (!this.hasReadyAi(now)) return false;
    if (!force && now < this.nextScenePlanAt) return false;

    this.lastScenePlanAt = now;
    this.nextScenePlanAt = now + this.sceneRefillDelay();
    this.aiCoverageStats.sceneCalls += 1;

    const lines = await this.generateAiSceneBatch();
    const queued = this.queueAiLines(lines, "scene");
    this.aiCoverageStats.sceneLinesQueued += queued;
    if (!queued) this.aiCoverageStats.emptyAiCalls += 1;
    return queued > 0;
  }

  async handlePendingHumanWithAi(now = Date.now()) {
    if (!this.pendingHumans.length || !this.hasReadyAi(now)) return "none";

    const elapsed = now - this.lastSmartHumanAt;
    if (elapsed < HUMAN_AI_MIN_GAP_MS) {
      this.nextBotAt = Math.max(Number(this.nextBotAt || 0), now + (HUMAN_AI_MIN_GAP_MS - elapsed));
      return "wait";
    }

    const human = this.pendingHumans.shift();
    if (!human) return "none";
    this.lastSmartHumanAt = now;
    this.aiCoverageStats.humanCalls += 1;

    const replies = await this.generateGroqHumanReply(human);
    const queued = this.queueAiLines(replies, "human");
    this.aiCoverageStats.humanLinesQueued += queued;

    if (!queued) {
      this.aiCoverageStats.emptyAiCalls += 1;
      // The provider router will have cooled failed providers. Put the human back so
      // the inherited emergency path can answer only if AI really is unavailable.
      this.pendingHumans.unshift(human);
      return "failed";
    }

    return "queued";
  }

  builtInHumanReply(human) {
    // If an AI provider is healthy, do not replace a human-facing answer with canned
    // chatter. The pending-human path above will wait a moment for an AI response.
    if (this.hasReadyAi(Date.now())) return [];
    return super.builtInHumanReply(human);
  }

  builtInAmbient() {
    // When AI is available, the background room should be AI-aware or quiet.
    if (this.hasReadyAi(Date.now())) return null;
    return super.builtInAmbient();
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    const now = Date.now();

    if (this.pendingHumans.length && this.hasReadyAi(now)) {
      const humanResult = await this.handlePendingHumanWithAi(now);
      if (humanResult === "wait") return;
    } else if (!this.pendingHumans.length && this.aiQueue.length < AI_QUEUE_LOW_WATER) {
      await this.refillSceneAi(now, forceSoon && this.aiQueue.length === 0);
    }

    await super.tick(forceSoon);

    // If a batch was drained quickly during a burst, arrange the next AI scene sooner
    // instead of waiting for the old 65-second background-generation cadence.
    if (!this.pendingHumans.length && this.aiQueue.length < AI_QUEUE_LOW_WATER && this.hasReadyAi(Date.now())) {
      this.nextScenePlanAt = Math.min(this.nextScenePlanAt, Date.now() + this.sceneRefillDelay());
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    const botLines = Math.max(1, this.aiCoverageStats.botLines);
    return {
      ...base,
      pass: "ai-first-scene-coverage-v19",
      aiCoverage: {
        ...this.aiCoverageStats,
        percentAi: Math.round((this.aiCoverageStats.aiBotLines / botLines) * 100),
        queueDepth: this.aiQueue.length,
        readyProviders: this.readyProviders(Date.now()),
        nextScenePlanInMs: Math.max(0, this.nextScenePlanAt - Date.now())
      }
    };
  }
}
