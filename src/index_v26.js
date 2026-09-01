import baseWorker, { ChatRoom as FinalPolishChatRoom } from "./index_v25.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V26_HARNESS_START_KEY = "realismHarnessV26Start";
const FATIGUE_WARN_TURNS = 8;
const FATIGUE_STRONG_TURNS = 12;
const FATIGUE_CLOSE_TURNS = 15;
const FATIGUE_TOPIC_COOLDOWN_MS = 2 * 60 * 1000;
const RECENT_HUMAN_SCENE_MS = 90 * 1000;
const SEMANTIC_REPEAT_THRESHOLD = 0.68;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "do", "for", "from",
  "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its",
  "me", "my", "of", "on", "or", "our", "she", "so", "that", "the", "their", "them", "they",
  "this", "to", "u", "was", "we", "were", "what", "with", "you", "your", "yeah", "yes", "no",
  "lol", "lolol", "dude", "omg", "seriously", "whatever", "btw"
]);

const HABITS = [
  { key: "btw", re: /(?:^|\s)btw(?:\s|$)/i, strip: /\s*\bbtw\b\s*/ig },
  { key: "lolol", re: /\blolol\b/i, strip: /\blolol\b/ig, replace: "lol" },
  { key: "omg", re: /^\s*omg\b/i, strip: /^\s*omg\b[ ,.!-]*/i },
  { key: "seriously", re: /^\s*seriously\b/i, strip: /^\s*seriously\b[ ,.!-]*/i },
  { key: "whatever", re: /^\s*whatever\b/i, strip: /^\s*whatever\b[ ,.!-]*/i },
  { key: "ugh", re: /^\s*ugh\b/i, strip: /^\s*ugh\b[ ,.!-]*/i },
  { key: "dude", re: /\bdude\b/i, strip: /\s*\bdude\b\s*/i }
];

function clean(value, max = 320) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function average(values) {
  const rows = values.filter((value) => Number.isFinite(value));
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0;
}

function grade(score) {
  if (score >= 94) return "A";
  if (score >= 88) return "A-";
  if (score >= 82) return "B+";
  if (score >= 76) return "B";
  if (score >= 70) return "B-";
  if (score >= 63) return "C+";
  if (score >= 56) return "C";
  if (score >= 48) return "D";
  return "F";
}

function words(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/^'+|'+$/g, ""))
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

function semanticSimilarity(a, b) {
  const aa = words(a);
  const bb = words(b);
  if (aa.size < 2 || bb.size < 2) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  const union = aa.size + bb.size - overlap;
  return union ? overlap / union : 0;
}

function sceneGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.sceneId || row.scenePlanId || row.threadId || "";
    if (!key) continue;
    groups.set(key, Number(groups.get(key) || 0) + 1);
  }
  return groups;
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
        pass: "anti-loop-humanization-v26",
        providerPriority: PROVIDER_PRIORITY,
        humanization: {
          conversationFatigue: true,
          fatigueTurns: [FATIGUE_WARN_TURNS, FATIGUE_STRONG_TURNS, FATIGUE_CLOSE_TURNS],
          semanticRepeatGuard: true,
          voiceHabitsAreProbabilities: true,
          correctedStagnationScoring: true,
          freshHarnessWindow: true
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

export class ChatRoom extends FinalPolishChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v26HarnessLoaded = false;
    this.v26PlanningReason = "";
    this.v26PlanningHuman = null;
    this.topicFatigueUntil = new Map();
    this.v26Stats = {
      fatigueWarnings: 0,
      fatiguedScenesClosed: 0,
      semanticMovesRejected: 0,
      repeatedHabitsSoftened: 0,
      topicCooldownsStarted: 0,
      stagnationFlags: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (this.v26HarnessLoaded) return;
    let started = Number(await this.ctx.storage.get(V26_HARNESS_START_KEY) || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V26_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v26HarnessLoaded = true;
  }

  promptProfiles(characters, limit = 8) {
    const base = super.promptProfiles(characters, limit);
    return `${base}\n\nVOICE VARIATION OVERRIDE: typing quirks, slang, favorite interjections, emoticons, and catchphrases are tendencies, not requirements. Do not stamp the same signature word onto every line. If a character used a quirk in either of their last two sends, usually omit it on the next send. Let some lines be plain.`;
  }

  recentSceneHuman(sceneId, now = Date.now()) {
    if (!sceneId) return null;
    return [...(this.history || [])].reverse().find((row) =>
      row?.kind === "human"
      && row.sceneId === sceneId
      && now - Number(row.at || 0) <= RECENT_HUMAN_SCENE_MS
    ) || null;
  }

  fatiguedScene(now = Date.now()) {
    const authority = this.sceneLifecycleAuthority?.() || null;
    if (authority?.fatiguedScene) return authority.fatiguedScene(now);
    const scenes = typeof this.openScenes === "function" ? this.openScenes(now) : [];
    return scenes
      .filter((scene) => Number(scene?.turns || 0) >= FATIGUE_WARN_TURNS)
      .sort((a, b) => Number(b.turns || 0) - Number(a.turns || 0))[0] || null;
  }

  brainPrompt(active, reason, human = null) {
    this.v26PlanningReason = reason || "";
    this.v26PlanningHuman = human || null;
    const base = super.brainPrompt(active, reason, human);
    const now = Date.now();
    const scene = this.fatiguedScene(now);
    const coolingTopics = [...this.topicFatigueUntil.entries()]
      .filter(([, until]) => Number(until || 0) > now)
      .map(([topic]) => topic)
      .slice(0, 4);

    const rules = [
      "CONVERSATION FATIGUE / HUMANIZATION OVERRIDE:",
      "- Coherence is not the same as endless persistence. Real chat arguments run out of steam.",
      "- Do not restate a position that the same speaker already expressed. Each move must add information, a new angle, a question, a concession, a joke, a misunderstanding, a related tangent, an exit, or closure.",
      "- After a long exchange, silence, somebody losing interest, or a related tangent is better than another paraphrase of the same opinion.",
      "- Character voice habits are probabilistic. Do not force signature fillers like btw, omg, lolol, dude, seriously, whatever, or ugh onto every turn."
    ];

    if (scene) {
      const turns = Number(scene.turns || 0);
      const authority = this.sceneLifecycleAuthority?.() || null;
      const fatigue = authority?.fatigueForScene
        ? authority.fatigueForScene(scene, now)
        : { phase: turns >= FATIGUE_STRONG_TURNS ? "strong" : "aging" };
      if (fatigue.phase === "strong" || fatigue.phase === "exhausted") {
        this.v26Stats.fatigueWarnings += 1;
        rules.push(`- CURRENT FATIGUED SCENE: ${scene.id}, topic=${scene.topic}, turns=${turns}. This exchange has already had enough airtime. ${human ? "Answer the human naturally if needed, then" : "Now"} resolve it, let somebody disengage, or move through a related tangent into another ordinary subject. Do not simply repeat the argument.`);
      } else {
        rules.push(`- CURRENT AGING SCENE: ${scene.id}, topic=${scene.topic}, turns=${turns}. It may continue briefly, but every remaining line must advance it toward a natural change or ending.`);
      }
    }

    if (coolingTopics.length) {
      rules.push(`- RECENTLY EXHAUSTED TOPICS: ${coolingTopics.join(", ")}. For background chatter, avoid restarting these immediately. A direct human question can still discuss them.`);
    }

    return `${base}\n\n${rules.join("\n")}`;
  }

  recentSpeakerMeanings(speaker, max = 5) {
    return [...(this.history || [])]
      .reverse()
      .filter((row) => row?.kind === "bot" && row.from === speaker)
      .slice(0, max)
      .map((row) => clean(row.brainMeaning || row.text, 220))
      .filter(Boolean);
  }

  validateBrainMoves(rawMoves, activeNames) {
    const moves = super.validateBrainMoves(rawMoves, activeNames);
    const accepted = [];
    const localBySpeaker = new Map();
    const humanNames = new Set(this.humanNames?.() || []);

    for (const move of moves) {
      const meaning = clean(move.meaning || "", 220);
      const history = this.recentSpeakerMeanings(move.speaker, 5);
      const local = localBySpeaker.get(move.speaker) || [];
      const comparisons = [...local, ...history];
      const strongest = comparisons.reduce((best, previous) => Math.max(best, semanticSimilarity(meaning, previous)), 0);
      const protectedHumanReply = this.v26PlanningReason === "human-replan"
        && accepted.length === 0
        && humanNames.has(move.target);

      if (!protectedHumanReply && strongest >= SEMANTIC_REPEAT_THRESHOLD) {
        this.v26Stats.semanticMovesRejected += 1;
        continue;
      }

      accepted.push(move);
      local.unshift(meaning);
      localBySpeaker.set(move.speaker, local.slice(0, 3));
    }

    return accepted;
  }

  softenRepeatedHabits(speaker, text) {
    let value = clean(text, 320);
    if (!value) return value;
    const recent = [...(this.history || [])]
      .reverse()
      .filter((row) => row?.kind === "bot" && row.from === speaker)
      .slice(0, 3)
      .map((row) => String(row.text || ""));

    for (const habit of HABITS) {
      if (!habit.re.test(value)) continue;
      const recentlyUsed = recent.slice(0, 2).some((prior) => habit.re.test(prior));
      if (!recentlyUsed) continue;
      const adjusted = habit.replace != null
        ? value.replace(habit.strip, habit.replace)
        : value.replace(habit.strip, " ");
      const cleaned = clean(adjusted, 320);
      if (cleaned.length >= 2) {
        value = cleaned;
        this.v26Stats.repeatedHabitsSoftened += 1;
      }
    }
    return value;
  }

  async voiceBrainPlan(plan, active, human = null) {
    const lines = await super.voiceBrainPlan(plan, active, human);
    return (lines || []).map((line) => ({
      ...line,
      text: this.softenRepeatedHabits(line.speaker, line.text)
    })).filter((line) => line.text);
  }

  finishPlan(plan, status, reason = "") {
    const planReason = plan?.reason || "";
    const result = super.finishPlan(plan, status, reason);
    if (status !== "completed" || planReason !== "background") return result;

    const now = Date.now();
    const authority = this.sceneLifecycleAuthority?.() || null;
    if (authority?.closeExhaustedScenes) {
      const closedRows = authority.closeExhaustedScenes({
        source: "v26-finish-plan",
        reason: "conversation fatigue",
        now,
        minTurns: FATIGUE_CLOSE_TURNS
      });
      for (const row of closedRows) {
        const until = now + FATIGUE_TOPIC_COOLDOWN_MS;
        if (row.topic && row.topic !== "general") {
          const oldUntil = Number(this.topicFatigueUntil.get(row.topic) || 0);
          if (until > oldUntil) {
            this.topicFatigueUntil.set(row.topic, until);
            this.v26Stats.topicCooldownsStarted += 1;
          }
        }
        this.v26Stats.fatiguedScenesClosed += 1;
        this.broadcast({
          type: "scene_plan",
          action: "fatigue-close",
          sceneId: row.sceneId,
          topic: row.topic || "general",
          turns: row.turns,
          at: now
        });
      }
      return result;
    }

    for (const scene of typeof this.openScenes === "function" ? this.openScenes(now) : []) {
      if (Number(scene?.turns || 0) < FATIGUE_CLOSE_TURNS) continue;
      if (scene.openQuestion?.target && this.humanNames?.().includes(scene.openQuestion.target)) continue;
      if (this.recentSceneHuman(scene.id, now)) continue;

      const until = now + FATIGUE_TOPIC_COOLDOWN_MS;
      if (scene.topic && scene.topic !== "general") {
        const oldUntil = Number(this.topicFatigueUntil.get(scene.topic) || 0);
        if (until > oldUntil) {
          this.topicFatigueUntil.set(scene.topic, until);
          this.v26Stats.topicCooldownsStarted += 1;
        }
      }
      scene.status = "closed";
      scene.closedAt = now;
      scene.closeReason = "conversation fatigue";
      if (this.sceneStats) this.sceneStats.closed = Number(this.sceneStats.closed || 0) + 1;
      this.v26Stats.fatiguedScenesClosed += 1;
      this.broadcast({
        type: "scene_plan",
        action: "fatigue-close",
        sceneId: scene.id,
        topic: scene.topic || "general",
        turns: Number(scene.turns || 0),
        at: now
      });
    }
    return result;
  }

  repetitionSnapshot(rows) {
    let comparisons = 0;
    let repeats = 0;
    const bySpeaker = new Map();
    for (const row of rows) {
      const speaker = row.from || "";
      if (!speaker) continue;
      const prior = bySpeaker.get(speaker) || [];
      const current = clean(row.brainMeaning || row.text, 220);
      if (prior.length && words(current).size >= 2) {
        comparisons += 1;
        const strongest = prior.slice(0, 3).reduce((best, value) => Math.max(best, semanticSimilarity(current, value)), 0);
        if (strongest >= SEMANTIC_REPEAT_THRESHOLD) repeats += 1;
      }
      prior.unshift(current);
      bySpeaker.set(speaker, prior.slice(0, 5));
    }
    return { comparisons, repeats, repeatPct: pct(repeats, comparisons) };
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    const now = Date.now();
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || now);
    const bots = (this.history || [])
      .filter((row) => row?.kind === "bot" && Number(row.at || 0) >= floor)
      .slice(-180);

    const groups = sceneGroups(bots);
    const sizes = [...groups.values()];
    const singletonGroups = sizes.filter((size) => size === 1).length;
    const singletonPct = pct(singletonGroups, sizes.length);
    const averageSceneTurns = sizes.length ? Math.round(average(sizes) * 10) / 10 : 0;
    const maxSceneTurns = sizes.length ? Math.max(...sizes) : 0;
    const overlongScenes = sizes.filter((size) => size > FATIGUE_CLOSE_TURNS).length;
    const repetition = this.repetitionSnapshot(bots);

    const sceneComponent = (report.components || []).find((row) => row.name === "Scene cohesion");
    if (sceneComponent) {
      const singletonPenalty = singletonPct * 1.15;
      const maxPenalty = maxSceneTurns > 12 ? Math.min(45, (maxSceneTurns - 12) * 2.1) : 0;
      const averagePenalty = averageSceneTurns > 10 ? Math.min(24, (averageSceneTurns - 10) * 1.5) : 0;
      const repetitionPenalty = Math.min(18, repetition.repeatPct * 0.7);
      let score = 100 - singletonPenalty - maxPenalty - averagePenalty - repetitionPenalty;
      if (sizes.length && averageSceneTurns >= 3 && averageSceneTurns <= 9 && maxSceneTurns <= 14) score += 4;
      sceneComponent.score = Math.round(clamp(score));
      sceneComponent.details = {
        ...sceneComponent.details,
        groupedScenes: sizes.length,
        singletonGroups,
        singletonPct,
        averageSceneTurns,
        maxSceneTurns,
        overlongScenes,
        semanticRepeatPct: repetition.repeatPct,
        semanticRepeats: repetition.repeats
      };
    }

    const topicComponent = (report.components || []).find((row) => row.name === "Topic stability");
    if (topicComponent) {
      const transitions = Number(topicComponent.details?.transitions || 0);
      const churn = Number(topicComponent.details?.churnPct || 0);
      let score = 82;
      if (transitions >= 4) {
        if (churn < 8) score = 55 + churn * 4;
        else if (churn <= 35) score = 100 - Math.abs(churn - 20) * 0.55;
        else if (churn <= 55) score = 92 - (churn - 35) * 1.2;
        else score = 68 - (churn - 55) * 1.4;
      }
      topicComponent.score = Math.round(clamp(score));
      topicComponent.details = {
        ...topicComponent.details,
        idealChurnPct: "8-35",
        zeroChurnIsStagnation: transitions >= 8
      };
    }

    const flags = new Set(report.regressionFlags || []);
    if (maxSceneTurns > 18) {
      flags.add(`conversation lock: longest scene is ${maxSceneTurns} turns`);
      this.v26Stats.stagnationFlags += 1;
    }
    if (topicComponent && Number(topicComponent.details?.transitions || 0) >= 12 && Number(topicComponent.details?.churnPct || 0) < 5) {
      flags.add(`topic stagnation: ${topicComponent.details.churnPct}% change across ${topicComponent.details.transitions} transitions`);
    }
    if (repetition.comparisons >= 10 && repetition.repeatPct > 12) {
      flags.add(`semantic repetition high: ${repetition.repeatPct}% of comparable same-speaker lines`);
    }

    const weightTotal = (report.components || []).reduce((sum, row) => sum + Number(row.weight || 0), 0) || 1;
    const weighted = (report.components || []).reduce((sum, row) => sum + Number(row.score || 0) * Number(row.weight || 0), 0) / weightTotal;
    report.score = Math.round(clamp(weighted));
    report.grade = grade(report.score);
    report.pass = "anti-loop-humanization-v26";
    report.scope = includeAll ? "all retained messages" : "messages since v26 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.regressionFlags = [...flags];
    report.v26Scoring = {
      longScenesArePenalized: true,
      zeroTopicChurnIsPenalized: true,
      idealTopicChurnPct: [8, 35],
      semanticRepetitionMeasured: true
    };
    return report;
  }

  v26Snapshot(now = Date.now()) {
    const fatigue = typeof this.openScenes === "function"
      ? this.openScenes(now).map((scene) => ({ id: scene.id, topic: scene.topic, turns: scene.turns, status: scene.status }))
      : [];
    const topicCooldowns = [...this.topicFatigueUntil.entries()]
      .map(([topic, until]) => ({ topic, remainingMs: Math.max(0, Number(until || 0) - now) }))
      .filter((row) => row.remainingMs > 0);
    return { ...this.v26Stats, fatigue, topicCooldowns };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({
        ...data,
        pass: "anti-loop-humanization-v26",
        v26: this.v26Snapshot()
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "anti-loop-humanization-v26",
      v26: this.v26Snapshot()
    };
  }
}
