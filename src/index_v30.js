import baseWorker, { ChatRoom as DepartureChatRoom } from "./index_v29.js";
import { getCharacter } from "./characters.js";
import { detectTopics } from "./chatter.js";
import {
  relationshipScore,
  relationshipInteractions,
  simulatedDateLabel,
  simulatedDateTimeLabel
} from "./social.js";
import { activityRole } from "./authenticity.js";
import { coalescePendingHumans } from "./timing.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V30_HARNESS_START_KEY = "realismHarnessV30Start";
const ATTENTION_STATE_KEY = "attentionStateV30";
const ATTENTION_WINDOW_MS = 90 * 1000;
const STICKY_CONVERSATION_MS = 2 * 60 * 1000;
const REPEAT_WINDOW_MS = 4 * 60 * 1000;
const PROACTIVE_COOLDOWN_MS = 3 * 60 * 1000;

const SIMPLE_GREETING = /^\s*(hi|hey|hello|yo|sup|hiya|hey ppl|hi ppl|hello ppl|anyone here|anybody here|hello\??)[!?. ]*$/i;
const QUESTION = /\?|^\s*(?:anyone|anybody|who|what|when|where|why|how|does|do|did|is|are|can|could|would|should)\b|\b(?:anyone|anybody)\s+(?:know|heard|seen|watch|like)\b/i;
const INVITATION = /\b(anyone|anybody|who)\b.{0,30}\b(into|like|want|wanna|up for|watch|listen|play|doing|think|know)\b|\bwhat do (?:u|you) (?:guys )?think\b|\bwho else\b/i;
const PERSONAL_DISCLOSURE = /\b(?:i am|i'm|im|i was|i have|i've|ive|my|me and my)\b.{0,60}\b(?:work|school|family|mom|dad|brother|sister|girlfriend|boyfriend|wife|husband|roommate|dog|cat|car|job|class|home|move|moved|live|feel|hate|love|worried|nervous|excited)\b/i;
const SOCIAL_HOOK = /\b(?:bet you|bet u|prove it|fight me|youre wrong|ur wrong|no way|guess what|truth or dare|would you rather|wanna hear a joke|joke|haha|lol)\b/i;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function compact(value, max = 240) {
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

function normalizeForRepeat(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(hey|hi|hello|please|pls|anyone|anybody|guys|like|just|really)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  const aa = new Set(normalizeForRepeat(a).split(" ").filter((x) => x.length > 2));
  const bb = new Set(normalizeForRepeat(b).split(" ").filter((x) => x.length > 2));
  if (!aa.size || !bb.size) return normalizeForRepeat(a) === normalizeForRepeat(b) ? 1 : 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  return overlap / Math.max(aa.size, bb.size);
}

function zoneFor(character) {
  const location = String(character?.location || "");
  if (/Phoenix|Arizona|\bAZ\b/i.test(location)) return "America/Phoenix";
  switch (character?.timezone) {
    case "ET": return "America/New_York";
    case "CT": return "America/Chicago";
    case "MT": return "America/Denver";
    case "PT": return "America/Los_Angeles";
    default: return "America/Los_Angeles";
  }
}

function localHour(character, now = Date.now()) {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: zoneFor(character),
      hour: "2-digit",
      hourCycle: "h23"
    }).format(new Date(now));
    return Number(hour);
  } catch {
    return new Date(now).getUTCHours();
  }
}

function isLateHour(hour) {
  return hour >= 0 && hour <= 4;
}

function isNightOwl(character) {
  const families = character?.cannedFamilies || [];
  const interests = (character?.interests || []).map((x) => String(x).toLowerCase());
  return families.includes("late_night")
    || interests.some((x) => /late night|clubs|night radio|aol chat/.test(x))
    || Number(character?.personality?.sociability || 0) >= 0.84;
}

function messageIntent(human) {
  const text = String(human?.text || "");
  return {
    direct: Boolean(human?.target && human.target !== "room"),
    greeting: SIMPLE_GREETING.test(text),
    question: QUESTION.test(text),
    invitation: INVITATION.test(text),
    disclosure: PERSONAL_DISCLOSURE.test(text),
    socialHook: SOCIAL_HOOK.test(text)
  };
}

function topicalFit(character, text) {
  const topics = detectTopics(String(text || ""));
  const families = new Set(character?.cannedFamilies || []);
  let score = topics.reduce((sum, topic) => sum + (families.has(topic) ? 2.4 : 0), 0);
  const lower = String(text || "").toLowerCase();
  for (const interest of character?.interests || []) {
    const phrase = String(interest || "").toLowerCase();
    if (phrase.length >= 4 && lower.includes(phrase)) score += 2.2;
    else {
      const words = phrase.split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
      if (words.some((word) => lower.includes(word))) score += 0.9;
    }
  }
  return score;
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
        pass: "individual-attention-engagement-v30",
        providerPriority: PROVIDER_PRIORITY,
        engagement: {
          characterSpecificAttention: true,
          topicAndRelationshipAware: true,
          conversationStickiness: true,
          unansweredMessageDebt: true,
          repeatedQuestionGuarantee: true,
          lateNightPresenceNotSilence: true,
          departureAwareResponders: true,
          multiHumanFairness: true,
          noPileOnPlanning: true,
          familiarBotsCanInitiate: true,
          statusEndpoint: "/api/engagement-status"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/engagement-status") {
      const roomName = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(roomName);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/engagement-status"));
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends DepartureChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v30Loaded = false;
    this.attentionLedger = new Map();
    this.v30HumanRankingContext = null;
    this.lastProactivePromptAt = 0;
    this.v30Stats = {
      decisions: 0,
      responded: 0,
      ignored: 0,
      repeatedQuestionGuarantees: 0,
      debtBoosts: 0,
      stickyBoosts: 0,
      fairnessBoosts: 0,
      fairnessPenalties: 0,
      lateNightBonuses: 0,
      departingRespondersSkipped: 0,
      proactiveOpportunities: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (this.v30Loaded) return;
    const [saved, harness] = await Promise.all([
      this.ctx.storage.get(ATTENTION_STATE_KEY),
      this.ctx.storage.get(V30_HARNESS_START_KEY)
    ]);

    if (saved?.version === 1) {
      for (const row of saved.humans || []) {
        if (!row?.name) continue;
        this.attentionLedger.set(row.name, {
          unanswered: Math.max(0, Number(row.unanswered || 0)),
          lastIgnoredText: compact(row.lastIgnoredText || "", 220),
          lastIgnoredAt: Number(row.lastIgnoredAt || 0),
          lastAnsweredAt: Number(row.lastAnsweredAt || 0)
        });
      }
    }

    let started = Number(harness || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V30_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v30Loaded = true;
  }

  persistAttentionState() {
    const humans = [...this.attentionLedger.entries()].map(([name, row]) => ({ name, ...row }));
    const promise = this.ctx.storage.put(ATTENTION_STATE_KEY, { version: 1, humans, updatedAt: Date.now() });
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(promise);
    else promise.catch(() => {});
  }

  recentExchangeScore(botName, humanName, now = Date.now()) {
    let score = 0;
    for (let i = (this.history || []).length - 1; i >= 0; i -= 1) {
      const row = this.history[i];
      if (!row || now - Number(row.at || 0) > STICKY_CONVERSATION_MS) break;
      if (row.kind === "bot" && row.from === botName && row.target === humanName) score += 2.5;
      if (row.kind === "human" && row.from === humanName && row.target === botName) score += 3.5;
      if (score >= 12) break;
    }
    return score;
  }

  botHumanAttentionCounts(now = Date.now()) {
    const counts = new Map(this.humanNames().map((name) => [name, 0]));
    for (let i = (this.history || []).length - 1; i >= 0; i -= 1) {
      const row = this.history[i];
      if (!row || now - Number(row.at || 0) > ATTENTION_WINDOW_MS) break;
      if (row.kind === "bot" && row.target && counts.has(row.target)) {
        counts.set(row.target, Number(counts.get(row.target) || 0) + 1);
      }
    }
    return counts;
  }

  responderScore(character, human, now = Date.now()) {
    if (!character?.name) return -999;
    const pending = this.pendingDepartures?.get(character.name);
    if (pending) return -999;

    const intent = messageIntent(human);
    let score = Number(character?.personality?.sociability || 0.5) * 10;
    score += topicalFit(character, human?.text || "") * 6;
    score += this.recentExchangeScore(character.name, human?.from, now);
    score += clamp(relationshipScore(this.social, character.name, human?.from) * 0.08, -5, 8);
    score += Math.min(8, Math.log2(1 + relationshipInteractions(this.social, character.name, human?.from)) * 1.8);

    const role = activityRole(character.name, now);
    if (role === "talker") score += 4;
    else if (role === "occasional") score += 1;
    else score -= 2.5;

    if (intent.direct && human.target === character.name) score += 100;
    if (intent.invitation && topicalFit(character, human?.text || "") > 0) score += 4;

    const hour = localHour(character, now);
    if (isLateHour(hour) && isNightOwl(character)) score += 4.5;
    return score;
  }

  v30RankedResponders(human, max = 6, now = Date.now()) {
    const active = super.activeCharacters();
    return active
      .map((character) => ({ character, score: this.responderScore(character, human, now) }))
      .filter((row) => row.score > -900)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((row) => row.character);
  }

  rankedResponders(human, max = 6) {
    return this.v30RankedResponders(human, max, Date.now());
  }

  activeCharacters() {
    const active = super.activeCharacters();
    const human = this.v30HumanRankingContext;
    if (!human) return active;
    return [...active].sort((a, b) => this.responderScore(b, human) - this.responderScore(a, human));
  }

  engagementDecision(human, now = Date.now()) {
    const intent = messageIntent(human);
    const ledger = this.attentionLedger.get(human.from) || {
      unanswered: 0,
      lastIgnoredText: "",
      lastIgnoredAt: 0,
      lastAnsweredAt: 0
    };
    const ranked = this.v30RankedResponders(human, 4, now);
    const sticky = ranked.length ? this.recentExchangeScore(ranked[0].name, human.from, now) > 0 : false;

    let chance = intent.direct ? 0.98
      : sticky ? 0.94
        : intent.invitation ? 0.88
          : intent.question ? 0.85
            : intent.disclosure ? 0.72
              : intent.socialHook ? 0.70
                : intent.greeting ? 0.48
                  : 0.60;

    if (sticky) this.v30Stats.stickyBoosts += 1;

    const repeat = ledger.lastIgnoredAt > 0
      && now - ledger.lastIgnoredAt <= REPEAT_WINDOW_MS
      && similarity(ledger.lastIgnoredText, human.text) >= 0.62;
    const repeatedQuestion = repeat && (intent.question || QUESTION.test(ledger.lastIgnoredText));
    if (repeatedQuestion) {
      chance = 0.995;
      this.v30Stats.repeatedQuestionGuarantees += 1;
    } else if (ledger.unanswered > 0) {
      const boost = Math.min(0.20, ledger.unanswered * 0.08);
      chance += boost;
      this.v30Stats.debtBoosts += 1;
    }

    const queueLength = Number(this.aiQueue?.length || 0);
    if (!intent.direct && queueLength >= 6) chance -= 0.10;
    else if (!intent.direct && queueLength >= 4) chance -= 0.06;
    else if (!intent.direct && queueLength >= 2) chance -= 0.03;

    const counts = this.botHumanAttentionCounts(now);
    if (counts.size > 1) {
      const values = [...counts.values()];
      const mine = Number(counts.get(human.from) || 0);
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (mine <= min && max - mine >= 2) {
        chance += 0.05;
        this.v30Stats.fairnessBoosts += 1;
      } else if (mine >= min + 4 && mine === max) {
        chance -= 0.05;
        this.v30Stats.fairnessPenalties += 1;
      }
    }

    const best = ranked[0];
    if (best) {
      const rel = relationshipScore(this.social, best.name, human.from);
      const interactions = relationshipInteractions(this.social, best.name, human.from);
      chance += clamp(rel / 500, -0.03, 0.06);
      if (interactions >= 8) chance += 0.03;
      const hour = localHour(best, now);
      if (isLateHour(hour) && isNightOwl(best)) {
        chance += 0.03;
        this.v30Stats.lateNightBonuses += 1;
      }
    }

    chance = clamp(chance, 0.28, 0.995);
    const respond = repeatedQuestion || Math.random() < chance;
    return {
      respond,
      chance,
      repeatedQuestion,
      sticky,
      bestResponders: ranked.map((character) => character.name),
      intent
    };
  }

  maybeIgnorePendingHuman(now = Date.now()) {
    if (!this.pendingHumans?.length || this.tos) return false;
    this.pendingHumans = coalescePendingHumans(this.pendingHumans);
    const human = this.pendingHumans[0];

    if (human.__authRespond === undefined) {
      const decision = this.engagementDecision(human, now);
      human.__authRespond = decision.respond;
      human.__authChance = decision.chance;
      human.__v30RepeatedQuestion = decision.repeatedQuestion;
      human.__v30BestResponders = decision.bestResponders;
      human.__v30Intent = decision.intent;
      this.v30Stats.decisions += 1;

      const ledger = this.attentionLedger.get(human.from) || {
        unanswered: 0,
        lastIgnoredText: "",
        lastIgnoredAt: 0,
        lastAnsweredAt: 0
      };
      if (decision.respond) {
        ledger.unanswered = 0;
        ledger.lastAnsweredAt = now;
        this.v30Stats.responded += 1;
      } else {
        ledger.unanswered = Math.min(4, Number(ledger.unanswered || 0) + 1);
        ledger.lastIgnoredText = compact(human.text, 220);
        ledger.lastIgnoredAt = now;
        this.v30Stats.ignored += 1;
      }
      this.attentionLedger.set(human.from, ledger);
      this.persistAttentionState();

      this.lastEngagementDecision = {
        from: human.from,
        text: compact(human.text, 80),
        respond: decision.respond,
        chance: Math.round(decision.chance * 100),
        intent: decision.intent,
        repeatedQuestion: decision.repeatedQuestion,
        sticky: decision.sticky,
        bestResponders: decision.bestResponders,
        at: now,
        version: 30
      };
    }

    if (human.__authRespond) return false;

    this.pendingHumans.shift();
    this.humanReplyDueAt = 0;
    this.scheduledHumanAt = 0;
    if (this.aiQueue?.length) this.nextBotAt = Math.min(this.nextBotAt, now + 900 + Math.floor(Math.random() * 1800));
    return true;
  }

  async generateHumanReplan(human) {
    this.v30HumanRankingContext = human;
    try {
      return await super.generateHumanReplan(human);
    } finally {
      this.v30HumanRankingContext = null;
    }
  }

  proactivePair(active, now = Date.now()) {
    if (now - this.lastProactivePromptAt < PROACTIVE_COOLDOWN_MS) return null;
    const humans = this.humanNames();
    if (!humans.length || !active?.length) return null;
    const attention = this.botHumanAttentionCounts(now);
    const candidates = [];

    for (const human of humans) {
      for (const character of active) {
        if (!character?.name || this.pendingDepartures?.has(character.name)) continue;
        const interactions = relationshipInteractions(this.social, character.name, human);
        const rel = relationshipScore(this.social, character.name, human);
        if (interactions < 2 && rel < 8) continue;
        const recent = this.recentExchangeScore(character.name, human, now);
        if (recent > 0) continue;
        const fairness = Number(attention.get(human) || 0);
        const score = interactions * 1.5 + rel * 0.18 + Number(character.personality?.sociability || 0.5) * 5 - fairness * 2;
        candidates.push({ bot: character.name, human, score });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const slice = Math.floor(now / PROACTIVE_COOLDOWN_MS);
    if ((hashString(`${best.bot}|${best.human}|${slice}`) % 100) >= 32) return null;
    this.lastProactivePromptAt = now;
    this.v30Stats.proactiveOpportunities += 1;
    return best;
  }

  brainPrompt(active, reason, human = null) {
    const base = super.brainPrompt(active, reason, human);
    if (human) {
      const ranked = this.v30RankedResponders(human, 4, Date.now());
      const names = ranked.map((character) => character.name);
      const repeated = Boolean(human.__v30RepeatedQuestion);
      return `${base}\n\nV30 INDIVIDUAL ATTENTION RULES:\n- Best plausible responders for THIS human message, in order: ${names.join(", ") || "none"}. Prefer the first plausible person rather than a random occupant.\n- A direct address belongs to the named character unless that character is genuinely leaving/unavailable.\n- Existing one-to-one momentum is sticky: once a bot and human are actually talking, continuing that exchange is easier than starting a new one.\n- At most TWO moves in this plan may address ${human.from}. Usually only one should. Do not make the room pile onto the human.\n- Topic expertise is social probability, not omniscience. If the best responder does not know the factual answer, they may say they don't know, ask what the human means, or give only what they actually know. Never invent a precise fact just to satisfy engagement.\n- Bots with a pending leave intention are unavailable for new conversations.${repeated ? `\n- IMPORTANT: ${human.from} is repeating an unanswered question. The FIRST move must acknowledge the question, even if the answer is simply uncertainty.` : ""}`;
    }

    const pair = this.proactivePair(active, Date.now());
    if (!pair) {
      return `${base}\n\nV30 BACKGROUND SOCIAL RULE:\n- Humans are room members, not an audience. Do not make every background scene about them. A familiar bot may occasionally initiate with a human, but only when it feels like something a regular would actually do.`;
    }
    return `${base}\n\nV30 BACKGROUND SOCIAL RULE:\n- Humans are room members, not an audience. Do not make every background scene about them.\n- OPTIONAL natural opening: ${pair.bot} knows ${pair.human} well enough to initiate one small line if it fits the room flow (for example a callback, 'u still here?', or a follow-up). This is permission, not an obligation. At most ONE such human-directed move in this plan.`;
  }

  desiredRoster(now = Date.now()) {
    const base = super.desiredRoster(now) || [];
    if (!base.length) return base;
    return [...base].sort((a, b) => {
      const ca = getCharacter(a);
      const cb = getCharacter(b);
      const ha = localHour(ca, now);
      const hb = localHour(cb, now);
      const lateA = isLateHour(ha) ? (isNightOwl(ca) ? 5 : -1) : 0;
      const lateB = isLateHour(hb) ? (isNightOwl(cb) ? 5 : -1) : 0;
      const socialA = Number(ca?.personality?.sociability || 0.5);
      const socialB = Number(cb?.personality?.sociability || 0.5);
      return (lateB + socialB) - (lateA + socialA);
    });
  }

  v30Snapshot(now = Date.now()) {
    const humans = {};
    for (const [name, row] of this.attentionLedger.entries()) {
      humans[name] = {
        unansweredDebt: Number(row.unanswered || 0),
        lastIgnoredAgoMs: row.lastIgnoredAt ? Math.max(0, now - row.lastIgnoredAt) : null,
        lastAnsweredAgoMs: row.lastAnsweredAt ? Math.max(0, now - row.lastAnsweredAt) : null
      };
    }
    return {
      ...this.v30Stats,
      lastDecision: this.lastEngagementDecision?.version === 30 ? this.lastEngagementDecision : null,
      humans,
      currentAttentionCounts: Object.fromEntries(this.botHumanAttentionCounts(now))
    };
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    report.pass = "individual-attention-engagement-v30";
    report.scope = includeAll ? "all retained messages" : "messages since v30 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.v30Engagement = {
      decisions: Number(this.v30Stats.decisions || 0),
      responded: Number(this.v30Stats.responded || 0),
      ignored: Number(this.v30Stats.ignored || 0),
      repeatedQuestionGuarantees: Number(this.v30Stats.repeatedQuestionGuarantees || 0),
      proactiveOpportunities: Number(this.v30Stats.proactiveOpportunities || 0),
      perHumanFairness: true,
      characterSpecificResponders: true
    };
    return report;
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/engagement-status") {
      return Response.json({
        ok: true,
        pass: "individual-attention-engagement-v30",
        simulatedDateTime: simulatedDateTimeLabel(),
        engagement: this.v30Snapshot()
      });
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({ ...data, pass: "individual-attention-engagement-v30", v30: this.v30Snapshot() });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return { ...base, pass: "individual-attention-engagement-v30", v30: this.v30Snapshot() };
  }
}
