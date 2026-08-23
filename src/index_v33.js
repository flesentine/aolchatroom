import baseWorker, { ChatRoom as NaturalTypingChatRoom } from "./index_v32.js";
import { getCharacter } from "./characters.js";
import { lifeBibleFor } from "./life_bibles_v28.js";
import {
  simulatedDateLabel,
  simulatedDateTimeLabel,
} from "./social.js";
import {
  futureKnowledgeViolation,
  simulatedCutoff,
  timelineEventsThrough
} from "./historical_knowledge_v27.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V33_HARNESS_START_KEY = "realismHarnessV33Start";
const MAX_BRAIN_MOVES = 7;
const SCENE_WINDOW = 24;
const SCENE_MIN_RELATED = 10;
const SCENE_MIN_CONSECUTIVE = 8;
const SCENE_ESCAPE_COOLDOWN_MS = 55 * 1000;
const SCENE_TOPIC_COOLDOWN_MS = 3 * 60 * 1000;

const AI_SOURCES = new Set(["gemini", "groq", "workers-ai", "ai"]);
const ANTICIPATION_CUE = /\b(?:coming|will|might|may|supposed to|rumou?r|preview|demo|prototype|working on|in development|when it comes out|cant wait|can't wait|looking forward)\b/i;
const ASSERTIVE_RELEASE_CUE = /\b(?:have|has|got|own|owns|bought|using|installed|playing|played|runs|need|gotta have|available|out now|released|launched|ships|shipping|in stores|on shelves)\b/i;
const PERSONAL_LOCAL_CUE = /\b(?:my|our)\s+(?:boss|coworker|co-worker|friend|roommate|store|job|school|class|car|apartment|house|family|sister|brother|mom|dad|customer|customers|manager)\b/i;
const PUBLIC_NOVELTY_CUE = /\b(?:did (?:you|u|you guys|u guys|anyone|anybody) hear about|have (?:you|u|you guys|u guys) heard about|everyone(?:'s| is)? talking about|apparently|the new|this new|just released|just launched|was released|was launched|announced today|coming out today)\b/i;
const PUBLIC_THING_CUE = /\b(?:product|console|game|album|movie|film|browser|software|hardware|graphics card|video card|card|chip|modem|service|drink|soda|coffee bean|cereal|car model|phone|magazine|show|tour|concert|venue|sound system|upgrade)\b/i;
const PUBLIC_EVENT_CUE = /\b(?:released|launched|premiered|opened|announced|won|wins|elected|arrested|died|dead|shot|crashed|bombing|recall|banned)\b/i;

const EXTRA_FUTURE_GATES = [
  {
    date: "1996-10-01",
    hour: 12,
    title: "consumer 3dfx Voodoo Graphics cards",
    aliases: [/\bvoodoo graphics\b/i, /\b3dfx\b.{0,30}\bvoodoo\b/i, /\bvoodoo\b.{0,20}\b(?:graphics|card)\b/i],
    assertiveOnly: true
  },
  {
    date: "1996-11-14",
    hour: 12,
    title: "Tomb Raider U.S. PlayStation release",
    aliases: [/\btomb raider\b/i],
    assertiveOnly: true
  },
  {
    date: "1996-12-31",
    hour: 12,
    title: "Diablo release",
    aliases: [/\bdiablo\b/i],
    assertiveOnly: true
  },
  {
    date: "1997-01-22",
    hour: 12,
    title: "GLQuake public release",
    aliases: [/\bglquake\b/i],
    assertiveOnly: false
  }
];

function clean(value, max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function normalizedTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !["this", "that", "with", "from", "about", "have", "just", "they", "their", "there", "what", "when", "your"].includes(word));
}

function gateAvailable(gate, cutoff) {
  if (!gate) return true;
  if (gate.date < cutoff.dateKey) return true;
  if (gate.date > cutoff.dateKey) return false;
  return Number(gate.hour || 0) * 60 <= cutoff.minuteOfDay;
}

function extraFutureViolation(text, now = Date.now()) {
  const value = String(text || "");
  const cutoff = simulatedCutoff(now);
  for (const gate of EXTRA_FUTURE_GATES) {
    if (!(gate.aliases || []).some((re) => re.test(value))) continue;
    if (gateAvailable(gate, cutoff)) continue;
    if (ANTICIPATION_CUE.test(value) && !ASSERTIVE_RELEASE_CUE.test(value)) continue;
    if (gate.assertiveOnly && !ASSERTIVE_RELEASE_CUE.test(value)) continue;
    return { ...gate, cutoff: cutoff.dateKey };
  }
  return null;
}

function selfQuestionKind(human) {
  if (!human?.target || human.target === "room" || !getCharacter(human.target)) return "";
  const text = String(human.text || "").toLowerCase().replace(/\bdoy\s+ou\b/g, "do you");
  if (!text) return "";
  const questionish = /\?|^\s*(?:do|did|does|have|has|are|is|who|what|where|how|any)\b/i.test(text);

  if (/\b(?:where do (?:you|u) work|where are (?:you|u) working|what(?:'s| is)? (?:your|ur) job|what job (?:do|did) (?:you|u)|what job (?:you|u) got|what do (?:you|u) do for work|what do (?:you|u) do for a living)\b/.test(text)) return "work";
  if (/\b(?:where do (?:you|u) live|who do (?:you|u) live with)\b/.test(text) || (questionish && /\broommates?\b/.test(text))) return "home";
  if (questionish && /\b(?:brother|brothers|sister|sisters|siblings|parents|mom|mother|dad|father|kids|children|son|daughter|family)\b/.test(text)) return "family";
  if (questionish && /\b(?:pet|pets|dog|dogs|cat|cats)\b/.test(text)) return "pets";
  if (questionish && /\b(?:school|college|major|degree|campus|study|studying|class|classes)\b/.test(text)) return "education";
  if (questionish && /\b(?:single|dating|boyfriend|girlfriend|married|wife|husband|relationship|seeing anyone)\b/.test(text)) return "relationships";
  if (/\b(?:what (?:car|truck) do (?:you|u) drive|what do (?:you|u) drive)\b/.test(text) || (questionish && /\b(?:got a car|have a car|your car|ur car)\b/.test(text))) return "transport";
  if (/\b(?:where do (?:you|u) hang out|where do (?:you|u) go|favorite place|favourite place|favorite hangout|favourite hangout)\b/.test(text)) return "local";
  if (/\b(?:where (?:are|r) (?:you|u) from|what city|what state)\b/.test(text)) return "location";
  if (/\b(?:how old (?:are|r) (?:you|u)|what(?:'s| is) (?:your|ur) age)\b/.test(text)) return "age";
  return "";
}

function canonicalSelfFact(name, kind) {
  const character = getCharacter(name);
  const bible = lifeBibleFor(name);
  if (!character) return "";
  if (kind === "age") return `${name} is ${character.age} years old.`;
  if (kind === "location") return `${name} is in ${character.location}.`;
  if (!bible) return kind === "work" && character.occupation ? `${name}'s job is ${character.occupation}.` : "";

  const category = kind === "family" ? "family" : kind;
  const facts = Array.isArray(bible[category]) ? bible[category] : [];
  if (facts.length) return clean(facts[0], 220);
  if (kind === "work" && character.occupation) return `${name}'s job is ${character.occupation}.`;
  return "";
}

function looksLikePublicWorldClaim(text) {
  const value = String(text || "");
  if (!value || PERSONAL_LOCAL_CUE.test(value)) return false;
  if (PUBLIC_NOVELTY_CUE.test(value) && (PUBLIC_THING_CUE.test(value) || PUBLIC_EVENT_CUE.test(value))) return true;
  if (PUBLIC_EVENT_CUE.test(value) && /\b(?:new|latest|today|tonight|this week|just)\b/i.test(value)) return true;
  return false;
}

function knownPublicTitles(culture, now = Date.now()) {
  const cutoff = simulatedCutoff(now);
  const rows = timelineEventsThrough(cutoff, 3650).map((row) => row.title || "");
  for (const group of [culture?.events, culture?.movies, culture?.tv, culture?.anchors]) {
    for (const row of group || []) rows.push(row?.title || row?.show || "");
  }
  return rows.map((row) => clean(row, 160)).filter(Boolean);
}

function publicClaimSupported(text, culture, now = Date.now()) {
  const textTokens = new Set(normalizedTokens(text));
  if (!textTokens.size) return false;
  for (const title of knownPublicTitles(culture, now)) {
    const titleTokens = normalizedTokens(title);
    if (!titleTokens.length) continue;
    let overlap = 0;
    for (const token of titleTokens) if (textTokens.has(token)) overlap += 1;
    if (overlap >= Math.min(2, titleTokens.length)) return true;
  }
  return false;
}

function publicWorldViolation(text, culture, now = Date.now()) {
  if (!looksLikePublicWorldClaim(text)) return null;
  if (publicClaimSupported(text, culture, now)) return null;
  return { reason: "unsupported public-world novelty claim", text: clean(text, 180) };
}

function sceneIdOf(row) {
  return row?.sceneId || row?.scenePlanId || row?.threadId || "";
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
        pass: "surgical-realism-guards-v33",
        providerPriority: PROVIDER_PRIORITY,
        inherits: "natural-character-typing-v32 + emergent-life-spontaneity-v31",
        v33: {
          answerQuestionFirst: true,
          canonicalSelfFactInjection: true,
          crossPlanSceneEscape: true,
          forcedSceneClosure: true,
          extraFutureTechnologyGates: true,
          publicWorldInventionGuard: true,
          publicClaimsCannotBecomeEmergentLife: true,
          personalLowStakesInventionStillAllowed: true,
          statusEndpoint: "/api/v33-status"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/v33-status") {
      const id = env.CHAT_ROOMS.idFromName(url.searchParams.get("room") || "town-square");
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v33-status"));
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends NaturalTypingChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v33Loaded = false;
    this.v33PlanningReason = "";
    this.v33PlanningHuman = null;
    this.lastSceneEscapeAt = 0;
    this.lastEscapedScene = "";
    this.pendingSceneEscape = null;
    this.v33Stats = {
      directSelfQuestions: 0,
      directAnswerMovesForced: 0,
      sceneEscapePrompts: 0,
      sceneEscapeMovesInjected: 0,
      forcedSceneClosures: 0,
      publicWorldClaimsBlocked: 0,
      futureTechClaimsBlocked: 0,
      inheritedFutureClaimsObserved: 0,
      emergentPublicFactsSkipped: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (this.v33Loaded) return;
    let started = Number(await this.ctx.storage.get(V33_HARNESS_START_KEY) || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V33_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v33Loaded = true;
  }

  v33ScenePressure(now = Date.now()) {
    const bots = (this.history || []).filter((row) => row?.kind === "bot").slice(-SCENE_WINDOW);
    if (bots.length < SCENE_MIN_RELATED) return { force: false, scene: "", topic: "", related: 0, consecutive: 0, participants: [] };

    const last = bots[bots.length - 1];
    const scene = sceneIdOf(last);
    if (!scene) return { force: false, scene: "", topic: last?.topic || "general", related: 0, consecutive: 0, participants: [] };

    const relatedRows = bots.filter((row) => sceneIdOf(row) === scene);
    let consecutive = 0;
    for (let i = bots.length - 1; i >= 0; i -= 1) {
      if (sceneIdOf(bots[i]) !== scene) break;
      consecutive += 1;
    }

    const participants = [...new Set(relatedRows.map((row) => row.from).filter(Boolean))];
    const ratio = relatedRows.length / bots.length;
    const cooled = this.lastEscapedScene === scene && now - this.lastSceneEscapeAt < SCENE_ESCAPE_COOLDOWN_MS;
    const force = !cooled && (consecutive >= SCENE_MIN_CONSECUTIVE || (relatedRows.length >= SCENE_MIN_RELATED && ratio >= 0.52));
    return {
      force,
      scene,
      topic: last?.topic || relatedRows[relatedRows.length - 1]?.topic || "general",
      related: relatedRows.length,
      consecutive,
      ratio: Math.round(ratio * 100),
      participants
    };
  }

  async generateHumanReplan(human) {
    this.v33PlanningHuman = human || null;
    try {
      return await super.generateHumanReplan(human);
    } finally {
      this.v33PlanningHuman = null;
    }
  }

  brainPrompt(active, reason, human = null) {
    this.v33PlanningReason = reason || "";
    const base = super.brainPrompt(active, reason, human);
    const rules = [
      "V33 SURGICAL REALISM RULES:",
      "- Creative freedom is for fictional PERSONAL life: a coworker, a bad shift, a roommate anecdote, a local mundane problem, a plan, an opinion, a joke. Do NOT invent public products, technologies, releases, news, scores, celebrity events, public companies, or public venue announcements and then treat them as shared reality.",
      "- A public-world fact is usable only when it is already present in the supplied historical/culture context or is older established knowledge. If unsure, be vague or skeptical rather than inventing it.",
      "- GLQuake is not a released public product anywhere in 1996. Consumer Voodoo Graphics ownership/availability is not normal before October 1996. Do not backfill future tech into the room."
    ];

    const kind = selfQuestionKind(human);
    if (kind && human?.target && getCharacter(human.target)) {
      const fact = canonicalSelfFact(human.target, kind);
      this.v33Stats.directSelfQuestions += 1;
      rules.push(`- DIRECT SELF-FACT QUESTION: ${human.from} asked ${human.target} about ${kind}. The FIRST bot move must be ${human.target} answering the question directly before adding color, complaint, joke, or follow-up.${fact ? ` Canonical answer anchor: ${fact}` : " If the canon does not specify it, answer plainly but stay vague instead of inventing."}`);
    }

    const pressure = reason === "background" ? this.v33ScenePressure(Date.now()) : { force: false };
    if (pressure.force) {
      this.v33Stats.sceneEscapePrompts += 1;
      rules.push(`- MANDATORY CROSS-PLAN SCENE ESCAPE: scene ${pressure.scene} (${pressure.topic}) has occupied ${pressure.related}/${SCENE_WINDOW} recent bot lines, with ${pressure.consecutive} consecutive. Do NOT continue that scene as the main exchange. Start a different ordinary subject with somebody outside its main participants if possible. The old topic may fade without closure.`);
    }

    return `${base}\n\n${rules.join("\n")}`;
  }

  validateBrainMoves(rawMoves, activeNames) {
    let moves = super.validateBrainMoves(rawMoves, activeNames);
    const human = this.v33PlanningHuman || this.v30HumanRankingContext || null;
    const kind = selfQuestionKind(human);

    if (kind && human?.target && activeNames.includes(human.target)) {
      const fact = canonicalSelfFact(human.target, kind);
      const forced = {
        speaker: human.target,
        target: human.from,
        intent: "answer",
        topic: kind === "location" || kind === "age" ? "general" : kind,
        meaning: fact
          ? `Answer ${human.from}'s ${kind} question immediately and plainly using this canonical self-fact: ${fact} After the factual answer, optionally add one short in-character comment.`
          : `Answer ${human.from}'s ${kind} question immediately and plainly. If the fixed profile does not specify the detail, stay vague rather than inventing a permanent fact.`
      };

      const existing = moves.findIndex((move) => move.speaker === human.target && move.target === human.from);
      if (existing >= 0) moves.splice(existing, 1);
      moves.unshift(forced);
      moves = moves.slice(0, MAX_BRAIN_MOVES);
      this.v33Stats.directAnswerMovesForced += 1;
    }

    if (this.v33PlanningReason === "background") {
      const pressure = this.v33ScenePressure(Date.now());
      if (pressure.force) {
        const oldParticipants = new Set(pressure.participants);
        const outsiders = activeNames.filter((name) => !oldParticipants.has(name) && !this.pendingDepartures?.has(name));
        if (outsiders.length) {
          const outsider = outsiders[0];
          moves = moves.filter((move) => move.speaker !== outsider);
          moves.unshift({
            speaker: outsider,
            target: "room",
            intent: "new-thread",
            topic: "general",
            meaning: `Start a different ordinary conversation from ${outsider}'s own day, interests, work, friends, or plans. It must be unrelated to the exhausted ${pressure.topic} scene and must not invent a public-world fact.`
          });
          moves = moves.slice(0, MAX_BRAIN_MOVES);
          this.pendingSceneEscape = { ...pressure, injectedAt: Date.now() };
          this.v33Stats.sceneEscapeMovesInjected += 1;
        }
      }
    }

    return moves;
  }

  rememberEmergentFact(row) {
    if (row?.kind === "bot" && looksLikePublicWorldClaim(row.text)) {
      this.v33Stats.emergentPublicFactsSkipped += 1;
      return null;
    }
    return super.rememberEmergentFact(row);
  }

  finishPlan(plan, status, reason = "") {
    const result = super.finishPlan(plan, status, reason);
    if (status !== "completed" || plan?.reason !== "background") return result;

    const pressure = this.pendingSceneEscape || this.v33ScenePressure(Date.now());
    this.pendingSceneEscape = null;
    if (!pressure?.scene) return result;
    const humanRecent = [...(this.history || [])].reverse().find((row) =>
      row?.kind === "human"
      && sceneIdOf(row) === pressure.scene
      && Date.now() - Number(row.at || 0) < 90 * 1000
    );
    if (humanRecent) return result;

    const open = typeof this.openScenes === "function" ? this.openScenes(Date.now()) : [];
    const scene = open.find((row) => row?.id === pressure.scene);
    if (scene) {
      scene.status = "closed";
      scene.closedAt = Date.now();
      scene.closeReason = "v33 cross-plan scene escape";
      if (this.sceneStats) this.sceneStats.closed = Number(this.sceneStats.closed || 0) + 1;
      this.v33Stats.forcedSceneClosures += 1;
    }
    if (pressure.topic && pressure.topic !== "general" && this.topicFatigueUntil instanceof Map) {
      const until = Date.now() + SCENE_TOPIC_COOLDOWN_MS;
      this.topicFatigueUntil.set(pressure.topic, Math.max(until, Number(this.topicFatigueUntil.get(pressure.topic) || 0)));
    }
    this.lastSceneEscapeAt = Date.now();
    this.lastEscapedScene = pressure.scene;
    return result;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot" && AI_SOURCES.has(String(source || ""))) {
      const extra = extraFutureViolation(text, Date.now());
      if (extra) {
        this.v33Stats.futureTechClaimsBlocked += 1;
        this.broadcast?.({
          type: "v33_guard",
          action: "future-tech-blocked",
          speaker: from,
          title: extra.title,
          notBefore: extra.date,
          at: Date.now()
        });
        return false;
      }

      const inherited = futureKnowledgeViolation(text, Date.now());
      if (inherited) this.v33Stats.inheritedFutureClaimsObserved += 1;

      const publicViolation = publicWorldViolation(text, this.culture, Date.now());
      if (publicViolation) {
        this.v33Stats.publicWorldClaimsBlocked += 1;
        this.broadcast?.({
          type: "v33_guard",
          action: "unsupported-public-claim-blocked",
          speaker: from,
          at: Date.now()
        });
        return false;
      }
    }
    return super.say(from, text, kind, source, meta);
  }

  v33Snapshot(now = Date.now()) {
    return {
      ...this.v33Stats,
      currentScenePressure: this.v33ScenePressure(now),
      lastSceneEscapeAgoMs: this.lastSceneEscapeAt ? Math.max(0, now - this.lastSceneEscapeAt) : null,
      lastEscapedScene: this.lastEscapedScene || "",
      extraFutureGates: EXTRA_FUTURE_GATES.map((row) => ({ date: row.date, title: row.title }))
    };
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    report.pass = "surgical-realism-guards-v33";
    report.scope = includeAll ? "all retained messages" : "messages since v33 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.v33Surgical = {
      directSelfQuestions: Number(this.v33Stats.directSelfQuestions || 0),
      directAnswerMovesForced: Number(this.v33Stats.directAnswerMovesForced || 0),
      sceneEscapeMovesInjected: Number(this.v33Stats.sceneEscapeMovesInjected || 0),
      forcedSceneClosures: Number(this.v33Stats.forcedSceneClosures || 0),
      publicWorldClaimsBlocked: Number(this.v33Stats.publicWorldClaimsBlocked || 0),
      futureTechClaimsBlocked: Number(this.v33Stats.futureTechClaimsBlocked || 0),
      emergentPublicFactsSkipped: Number(this.v33Stats.emergentPublicFactsSkipped || 0),
      v32TypingPreserved: true,
      v31PersonalEmergentLifePreserved: true
    };
    return report;
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/v33-status") {
      return Response.json({
        ok: true,
        pass: "surgical-realism-guards-v33",
        simulatedDateTime: simulatedDateTimeLabel(),
        diagnostics: this.v33Snapshot()
      });
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({ ...data, pass: "surgical-realism-guards-v33", v33: this.v33Snapshot() });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return { ...base, pass: "surgical-realism-guards-v33", v33: this.v33Snapshot() };
  }
}
