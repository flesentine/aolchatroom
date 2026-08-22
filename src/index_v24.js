import baseWorker, { ChatRoom as MemoryChatRoom } from "./index_v23.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const HARNESS_START_KEY = "realismHarnessV24Start";
const SAMPLE_MAX = 180;
const MIN_USEFUL_BOT_LINES = 18;
const AI_SOURCES = new Set(["gemini", "groq", "workers-ai", "ai"]);

const MODERN_OR_FUTURE = /\b(?:iphone|youtube|facebook|tiktok|instagram|reddit|bitcoin|spotify|netflix|tesla|discord|snapchat|wikipedia|gmail|android|uber|lyft|twitter|chatgpt|openai|covid|9\/11|september 11|199[7-9]|20\d\d)\b/i;
const IMPOSSIBLE_PHONE_USE = /\b(?:text(?:ed|ing)? you|send(?:ing)? (?:a )?(?:pic|photo|video)|camera phone|smartphone|phone screen|browse(?:d|ing)? (?:on|with) (?:my|the) phone|email(?:ed|ing)? from my phone)\b/i;
const VAGUE_REACTION = /^(?:lol|lmao|haha|hehe|really\??|seriously\??|what\??|huh\??|no way|wow|omg|yeah|yep|nope|nah|maybe|sure|exactly|same|true|right|whatever|cool|nice)[.!? <g>]*$/i;

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function average(values) {
  const rows = values.filter((v) => Number.isFinite(v));
  return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 0;
}

function median(values) {
  const rows = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!rows.length) return 0;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : Math.round((rows[mid - 1] + rows[mid]) / 2);
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

function groupCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.sceneId || row.scenePlanId || row.threadId || "";
    if (!key) continue;
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }
  return counts;
}

function latestPrior(rows, index, predicate, windowMs = 180000) {
  const at = Number(rows[index]?.at || 0);
  for (let i = index - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row) continue;
    if (at - Number(row.at || 0) > windowMs) break;
    if (predicate(row)) return row;
  }
  return null;
}

function component(name, score, weight, details) {
  return { name, score: Math.round(clamp(score)), weight, details };
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
        pass: "realism-regression-harness-v24",
        providerPriority: ["gemini", "groq", "workers-ai"],
        realismHarness: {
          liveScoreEndpoint: "/api/realism-score",
          historicalComparison: "/api/realism-score?all=1",
          metrics: [
            "AI coverage",
            "reply ownership",
            "scene cohesion",
            "topic churn",
            "contextless reactions",
            "human reply latency",
            "1996 integrity",
            "provider health",
            "active speaker balance"
          ]
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }
    if (url.pathname === "/api/realism-score") {
      const id = env.CHAT_ROOMS.idFromName("town-square");
      return env.CHAT_ROOMS.get(id).fetch(new Request(`https://room.internal/realism-score${url.search}`));
    }
    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends MemoryChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.realismHarnessStartedAt = 0;
    this.realismHarnessLoaded = false;
  }

  async ensureState() {
    await super.ensureState();
    if (this.realismHarnessLoaded) return;
    let started = Number(await this.ctx.storage.get(HARNESS_START_KEY) || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.realismHarnessLoaded = true;
  }

  providerHealthSnapshot() {
    const providers = this.configuredProviders?.() || [];
    let successes = 0;
    let failures = 0;
    let outputRejects = 0;
    const detail = {};

    for (const provider of providers) {
      const stats = this.providerStats?.get?.(provider) || {};
      const quality = this.providerQuality?.get?.(provider) || {};
      const rejects = Number(this.outputRejectStats?.get?.(provider) || quality.outputRejects || 0);
      const row = {
        successes: Number(stats.successes || quality.successes || 0),
        failures: Number(stats.failures || quality.failures || 0),
        outputRejects: rejects,
        ready: this.providerReady?.(provider, Date.now()) ?? true
      };
      detail[provider] = row;
      successes += row.successes;
      failures += row.failures;
      outputRejects += row.outputRejects;
    }
    return { providers: detail, successes, failures, outputRejects };
  }

  realismReport(includeAll = false) {
    const now = Date.now();
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || now);
    const rows = (this.history || [])
      .filter((row) => row && Number(row.at || 0) >= floor)
      .slice(-SAMPLE_MAX);
    const conversational = rows.filter((row) => row.kind === "human" || row.kind === "bot");
    const bots = conversational.filter((row) => row.kind === "bot");
    const humans = conversational.filter((row) => row.kind === "human");
    const aiBots = bots.filter((row) => AI_SOURCES.has(String(row.source || "")));

    const aiCoverage = pct(aiBots.length, bots.length);
    const aiCoverageScore = bots.length ? clamp((aiCoverage - 55) * 2.22) : 0;

    const messageById = new Map(conversational.filter((row) => row.messageId).map((row) => [row.messageId, row]));
    let directedBotLines = 0;
    let correctlyOwned = 0;
    let orphanDirected = 0;
    for (let i = 0; i < conversational.length; i += 1) {
      const row = conversational[i];
      if (row.kind !== "bot" || !row.target || row.target === "room") continue;
      directedBotLines += 1;
      const linked = row.replyTo ? messageById.get(row.replyTo) : null;
      const targetPrior = latestPrior(conversational, i, (prior) => prior.from === row.target && prior.kind !== "system", 180000);
      if ((linked && linked.from === row.target) || targetPrior) correctlyOwned += 1;
      else orphanDirected += 1;
    }
    const ownershipRate = directedBotLines ? pct(correctlyOwned, directedBotLines) : 100;
    const obligationAmbiguous = Number(this.obligationStats?.ambiguous || 0);
    const ownershipScore = clamp(ownershipRate - Math.min(20, obligationAmbiguous * 2));

    const groups = groupCounts(bots);
    const groupSizes = [...groups.values()];
    const singletonGroups = groupSizes.filter((n) => n === 1).length;
    const singletonPct = pct(singletonGroups, groupSizes.length);
    const averageSceneTurns = groupSizes.length ? Math.round(average(groupSizes) * 10) / 10 : 0;
    let cohesionScore = groupSizes.length ? clamp(100 - singletonPct * 1.35) : 72;
    if (averageSceneTurns >= 3 && averageSceneTurns <= 7) cohesionScore = clamp(cohesionScore + 8);

    const topicRows = conversational.filter((row) => row.topic && row.topic !== "general" && row.topic !== "greeting");
    let topicTransitions = 0;
    let topicChanges = 0;
    for (let i = 1; i < topicRows.length; i += 1) {
      topicTransitions += 1;
      if (topicRows[i].topic !== topicRows[i - 1].topic) topicChanges += 1;
    }
    const topicChurn = pct(topicChanges, topicTransitions);
    const topicScore = topicTransitions < 4 ? 82 : clamp(110 - topicChurn * 1.35);

    let contextless = 0;
    for (let i = 0; i < conversational.length; i += 1) {
      const row = conversational[i];
      if (row.kind !== "bot" || !VAGUE_REACTION.test(String(row.text || "").trim())) continue;
      const linked = row.replyTo ? messageById.get(row.replyTo) : null;
      const targeted = row.target && row.target !== "room";
      const sameScenePrior = latestPrior(conversational, i, (prior) => {
        const a = row.sceneId || row.scenePlanId || row.threadId;
        const b = prior.sceneId || prior.scenePlanId || prior.threadId;
        return a && b && a === b;
      }, 90000);
      if (!linked && !targeted && !sameScenePrior) contextless += 1;
    }
    const contextlessRate = pct(contextless, bots.length);
    const groundingScore = clamp(100 - contextlessRate * 4);

    const replyLatencies = [];
    let fastHumanReplies = 0;
    let humanRepliesMeasured = 0;
    for (let i = 0; i < conversational.length; i += 1) {
      const human = conversational[i];
      if (human.kind !== "human") continue;
      for (let j = i + 1; j < conversational.length; j += 1) {
        const bot = conversational[j];
        const delta = Number(bot.at || 0) - Number(human.at || 0);
        if (delta > 30000) break;
        if (bot.kind !== "bot") continue;
        const linked = bot.replyTo && human.messageId && bot.replyTo === human.messageId;
        const targeted = bot.target === human.from;
        if (!linked && !targeted) continue;
        humanRepliesMeasured += 1;
        replyLatencies.push(delta);
        if (delta < 3500) fastHumanReplies += 1;
        break;
      }
    }
    const fastReplyPct = pct(fastHumanReplies, humanRepliesMeasured);
    const medianReplyMs = median(replyLatencies);
    const timingScore = humanRepliesMeasured ? clamp(100 - fastReplyPct * 1.7 - (medianReplyMs && medianReplyMs < 4000 ? 12 : 0)) : 86;

    const eraErrors = bots.filter((row) => MODERN_OR_FUTURE.test(String(row.text || "")) || IMPOSSIBLE_PHONE_USE.test(String(row.text || "")));
    const eraScore = clamp(100 - eraErrors.length * 28);

    const provider = this.providerHealthSnapshot();
    const providerAttempts = provider.successes + provider.failures;
    const providerFailurePct = pct(provider.failures, providerAttempts);
    const rejectBase = provider.successes + provider.outputRejects;
    const providerRejectPct = pct(provider.outputRejects, rejectBase);
    const providerScore = providerAttempts
      ? clamp(100 - providerFailurePct * 1.15 - providerRejectPct * 0.35)
      : 82;

    const activeWindowFloor = now - 120000;
    const activeBotSpeakers = new Set(bots.filter((row) => Number(row.at || 0) >= activeWindowFloor).map((row) => row.from)).size;
    let speakerScore = 100;
    if (activeBotSpeakers > 8) speakerScore = clamp(100 - (activeBotSpeakers - 8) * 16);
    else if (activeBotSpeakers > 0 && activeBotSpeakers < 3 && bots.length >= MIN_USEFUL_BOT_LINES) speakerScore = 82;

    const brainCalls = Number(this.brainVoiceStats?.brainCalls || 0);
    const singleLayerFallbacks = Number(this.brainVoiceStats?.fallbackSingleLayer || 0);
    const brainFallbackPct = pct(singleLayerFallbacks, brainCalls);

    const components = [
      component("AI coverage", aiCoverageScore, 20, { aiCoveragePct: aiCoverage, aiLines: aiBots.length, botLines: bots.length }),
      component("Reply ownership", ownershipScore, 18, { directedBotLines, correctlyOwned, orphanDirected, ownershipRatePct: ownershipRate, ambiguousResolutions: obligationAmbiguous }),
      component("Scene cohesion", cohesionScore, 16, { groupedScenes: groupSizes.length, singletonGroups, singletonPct, averageSceneTurns }),
      component("Topic stability", topicScore, 12, { transitions: topicTransitions, changes: topicChanges, churnPct: topicChurn }),
      component("Context grounding", groundingScore, 10, { contextlessReactions: contextless, contextlessRatePct: contextlessRate }),
      component("Human reply timing", timingScore, 8, { measuredReplies: humanRepliesMeasured, fastReplies: fastHumanReplies, fastReplyPct, medianReplyMs }),
      component("1996 integrity", eraScore, 8, { violations: eraErrors.length, examples: eraErrors.slice(-3).map((row) => ({ from: row.from, text: row.text })) }),
      component("Provider health", providerScore, 5, { hardFailurePct: providerFailurePct, outputRejectPct: providerRejectPct, ...provider }),
      component("Speaker balance", speakerScore, 3, { uniqueBotSpeakersLast2Min: activeBotSpeakers })
    ];

    const weighted = components.reduce((sum, row) => sum + row.score * row.weight, 0) / components.reduce((sum, row) => sum + row.weight, 0);
    const score = Math.round(clamp(weighted));
    const flags = [];
    if (bots.length < MIN_USEFUL_BOT_LINES) flags.push(`warming up: only ${bots.length} bot lines since the v24 harness started`);
    if (bots.length && aiCoverage < 85) flags.push(`AI coverage low: ${aiCoverage}%`);
    if (groupSizes.length >= 4 && singletonPct > 30) flags.push(`too many singleton scenes: ${singletonPct}%`);
    if (topicTransitions >= 6 && topicChurn > 55) flags.push(`topic churn high: ${topicChurn}%`);
    if (contextlessRate > 5) flags.push(`contextless reactions high: ${contextlessRate}%`);
    if (humanRepliesMeasured >= 3 && fastReplyPct > 15) flags.push(`human replies too fast: ${fastReplyPct}% under 3.5s`);
    if (eraErrors.length) flags.push(`${eraErrors.length} possible 1996-world violation${eraErrors.length === 1 ? "" : "s"}`);
    if (providerAttempts >= 4 && providerFailurePct > 20) flags.push(`provider hard failures high: ${providerFailurePct}%`);
    if (brainCalls >= 4 && brainFallbackPct > 20) flags.push(`brain/voice fallback high: ${brainFallbackPct}%`);
    if (activeBotSpeakers > 8) flags.push(`too many active speakers in last 2 minutes: ${activeBotSpeakers}`);

    return {
      ok: true,
      pass: "realism-regression-harness-v24",
      score,
      grade: grade(score),
      sampleStatus: bots.length >= MIN_USEFUL_BOT_LINES ? "usable" : "warming-up",
      scope: includeAll ? "available history" : "messages since v24 harness activation",
      harnessStartedAt: this.realismHarnessStartedAt,
      sample: {
        totalMessages: conversational.length,
        humanLines: humans.length,
        botLines: bots.length,
        oldestAt: conversational[0]?.at || 0,
        newestAt: conversational[conversational.length - 1]?.at || 0
      },
      components,
      regressionFlags: flags,
      architecture: {
        brainVoiceFallbackPct: brainFallbackPct,
        scenePlanner: this.scenePlannerStats || {},
        obligations: this.obligationStats || {},
        responseTiming: this.responseTimingStats || {},
        brainVoice: this.brainVoiceStats || {},
        memory: this.memoryStats || this.characterMemoryStats || {}
      }
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/realism-score") {
      await this.ensureState();
      return Response.json(this.realismReport(url.searchParams.get("all") === "1"));
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status") return response;
    try {
      const data = await response.json();
      const report = this.realismReport(false);
      return Response.json({
        ...data,
        pass: "realism-regression-harness-v24",
        realism: {
          score: report.score,
          grade: report.grade,
          sampleStatus: report.sampleStatus,
          regressionFlags: report.regressionFlags
        }
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    const report = this.realismReport(false);
    return {
      ...base,
      pass: "realism-regression-harness-v24",
      realism: {
        score: report.score,
        grade: report.grade,
        sampleStatus: report.sampleStatus,
        sample: report.sample,
        components: report.components,
        regressionFlags: report.regressionFlags
      }
    };
  }
}
