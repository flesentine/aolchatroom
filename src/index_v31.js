import baseWorker, { ChatRoom as EngagementChatRoom } from "./index_v30.js";
import { detectTopics } from "./chatter.js";
import { getCharacter } from "./characters.js";
import {
  inferConversationTopic,
  simulatedDateLabel,
  simulatedDateTimeLabel
} from "./social.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V31_HARNESS_START_KEY = "realismHarnessV31Start";
const EMERGENT_LIFE_KEY = "emergentLifeV31";
const MAX_FACTS_PER_BOT = 80;
const MAX_ACTIVE_FACTS_PER_PROMPT = 8;
const PERSIST_THROTTLE_MS = 8000;
const AI_SOURCES = new Set(["gemini", "groq", "workers-ai", "ai"]);

const LONG_MS = 180 * 24 * 60 * 60 * 1000;
const MEDIUM_MS = 60 * 24 * 60 * 60 * 1000;
const SHORT_MS = 10 * 24 * 60 * 60 * 1000;
const ONE_OFF_MS = 30 * 24 * 60 * 60 * 1000;

const CANONICAL_STRUCTURE = /\b(?:my\s+)?(?:mom|mother|dad|father|parents?|sister|brother|siblings?|wife|husband|son|daughter|kids?|children|roommate|roommates|dog|cat|pet|pets)\b/i;
const CHAT_MECHANICS = /\b(?:brb|afk|wb|aol|modem|signing off|logging off|gotta go|cya|bye guys|goodnight|good night)\b/i;
const FIRST_PERSON = /\b(?:i|i'm|im|i've|ive|i'll|ill|my|me|we|our|us)\b/i;
const WORK_STORY = /\b(?:work|job|shift|boss|manager|coworker|customer|customers|store|office|warehouse|bookstore|video store|phone company|delivery|restaurant|mall)\b/i;
const SCHOOL_STORY = /\b(?:school|college|campus|class|classes|professor|teacher|homework|exam|test|major|degree|semester)\b/i;
const SOCIAL_STORY = /\b(?:friend|friends|buddy|party|date|dating|concert|club|hang out|hanging out|went out|going out)\b/i;
const PROJECT_STORY = /\b(?:trying to|working on|saving for|looking for|fixing|building|writing|learning|planning|plan to|want to|need to|waiting for)\b/i;
const PROBLEM_STORY = /\b(?:broken|broke|stuck|fight|argument|arguing|mad at|annoyed|worried|problem|weird|creepy|lost|late|fired|quit|failed|won't|wont|can't|cant)\b/i;
const PREFERENCE_STORY = /\b(?:i\s+(?:really\s+)?(?:love|hate|like|prefer|can't stand|cant stand)|my favorite|i always|i never)\b/i;
const PLAN_STORY = /\b(?:tonight|tomorrow|this weekend|next week|later today|after work|before work)\b|\b(?:gonna|going to|might|probably)\b.{0,40}\b(?:go|see|meet|work|buy|drive|call|visit|watch|play|try|ask)\b/i;
const THIRD_PARTY_STORY = /\b(?:somebody|someone|a customer|this customer|my boss|my coworker|my friend|a friend|the manager)\b/i;
const NAMED_RECURRING_PERSON = /\bmy\s+(?:friend|coworker|boss|manager)\s+([a-z][a-z0-9'-]{2,})\b/i;
const HUMAN_PIVOT = /\b(?:anyone|anybody|who|what|where|when|why|how)\b|\?$/i;
const DEVELOPMENT_WORDS = /\b(?:but|except|then|so now|turns out|found out|finally|actually|instead|because|after that|next|ended up|admit|confess|dare|bet|fight|argument|joke|tease|weird|creepy|broke|broken|lost|fired|quit|date|party|plan|tomorrow|tonight)\b/i;

const AGENDA_MODES = [
  "has a small real-life annoyance they might mention if it fits",
  "has something they are looking forward to later and may bring it up",
  "has a mildly embarrassing or funny recent story they may tell",
  "has an opinion they may defend even if nobody asked",
  "has a mundane problem they may complain about",
  "has a friend/coworker situation that could become gossip",
  "is in a teasing mood and may needle somebody they know",
  "is curious about somebody else and may ask a nosy question"
];

function compact(value, max = 220) {
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

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(?:lol|haha|heh|seriously|really|just|like|dude|man)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(value) {
  return normalize(value).split(" ").filter((word) => word.length > 2).slice(0, 18).join(" ");
}

function overlapScore(a, b) {
  const aa = new Set(fingerprint(a).split(" ").filter(Boolean));
  const bb = new Set(fingerprint(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  return overlap / Math.max(aa.size, bb.size);
}

function factType(text, topic = "general") {
  const value = String(text || "");
  if (PREFERENCE_STORY.test(value)) return { kind: "preference", ttl: LONG_MS, weight: 4 };
  if (NAMED_RECURRING_PERSON.test(value)) return { kind: "recurring-person", ttl: LONG_MS, weight: 5 };
  if (PROJECT_STORY.test(value)) return { kind: "ongoing-project", ttl: MEDIUM_MS, weight: 5 };
  if (PLAN_STORY.test(value)) return { kind: "near-term-plan", ttl: SHORT_MS, weight: 4 };
  if (SCHOOL_STORY.test(value) || topic === "school") return { kind: "school-life", ttl: MEDIUM_MS, weight: 4 };
  if (WORK_STORY.test(value) || topic === "work") return { kind: "work-life", ttl: MEDIUM_MS, weight: 4 };
  if (SOCIAL_STORY.test(value)) return { kind: "social-life", ttl: MEDIUM_MS, weight: 4 };
  if (PROBLEM_STORY.test(value)) return { kind: "personal-problem", ttl: MEDIUM_MS, weight: 5 };
  if (THIRD_PARTY_STORY.test(value)) return { kind: "anecdote", ttl: ONE_OFF_MS, weight: 3 };
  return null;
}

function extractEmergentCandidate(row) {
  if (!row || row.kind !== "bot" || !AI_SOURCES.has(String(row.source || ""))) return null;
  const text = compact(row.text, 220);
  if (text.length < 12 || CHAT_MECHANICS.test(text)) return null;

  // Family/children/pets/housing structure is already canonical in v28. Those
  // details can live in episodic memory, but v31 never promotes them into a new
  // mutable life fact where they could compete with the bible.
  if (CANONICAL_STRUCTURE.test(text)) return null;

  const topic = compact(row.topic || inferConversationTopic(text) || "general", 30) || "general";
  const type = factType(text, topic);
  const autobiographical = FIRST_PERSON.test(text) || THIRD_PARTY_STORY.test(text) || WORK_STORY.test(text);
  if (!type || !autobiographical) return null;

  return {
    kind: type.kind,
    ttl: type.ttl,
    weight: type.weight,
    topic,
    text,
    hook: DEVELOPMENT_WORDS.test(text) || PROBLEM_STORY.test(text) || PLAN_STORY.test(text),
    recurringPerson: compact(text.match(NAMED_RECURRING_PERSON)?.[1] || "", 24)
  };
}

function activeFact(row, now = Date.now()) {
  return row && (!Number(row.expiresAt || 0) || now < Number(row.expiresAt));
}

function newLifeState() {
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
        pass: "emergent-life-spontaneity-v31",
        providerPriority: PROVIDER_PRIORITY,
        v31: {
          emergentLifeLedger: true,
          onlyVisibleBotSpeechCanBecomeLifeFact: true,
          canonicalBibleStillHardBoundary: true,
          personalContinuitySurvivesYearReset: true,
          unresolvedStoriesCanDevelop: true,
          humanTopicPivotsBreakStickyScenes: true,
          sceneDevelopmentPressure: true,
          speakerMonopolyLimiter: true,
          dailyPrivateAgendaSeeds: true,
          statusEndpoint: "/api/story-status"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/story-status") {
      const id = env.CHAT_ROOMS.idFromName(url.searchParams.get("room") || "town-square");
      const name = compact(url.searchParams.get("name") || "", 32);
      const suffix = name ? `?name=${encodeURIComponent(name)}` : "";
      return env.CHAT_ROOMS.get(id).fetch(new Request(`https://room.internal/story-status${suffix}`));
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends EngagementChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v31Loaded = false;
    this.emergentLife31 = newLifeState();
    this.lastV31PersistAt = 0;
    this.v31PlanningReason = "";
    this.v31Stats = {
      factsStored: 0,
      factsRefreshed: 0,
      hooksOffered: 0,
      storyFactsOffered: 0,
      topicPivotsDetected: 0,
      longScenePressureEvents: 0,
      monopolyMovesTrimmed: 0,
      dominantSpeakersDeprioritized: 0,
      agendaPromptsOffered: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (this.v31Loaded) return;
    const [saved, harness] = await Promise.all([
      this.ctx.storage.get(EMERGENT_LIFE_KEY),
      this.ctx.storage.get(V31_HARNESS_START_KEY)
    ]);

    if (saved?.version === 1 && saved.byBot && typeof saved.byBot === "object") {
      this.emergentLife31 = saved;
      this.emergentLife31.seq ||= 0;
    } else {
      this.emergentLife31 = newLifeState();
    }

    let started = Number(harness || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V31_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v31Loaded = true;
  }

  persistEmergentLife(force = false) {
    if (!this.v31Loaded) return;
    const now = Date.now();
    if (!force && now - this.lastV31PersistAt < PERSIST_THROTTLE_MS) return;
    this.lastV31PersistAt = now;
    this.emergentLife31.updatedAt = now;
    const promise = this.ctx.storage.put(EMERGENT_LIFE_KEY, this.emergentLife31);
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(promise);
    else promise.catch(() => {});
  }

  botLifeFacts(name) {
    this.emergentLife31.byBot[name] ||= [];
    return this.emergentLife31.byBot[name];
  }

  rememberEmergentFact(row) {
    const candidate = extractEmergentCandidate(row);
    if (!candidate || !row.from || !getCharacter(row.from)) return null;
    const now = Date.now();
    const facts = this.botLifeFacts(row.from);

    const near = [...facts].reverse().find((fact) =>
      activeFact(fact, now)
      && fact.kind === candidate.kind
      && overlapScore(fact.text, candidate.text) >= 0.72
    );
    if (near) {
      near.lastMentionedAt = now;
      near.mentions = Number(near.mentions || 1) + 1;
      near.confidence = Math.min(0.98, Number(near.confidence || 0.72) + 0.05);
      if (candidate.hook) near.hook = true;
      if (candidate.recurringPerson && !near.recurringPerson) near.recurringPerson = candidate.recurringPerson;
      this.v31Stats.factsRefreshed += 1;
      this.persistEmergentLife(false);
      return near;
    }

    this.emergentLife31.seq = (Number(this.emergentLife31.seq || 0) + 1) % 1679616;
    const fact = {
      id: `l${now.toString(36)}${this.emergentLife31.seq.toString(36)}`,
      speaker: row.from,
      kind: candidate.kind,
      topic: candidate.topic,
      text: candidate.text,
      hook: Boolean(candidate.hook),
      recurringPerson: candidate.recurringPerson || "",
      createdAt: now,
      lastMentionedAt: now,
      expiresAt: candidate.ttl ? now + candidate.ttl : 0,
      confidence: 0.72,
      weight: candidate.weight,
      mentions: 1,
      sourceMessageId: row.messageId || "",
      sceneId: row.sceneId || ""
    };
    facts.push(fact);
    this.emergentLife31.byBot[row.from] = facts.slice(-MAX_FACTS_PER_BOT);
    this.v31Stats.factsStored += 1;
    this.persistEmergentLife(false);
    this.broadcast?.({
      type: "emergent_life",
      action: "fact-stored",
      speaker: row.from,
      kind: fact.kind,
      factId: fact.id,
      at: now
    });
    return fact;
  }

  pushMessage(message) {
    const result = super.pushMessage(message);
    const row = (this.history || [])[this.history.length - 1];
    if (row?.kind === "bot") this.rememberEmergentFact(row);
    return result;
  }

  relevantLifeFacts(name, query = "", max = 4, now = Date.now()) {
    const topic = inferConversationTopic(query || "") || "general";
    const queryTokens = new Set(normalize(query).split(" ").filter((word) => word.length > 3));
    return (this.botLifeFacts(name) || [])
      .filter((row) => activeFact(row, now))
      .map((row) => {
        let score = Number(row.weight || 1) * 10 + Math.min(12, Number(row.mentions || 1) * 2);
        if (topic !== "general" && row.topic === topic) score += 24;
        if (row.hook) score += 10;
        const tokens = normalize(row.text).split(" ").filter((word) => word.length > 3);
        if (tokens.some((word) => queryTokens.has(word))) score += 18;
        score += Math.max(0, 12 - (now - Number(row.lastMentionedAt || row.createdAt || now)) / (7 * 24 * 60 * 60 * 1000));
        return { row, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((item) => item.row);
  }

  emergentLifePrompt(active, human = null) {
    const query = compact(human?.text || this.recentTranscript?.(8) || "", 600);
    const rows = [];
    let hooks = 0;
    let offered = 0;

    for (const character of (active || []).slice(0, 8)) {
      const facts = this.relevantLifeFacts(character.name, query, 3);
      if (!facts.length) continue;
      offered += facts.length;
      hooks += facts.filter((fact) => fact.hook).length;
      rows.push(`${character.name}: ${facts.map((fact) => `[${fact.kind}${fact.hook ? ", open hook" : ""}] ${fact.text}`).join(" | ")}`);
    }

    this.v31Stats.storyFactsOffered += offered;
    this.v31Stats.hooksOffered += hooks;
    if (!rows.length) return "";
    return `ESTABLISHED EMERGENT LIFE — these details became true only because the character actually said them on-screen earlier:\n${rows.map((row) => `- ${row}`).join("\n")}\nUse these as continuity, not as mandatory topics. An open hook may DEVELOP naturally with a new consequence or update; do not merely repeat the old wording.`;
  }

  privateAgendaPrompt(active) {
    const date = simulatedDateLabel();
    const rows = [];
    for (const character of (active || []).slice(0, 6)) {
      const idx = hashString(`${character.name}|${date}|v31`) % AGENDA_MODES.length;
      rows.push(`${character.name}: ${AGENDA_MODES[idx]}`);
    }
    if (rows.length) this.v31Stats.agendaPromptsOffered += rows.length;
    return rows.length
      ? `PRIVATE CREATIVE MOTIVES — directions, NOT established facts. A character may act on one by inventing ONE low-stakes detail consistent with their fixed biography; it becomes real only if they actually say it publicly:\n${rows.map((row) => `- ${row}`).join("\n")}`
      : "";
  }

  recentScenePressure() {
    const bots = (this.history || []).filter((row) => row?.kind === "bot").slice(-14);
    if (bots.length < 6) return { pressured: false, topic: "", count: 0, scene: "" };
    const last = bots[bots.length - 1];
    const scene = last?.sceneId || "";
    const topic = last?.topic || "general";
    const related = bots.filter((row) =>
      (scene && row.sceneId === scene)
      || (!scene && topic !== "general" && row.topic === topic)
    );
    const pressured = related.length >= 7;
    return { pressured, topic, count: related.length, scene };
  }

  isHumanTopicPivot(human) {
    if (!human || human.target !== "room" || !HUMAN_PIVOT.test(String(human.text || ""))) return false;
    const newTopics = detectTopics(String(human.text || ""));
    const recent = [...(this.history || [])].reverse().find((row) => row?.kind === "bot" && row.topic && row.topic !== "general");
    if (!recent) return newTopics.length > 0;
    if (!newTopics.length) return false;
    return !newTopics.includes(recent.topic);
  }

  async generateHumanReplan(human) {
    human.__v31TopicPivot = this.isHumanTopicPivot(human);
    if (human.__v31TopicPivot) this.v31Stats.topicPivotsDetected += 1;
    return super.generateHumanReplan(human);
  }

  recentSpeakerCounts(max = 18) {
    const counts = new Map();
    const rows = (this.history || []).filter((row) => row?.kind === "bot").slice(-max);
    for (const row of rows) counts.set(row.from, Number(counts.get(row.from) || 0) + 1);
    return { counts, total: rows.length };
  }

  validateBrainMoves(rawMoves, activeNames) {
    const moves = super.validateBrainMoves(rawMoves, activeNames);
    if (moves.length < 2) return moves;

    const reason = this.v31PlanningReason || "";
    const recent = this.recentSpeakerCounts(18);
    const out = [];
    const planCounts = new Map();

    for (const move of moves) {
      const used = Number(planCounts.get(move.speaker) || 0);
      const historical = Number(recent.counts.get(move.speaker) || 0);
      const dominant = recent.total >= 10 && historical / recent.total >= 0.42;
      const directOwner = reason === "human-replan"
        && this.v30HumanRankingContext?.target
        && this.v30HumanRankingContext.target === move.speaker;

      const cap = directOwner ? 3 : 2;
      if (used >= cap) {
        this.v31Stats.monopolyMovesTrimmed += 1;
        continue;
      }
      if (dominant && !directOwner && used >= 1 && moves.length - out.length > 2) {
        this.v31Stats.dominantSpeakersDeprioritized += 1;
        continue;
      }
      out.push(move);
      planCounts.set(move.speaker, used + 1);
    }

    return out.length >= 2 ? out : moves.slice(0, 2);
  }

  brainPrompt(active, reason, human = null) {
    this.v31PlanningReason = reason;
    const base = super.brainPrompt(active, reason, human);
    const life = this.emergentLifePrompt(active, human);
    const agendas = this.privateAgendaPrompt(active);
    const pressure = this.recentScenePressure();
    const pivot = Boolean(human?.__v31TopicPivot);

    const freedom = [
      "V31 SPONTANEITY / STORY DEVELOPMENT:",
      "- The validators already police 1996 chronology, fixed biography, departures, and hard continuity. Inside those boundaries, stop choosing the safest possible next line.",
      "- Continuity means DEVELOPMENT, not repetition. A continuing scene should gain a new concrete detail, consequence, disagreement, joke, misunderstanding, admission, participant, or direction.",
      "- It is fine for a thread to die unfinished. Do not tell people 'let's keep talking about X' just because X was the current topic.",
      "- Allow teasing, mild friction, flirting, gossip, bragging, dumb jokes, nosy questions, awkwardness, and mundane weird stories when they fit the character. Do not manufacture constant drama.",
      "- A character may introduce ONE new low-stakes personal detail consistent with their fixed life bible. If it appears on-screen, v31 can remember it as part of their evolving life.",
      "- Do not explain why a move is interesting. Just make the move a believable thing that person would actually say."
    ];
    if (pressure.pressured) {
      this.v31Stats.longScenePressureEvents += 1;
      freedom.push(`- LONG-SCENE PRESSURE: the current ${pressure.topic || "conversation"} thread has occupied about ${pressure.count} recent bot turns. The next plan must either genuinely change the situation or let that thread fade/pivot; paraphrasing the same position is not development.`);
    }
    if (pivot) {
      freedom.push(`- HUMAN PIVOT: ${human.from} just opened a different room topic. Treat that as permission to leave the old sticky scene. Do not drag the previous thread back unless somebody has a genuinely relevant connection.`);
    }

    return [base, life, agendas, freedom.join("\n")].filter(Boolean).join("\n\n");
  }

  storySnapshot(name = "", now = Date.now()) {
    const serialize = (bot) => (this.botLifeFacts(bot) || []).slice(-MAX_FACTS_PER_BOT).map((row) => ({
      id: row.id,
      kind: row.kind,
      topic: row.topic,
      text: row.text,
      hook: Boolean(row.hook),
      recurringPerson: row.recurringPerson || "",
      active: activeFact(row, now),
      ageMs: Math.max(0, now - Number(row.createdAt || now)),
      expiresInMs: row.expiresAt ? Math.max(0, Number(row.expiresAt) - now) : null,
      mentions: Number(row.mentions || 1)
    }));

    if (name) return { character: name, facts: serialize(name) };
    const byBot = {};
    for (const bot of Object.keys(this.emergentLife31.byBot || {})) {
      const facts = serialize(bot).filter((row) => row.active);
      if (facts.length) byBot[bot] = facts;
    }
    return { byBot };
  }

  v31Snapshot(now = Date.now()) {
    const pressure = this.recentScenePressure();
    return {
      ...this.v31Stats,
      activeEmergentFacts: Object.values(this.emergentLife31.byBot || {}).flat().filter((row) => activeFact(row, now)).length,
      currentScenePressure: pressure,
      lifeStateVersion: this.emergentLife31.version
    };
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    report.pass = "emergent-life-spontaneity-v31";
    report.scope = includeAll ? "all retained messages" : "messages since v31 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.v31Story = {
      factsStored: Number(this.v31Stats.factsStored || 0),
      factsRefreshed: Number(this.v31Stats.factsRefreshed || 0),
      topicPivotsDetected: Number(this.v31Stats.topicPivotsDetected || 0),
      monopolyMovesTrimmed: Number(this.v31Stats.monopolyMovesTrimmed || 0),
      emergentLifeOnlyFromVisibleSpeech: true,
      fixedBibleRemainsAuthoritative: true,
      conversationsMayDevelopOrDie: true
    };
    return report;
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/story-status") {
      const name = compact(url.searchParams.get("name") || "", 32);
      if (name && !getCharacter(name)) return Response.json({ ok: false, error: "unknown character" }, { status: 404 });
      return Response.json({
        ok: true,
        pass: "emergent-life-spontaneity-v31",
        simulatedDateTime: simulatedDateTimeLabel(),
        story: this.storySnapshot(name),
        diagnostics: this.v31Snapshot()
      });
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({ ...data, pass: "emergent-life-spontaneity-v31", v31: this.v31Snapshot() });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "emergent-life-spontaneity-v31",
      v31: this.v31Snapshot(),
      emergentLife: name ? this.storySnapshot(name) : undefined
    };
  }
}
