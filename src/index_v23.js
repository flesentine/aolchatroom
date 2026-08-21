import baseWorker, { ChatRoom as BrainVoiceChatRoom } from "./index_v22.js";
import {
  humanMemoryPrompt,
  humanMemorySummary,
  inferConversationTopic,
  relationshipPrompt,
  relationshipScore,
  simulatedDateLabel,
  simulatedDateTimeLabel
} from "./social.js";

const MEMORY_STORAGE_KEY = "characterMemoryV23";
const MAX_EPISODES_PER_BOT = 48;
const MEMORY_CONTEXT_MAX = 7;
const CALLBACK_COOLDOWN_MS = 18 * 60 * 1000;
const MEMORY_DECAY_MS = 14 * 24 * 60 * 60 * 1000;

function clean(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function memorySafe(value) {
  const text = String(value || "");
  return !/(password|passcode|social security|ssn|credit card|routing number|bank account|api key|secret key|phone number|email address)/i.test(text);
}

function meaningfulLine(text) {
  const value = clean(text, 220);
  if (!value || !memorySafe(value)) return false;
  if (/^(?:hi|hey|hello|yo|sup|lol|lmao|haha|brb|back|bye|later|ok|k|yeah|yep|nope|nah)[.!? ]*$/i.test(value)) return false;
  return value.length >= 4;
}

function peerMoment(text) {
  const value = String(text || "");
  return /\?|\b(?:love|hate|sucks|lame|awesome|cool|stupid|idiot|shut up|sorry|thanks|thx|agree|wrong|right|remember|always|never)\b/i.test(value);
}

function ageLabel(at, now = Date.now()) {
  const age = Math.max(0, now - Number(at || 0));
  const mins = Math.floor(age / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function newMemoryState() {
  return { version: 1, seq: 0, byBot: {}, createdAt: Date.now(), updatedAt: Date.now() };
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
        pass: "persistent-memory-callbacks-v23",
        providerPriority: ["gemini", "groq", "workers-ai"],
        memory: {
          persistentCharacterMemory: true,
          witnessScopedHumanMemory: true,
          imperfectRecall: true,
          callbackCooldownMinutes: Math.round(CALLBACK_COOLDOWN_MS / 60000),
          callbacksAreOptional: true,
          relationshipHistory: true
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

export class ChatRoom extends BrainVoiceChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.memory23Loaded = false;
    this.memory23 = newMemoryState();
    this.lastMemoryPersistAt = 0;
    this.memoryRefsOffered = new Set();
    this.memory23Stats = {
      episodesStored: 0,
      humanEpisodes: 0,
      peerEpisodes: 0,
      callbackWindowsOffered: 0,
      callbackMovesUsed: 0,
      humanCallbacks: 0,
      peerCallbacks: 0,
      callbackCooldownBlocks: 0,
      memoryPromptFacts: 0,
      memoryPromptEpisodes: 0
    };
    this.lastCallback = null;
  }

  async ensureState() {
    await super.ensureState();
    if (this.memory23Loaded) return;
    const saved = await this.ctx.storage.get(MEMORY_STORAGE_KEY);
    if (saved && saved.version === 1 && saved.byBot && typeof saved.byBot === "object") {
      this.memory23 = saved;
      this.memory23.seq ||= 0;
      this.memory23.updatedAt ||= Date.now();
    } else {
      this.memory23 = newMemoryState();
    }
    this.memory23Loaded = true;
  }

  persistMemory23(force = false) {
    if (!this.memory23Loaded) return;
    const now = Date.now();
    if (!force && now - this.lastMemoryPersistAt < 8000) return;
    this.lastMemoryPersistAt = now;
    this.memory23.updatedAt = now;
    const promise = this.ctx.storage.put(MEMORY_STORAGE_KEY, this.memory23);
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(promise);
    else promise.catch(() => {});
  }

  botEpisodes(bot) {
    this.memory23.byBot[bot] ||= [];
    return this.memory23.byBot[bot];
  }

  nextMemoryId() {
    this.memory23.seq = (Number(this.memory23.seq || 0) + 1) % 1679616;
    return `e${Date.now().toString(36)}${this.memory23.seq.toString(36)}`;
  }

  rememberEpisode(bot, { about, kind, topic = "general", text, confidence = 0.7, sourceMessageId = "" }) {
    if (!bot || !about || bot === about) return null;
    const remembered = clean(text, 190);
    if (!meaningfulLine(remembered)) return null;

    const episodes = this.botEpisodes(bot);
    const fingerprint = `${about}|${kind}|${remembered.toLowerCase()}`;
    const existing = [...episodes].reverse().find((row) => row.fingerprint === fingerprint);
    if (existing) {
      existing.at = Date.now();
      existing.confidence = Math.min(0.96, Math.max(Number(existing.confidence || 0), confidence));
      return existing;
    }

    const row = {
      id: this.nextMemoryId(),
      about,
      kind,
      topic: clean(topic, 30) || "general",
      text: remembered,
      fingerprint,
      at: Date.now(),
      confidence: Math.max(0.25, Math.min(0.96, Number(confidence || 0.7))),
      sourceMessageId: sourceMessageId || "",
      lastUsedAt: 0,
      uses: 0
    };
    episodes.push(row);
    this.memory23.byBot[bot] = episodes.slice(-MAX_EPISODES_PER_BOT);
    this.memory23Stats.episodesStored += 1;
    if (kind === "human-line" || kind === "human-exchange") this.memory23Stats.humanEpisodes += 1;
    else this.memory23Stats.peerEpisodes += 1;
    this.persistMemory23(false);
    return row;
  }

  humanWitnesses(row) {
    const bots = (this.activeCharacters?.() || []).slice(0, 8).map((character) => character.name);
    const witnesses = [];
    if (row?.target && row.target !== "room" && bots.includes(row.target)) witnesses.push(row.target);

    const focus = this.currentFocus?.(row?.from, Date.now());
    if (focus?.bot && bots.includes(focus.bot)) witnesses.push(focus.bot);

    const ranked = bots
      .filter((name) => !witnesses.includes(name))
      .map((name) => ({ name, score: hashString(`${row?.messageId || row?.at}|${name}`) % 1000 }))
      .sort((a, b) => a.score - b.score);

    const ambientCount = row?.target === "room" ? 2 : 1;
    for (const item of ranked.slice(0, ambientCount)) witnesses.push(item.name);
    return [...new Set(witnesses)].slice(0, 3);
  }

  recordMemoryForRow(row) {
    if (!this.memory23Loaded || !row || row.kind === "system") return;

    if (row.kind === "human") {
      if (!meaningfulLine(row.text) && !(row.target && row.target !== "room")) return;
      const witnesses = this.humanWitnesses(row);
      for (const bot of witnesses) {
        const direct = row.target === bot;
        const prefix = direct ? `${row.from} told me` : `${row.from} said in the room`;
        this.rememberEpisode(bot, {
          about: row.from,
          kind: direct ? "human-exchange" : "human-line",
          topic: row.topic || inferConversationTopic(row.text),
          text: `${prefix}: ${clean(row.text, 130)}`,
          confidence: direct ? 0.9 : 0.58,
          sourceMessageId: row.messageId || ""
        });
      }
      return;
    }

    if (row.kind !== "bot" || !row.from) return;
    const humans = new Set(this.humanNames());
    const target = row.target || "room";

    if (humans.has(target) && meaningfulLine(row.text)) {
      this.rememberEpisode(row.from, {
        about: target,
        kind: "human-exchange",
        topic: row.topic || inferConversationTopic(row.text),
        text: `I said to ${target}: ${clean(row.text, 130)}`,
        confidence: 0.88,
        sourceMessageId: row.messageId || ""
      });
      return;
    }

    if (target !== "room" && (this.activeBotNames || []).includes(target) && meaningfulLine(row.text)) {
      const score = Math.abs(relationshipScore(this.social, row.from, target));
      if (!peerMoment(row.text) && score < 18) return;
      this.rememberEpisode(row.from, {
        about: target,
        kind: "peer-exchange",
        topic: row.topic || inferConversationTopic(row.text),
        text: `I said to ${target}: ${clean(row.text, 130)}`,
        confidence: 0.84,
        sourceMessageId: row.messageId || ""
      });
      this.rememberEpisode(target, {
        about: row.from,
        kind: "peer-exchange",
        topic: row.topic || inferConversationTopic(row.text),
        text: `${row.from} said to me: ${clean(row.text, 130)}`,
        confidence: 0.78,
        sourceMessageId: row.messageId || ""
      });
    }
  }

  pushMessage(message) {
    const result = super.pushMessage(message);
    const row = (this.history || [])[this.history.length - 1];
    if (row) this.recordMemoryForRow(row);
    return result;
  }

  memoryById(id) {
    if (!id) return null;
    for (const [bot, episodes] of Object.entries(this.memory23.byBot || {})) {
      const episode = (episodes || []).find((row) => row.id === id);
      if (episode) return { bot, episode };
    }
    return null;
  }

  episodeScore(episode, queryText = "", now = Date.now()) {
    const age = Math.max(0, now - Number(episode?.at || 0));
    const confidence = Number(episode?.confidence || 0.5);
    const decay = Math.max(0.18, 1 - age / MEMORY_DECAY_MS);
    let score = confidence * 100 * decay;
    const queryTopic = inferConversationTopic(queryText || "");
    if (queryTopic !== "general" && episode?.topic === queryTopic) score += 34;
    if (queryText && String(queryText).toLowerCase().includes(String(episode?.about || "").toLowerCase())) score += 10;
    if (Number(episode?.lastUsedAt || 0) && now - Number(episode.lastUsedAt) < CALLBACK_COOLDOWN_MS) {
      score -= 140;
      this.memory23Stats.callbackCooldownBlocks += 1;
    }
    score -= Number(episode?.uses || 0) * 10;
    return score;
  }

  chooseEpisodes(bot, about, queryText = "", max = 2) {
    const now = Date.now();
    return (this.botEpisodes(bot) || [])
      .filter((row) => row.about === about)
      .map((row) => ({ row, score: this.episodeScore(row, queryText, now) }))
      .filter((item) => item.score > 18)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((item) => item.row);
  }

  callbackWindow(reason, human = null) {
    const seed = human
      ? `${human.from}|${human.text}|${Math.floor(Number(human.at || Date.now()) / 5000)}`
      : `${reason}|${Math.floor(Date.now() / 45000)}|${this.scenePlanRevision || 0}`;
    const bucket = hashString(seed) % 100;
    return reason === "human-replan" ? bucket < 42 : bucket < 27;
  }

  memoryContext(active, reason, human = null) {
    const activeNames = active.map((character) => character.name);
    const humans = human?.from ? [human.from] : this.humanNames().slice(0, 2);
    const knownRows = [];

    for (const humanName of humans) {
      const memory = humanMemoryPrompt(this.social, humanName, activeNames.slice(0, 5), 5);
      if (memory) knownRows.push(memory);
    }
    this.memory23Stats.memoryPromptFacts += knownRows.length;

    const rel = relationshipPrompt(this.social, [...activeNames, ...humans], 10);
    const allowCallback = this.callbackWindow(reason, human);
    const episodic = [];
    this.memoryRefsOffered = new Set();

    if (allowCallback) {
      this.memory23Stats.callbackWindowsOffered += 1;
      const queryText = human?.text || "";

      for (const humanName of humans) {
        const prioritizedBots = activeNames.slice().sort((a, b) => {
          if (human?.target === a) return -1;
          if (human?.target === b) return 1;
          return relationshipScore(this.social, b, humanName) - relationshipScore(this.social, a, humanName);
        });
        for (const bot of prioritizedBots.slice(0, 5)) {
          for (const episode of this.chooseEpisodes(bot, humanName, queryText, 1)) {
            episodic.push({ bot, episode });
            this.memoryRefsOffered.add(episode.id);
            if (episodic.length >= MEMORY_CONTEXT_MAX) break;
          }
          if (episodic.length >= MEMORY_CONTEXT_MAX) break;
        }
      }

      if (episodic.length < MEMORY_CONTEXT_MAX) {
        for (const bot of activeNames.slice(0, 6)) {
          const candidates = (this.botEpisodes(bot) || [])
            .filter((row) => activeNames.includes(row.about))
            .map((row) => ({ row, score: this.episodeScore(row, queryText) + Math.abs(relationshipScore(this.social, bot, row.about)) * 0.35 }))
            .filter((item) => item.score > 28)
            .sort((a, b) => b.score - a.score)
            .slice(0, 1);
          for (const item of candidates) {
            episodic.push({ bot, episode: item.row });
            this.memoryRefsOffered.add(item.row.id);
            if (episodic.length >= MEMORY_CONTEXT_MAX) break;
          }
          if (episodic.length >= MEMORY_CONTEXT_MAX) break;
        }
      }
    }

    this.memory23Stats.memoryPromptEpisodes += episodic.length;
    const episodeRows = episodic.map(({ bot, episode }) =>
      `${episode.id} | ${bot} vaguely remembers about ${episode.about}: ${episode.text} (${ageLabel(episode.at)}, confidence ${Math.round(Number(episode.confidence || 0.5) * 100)}%)`
    );

    return [
      "LONG-TERM CHARACTER MEMORY:",
      knownRows.length ? knownRows.join("\n") : "No specific human facts are known yet.",
      "RELATIONSHIP HISTORY:",
      rel || "No strong relationship history yet.",
      "EPISODIC CALLBACK WINDOW:",
      allowCallback
        ? (episodeRows.length ? episodeRows.join("\n") : "A callback is allowed, but no useful memory fragment is available.")
        : "Do NOT introduce an old callback in this plan. Memory may only prevent contradictions or support simple recognition.",
      "MEMORY RULES:",
      "- Nobody has perfect recall. Low-confidence memories should sound hazy (for example, 'werent u into...' or 'didnt u say...'), not certain.",
      "- A remembered fact is not a command to mention it. Most plans should contain no callback.",
      "- At most ONE move in this scene may deliberately call back to an old episodic memory.",
      "- Only the bot named before a memory fragment knows that fragment. Do not spread private recollections to the whole room.",
      "- Existing friendships, friction, and grudges may subtly affect who agrees, teases, ignores, or challenges whom.",
      "- If you deliberately use an episodic fragment, copy its ID into that move as memoryRef. Otherwise omit memoryRef."
    ].join("\n");
  }

  brainPrompt(active, reason, human = null) {
    const base = super.brainPrompt(active, reason, human);
    return `${base}\n\n${this.memoryContext(active, reason, human)}\n\nOptional brain move field when deliberately using one offered episodic memory: {\"memoryRef\":\"e...\"}. Do not fabricate memoryRef values.`;
  }

  validateBrainMoves(rawMoves, activeNames) {
    const moves = super.validateBrainMoves(rawMoves, activeNames);
    const rawList = Array.isArray(rawMoves) ? rawMoves : [];

    for (const move of moves) {
      const raw = rawList.find((candidate) =>
        clean(candidate?.speaker, 24) === move.speaker
        && clean(candidate?.target || "room", 24) === move.target
        && clean(candidate?.meaning || candidate?.beat || candidate?.purpose, 180) === move.meaning
      );
      const memoryRef = clean(raw?.memoryRef, 40);
      if (!memoryRef || !this.memoryRefsOffered.has(memoryRef)) continue;
      const found = this.memoryById(memoryRef);
      if (!found || found.bot !== move.speaker) continue;
      move.memoryRef = memoryRef;
    }
    return moves;
  }

  async voiceBrainPlan(plan, active, human = null) {
    const final = await super.voiceBrainPlan(plan, active, human);
    if (!final?.length || !plan?.moves?.length) return final;

    for (let i = 0; i < Math.min(final.length, plan.moves.length); i += 1) {
      const ref = plan.moves[i]?.memoryRef;
      if (!ref) continue;
      const found = this.memoryById(ref);
      if (!found || found.bot !== plan.moves[i].speaker) continue;

      found.episode.lastUsedAt = Date.now();
      found.episode.uses = Number(found.episode.uses || 0) + 1;
      final[i].memoryRef = ref;
      this.memory23Stats.callbackMovesUsed += 1;
      if (this.humanNames().includes(found.episode.about)) this.memory23Stats.humanCallbacks += 1;
      else this.memory23Stats.peerCallbacks += 1;
      this.lastCallback = {
        memoryRef: ref,
        speaker: found.bot,
        about: found.episode.about,
        kind: found.episode.kind,
        topic: found.episode.topic,
        at: Date.now()
      };
      this.persistMemory23(true);
    }
    return final;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status") return response;

    try {
      const data = await response.json();
      const totalEpisodes = Object.values(this.memory23.byBot || {}).reduce((sum, rows) => sum + (rows?.length || 0), 0);
      return Response.json({
        ...data,
        pass: "persistent-memory-callbacks-v23",
        memory23: {
          ...this.memory23Stats,
          storedEpisodes: totalEpisodes,
          botsWithMemory: Object.keys(this.memory23.byBot || {}).filter((name) => (this.memory23.byBot[name] || []).length).length,
          lastCallback: this.lastCallback
        }
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    const totalEpisodes = Object.values(this.memory23.byBot || {}).reduce((sum, rows) => sum + (rows?.length || 0), 0);
    return {
      ...base,
      pass: "persistent-memory-callbacks-v23",
      memory23: {
        ...this.memory23Stats,
        storedEpisodes: totalEpisodes,
        botsWithMemory: Object.keys(this.memory23.byBot || {}).filter((bot) => (this.memory23.byBot[bot] || []).length).length,
        lastCallback: this.lastCallback
      }
    };
  }
}
