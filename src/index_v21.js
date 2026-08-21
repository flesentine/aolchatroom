import baseWorker, { ChatRoom as ScenePlannerChatRoom } from "./index_v20.js";
import { getCharacter } from "./characters.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";
import { messageAddressesRoom, messageBreaksFocus, subjectForText } from "./continuity.js";

const OBLIGATION_WINDOW_MS = 120000;
const DIRECT_REPLY_MIN_DELAY_MS = 4200;
const ROOM_REPLY_MIN_DELAY_MS = 5200;
const MAX_HUMAN_REPLY_DELAY_MS = 9800;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeQuestion(row) {
  const text = String(row?.text || "").trim();
  if (!text) return false;
  if (String(row?.intent || "").toLowerCase() === "question") return true;
  if (/\?$/.test(text)) return true;
  return /^(?:who|what|where|when|why|how|which|anyone|anybody|did|do|does|are|is|has|have|can|could|would|wanna|want|ever|still)\b/i.test(text);
}

function yesNoAnswer(text) {
  return /^(?:yeah|yep|yes|yea|nah|nope|no|maybe|kinda|sorta|probably|sure|definitely|not really|i do|i did|i am|im|i'm)\b/i.test(String(text || "").trim());
}

function expectedAnswerType(question) {
  const q = String(question || "").toLowerCase();
  if (/\b(?:where|what part|what city|what state|from|live at|live in)\b/.test(q)) return "location";
  if (/\b(?:how old|age|asl)\b/.test(q)) return "age";
  if (/\b(?:what time|when|what hour)\b/.test(q)) return "time";
  if (/\b(?:plans|doing tonight|doing today|doing this weekend|up to tonight|weekend)\b/.test(q)) return "plans";
  if (/\b(?:favorite|fave|like|love|think of|think about|any good|worth it|good\?|sucks\?)\b/.test(q)) return "opinion";
  if (/^who\b/.test(q)) return "identity";
  if (/^(?:did|do|does|are|is|has|have|can|could|would|wanna|want|anyone|anybody|ever|still)\b/.test(q)) return "yesno";
  return "general";
}

function answerTypeScore(type, answer) {
  const a = String(answer || "").trim();
  const words = a.split(/\s+/).filter(Boolean);
  let score = 0;

  if (type === "age") {
    if (/^(?:im |i'm )?\d{1,2}\b/i.test(a)) score += 100;
    else if (/\b\d{1,2}\b/.test(a)) score += 70;
  } else if (type === "location") {
    if (!yesNoAnswer(a) && words.length <= 7) score += 48;
    if (/\b(?:ca|california|ny|new york|nj|new jersey|texas|florida|lakewood|los angeles|la|orange county|oc|seattle|boston|chicago|phoenix|arizona|san diego|sf|san francisco|vegas|nevada|ohio|michigan|atlanta|georgia)\b/i.test(a)) score += 34;
  } else if (type === "time") {
    if (/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(a)) score += 75;
    if (/\b(?:morning|afternoon|tonight|evening|later|after|before|around)\b/i.test(a)) score += 30;
  } else if (type === "plans") {
    if (/\b(?:going|gonna|working|work|staying|home|mall|movie|movies|party|hang|hanging|nothing|school|game|games|concert|sleep|out|friends)\b/i.test(a)) score += 52;
    if (words.length <= 10) score += 12;
  } else if (type === "opinion") {
    if (/\b(?:love|like|hate|good|great|bad|lame|awesome|cool|sucks|boring|fun|worth|better|best|favorite|fave)\b/i.test(a)) score += 55;
    if (yesNoAnswer(a)) score += 28;
  } else if (type === "identity") {
    if (words.length >= 1 && words.length <= 5) score += 42;
  } else if (type === "yesno") {
    if (yesNoAnswer(a)) score += 70;
  } else if (words.length <= 8) {
    score += 18;
  }

  return score;
}

function stableJitter(human, range = 3000) {
  const seed = `${human?.from || ""}|${human?.text || ""}|${Math.floor(Number(human?.at || 0) / 1000)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, range);
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
        pass: "obligation-reply-timing-v21",
        providerPriority: ["gemini", "groq", "workers-ai"],
        replyEngine: {
          openQuestionWindowSeconds: Math.round(OBLIGATION_WINDOW_MS / 1000),
          implicitReplyOwnership: true,
          ambiguityProtection: true,
          humanResponseTiming: true,
          directReplyMinimumMs: DIRECT_REPLY_MIN_DELAY_MS,
          roomReplyMinimumMs: ROOM_REPLY_MIN_DELAY_MS
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

export class ChatRoom extends ScenePlannerChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.openObligations = [];
    this.obligationsBuilt = false;
    this.lastReplyResolution = null;
    this.obligationStats = {
      questionsOpened: 0,
      implicitResolved: 0,
      explicitResolved: 0,
      ambiguous: 0,
      expired: 0,
      answered: 0
    };
    this.responseTimingStats = {
      delayedHumanTurns: 0,
      totalPlannedDelayMs: 0,
      lastPlannedDelayMs: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (!this.obligationsBuilt) this.rebuildObligations();
  }

  rebuildObligations() {
    const now = Date.now();
    this.openObligations = [];
    const recent = (this.history || []).filter((row) => now - Number(row?.at || 0) <= OBLIGATION_WINDOW_MS);
    for (const row of recent) {
      if (row?.kind === "bot" && looksLikeQuestion(row)) this.registerObligation(row, false);
      if (row?.kind === "human") this.closeObligationFromHuman(row, false);
    }
    this.pruneObligations(now, false);
    this.obligationsBuilt = true;
  }

  pruneObligations(now = Date.now(), countStats = true) {
    const kept = [];
    for (const item of this.openObligations) {
      if (item.status !== "open") continue;
      if (now - item.at > OBLIGATION_WINDOW_MS) {
        if (countStats) this.obligationStats.expired += 1;
        continue;
      }
      kept.push(item);
    }
    this.openObligations = kept.slice(-24);
  }

  registerObligation(row, countStats = true) {
    if (!row?.from || !looksLikeQuestion(row)) return;
    const id = row.messageId || `q-${row.from}-${row.at || Date.now()}`;
    if (this.openObligations.some((item) => item.id === id)) return;
    this.openObligations.push({
      id,
      messageId: row.messageId || "",
      asker: row.from,
      audience: row.target || "room",
      question: String(row.text || "").slice(0, 180),
      topic: row.topic || subjectForText(row.text, "general"),
      expected: expectedAnswerType(row.text),
      at: Number(row.at || Date.now()),
      status: "open"
    });
    if (countStats) this.obligationStats.questionsOpened += 1;
    this.pruneObligations(Date.now(), countStats);
  }

  closeObligationFromHuman(row, countStats = true) {
    if (!row || row.kind !== "human") return null;
    this.pruneObligations(Number(row.at || Date.now()), countStats);
    let match = null;
    if (row.replyTo) match = this.openObligations.find((item) => item.messageId && item.messageId === row.replyTo);
    if (!match && row.target && row.target !== "room") {
      match = [...this.openObligations].reverse().find((item) => item.asker === row.target && item.at <= Number(row.at || Date.now()));
    }
    if (!match) return null;
    match.status = "answered";
    match.answeredAt = Number(row.at || Date.now());
    match.answer = String(row.text || "").slice(0, 160);
    if (countStats) {
      this.obligationStats.answered += 1;
      this.openObligations = this.openObligations.filter((item) => item.status === "open");
    }
    return match;
  }

  pushMessage(message) {
    const result = super.pushMessage(message);
    const row = (this.history || [])[this.history.length - 1];
    if (row?.kind === "bot" && looksLikeQuestion(row)) this.registerObligation(row, true);
    return result;
  }

  explicitBotMention(text) {
    const value = String(text || "");
    for (const name of this.activeBotNames || []) {
      const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(name)}(?=$|[^A-Za-z0-9])`, "i");
      if (re.test(value)) return name;
    }
    return "";
  }

  scoreObligation(item, answer, sender, now = Date.now()) {
    const ageMs = Math.max(0, now - Number(item.at || 0));
    if (ageMs > OBLIGATION_WINDOW_MS || item.status !== "open") return -999;
    if (item.audience !== "room" && item.audience !== sender) return -999;

    let score = 82 - ageMs / 2600;
    if (item.audience === sender) score += 125;
    else score += 18;

    score += answerTypeScore(item.expected, answer);

    const qSubject = subjectForText(item.question, "general");
    const aSubject = subjectForText(answer, "general");
    if (qSubject !== "general" && qSubject === aSubject) score += 28;

    const focus = this.currentFocus?.(sender, now);
    if (focus?.bot === item.asker) score += 28;

    const lastBotToHuman = [...(this.history || [])].reverse().find((row) =>
      row?.kind === "bot" && row.from === item.asker && row.target === sender && now - Number(row.at || 0) <= OBLIGATION_WINDOW_MS
    );
    if (lastBotToHuman) score += 22;

    return score;
  }

  inferOpenQuestion(text, sender, now = Date.now()) {
    const answer = String(text || "").trim();
    if (!answer || messageAddressesRoom(answer) || messageBreaksFocus(answer)) return null;
    if (/\?$/.test(answer) && answer.split(/\s+/).length >= 4) return null;

    this.pruneObligations(now, true);
    const candidates = this.openObligations
      .filter((item) => item.status === "open")
      .map((item) => ({ item, score: this.scoreObligation(item, answer, sender, now) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length || candidates[0].score < 88) return null;

    const top = candidates[0];
    const second = candidates[1];
    const direct = top.item.audience === sender;
    if (!direct && second && top.score - second.score < 20) {
      this.obligationStats.ambiguous += 1;
      this.lastReplyResolution = {
        human: sender,
        answer: answer.slice(0, 100),
        resolution: "ambiguous",
        first: top.item.asker,
        second: second.item.asker,
        delta: Math.round(top.score - second.score),
        at: now
      };
      this.broadcast({ type: "reply_resolution", ...this.lastReplyResolution });
      return null;
    }

    const row = [...(this.history || [])].reverse().find((historyRow) =>
      historyRow?.kind === "bot"
      && historyRow.from === top.item.asker
      && (top.item.messageId ? historyRow.messageId === top.item.messageId : Number(historyRow.at || 0) === top.item.at)
    );

    if (!row) return null;
    this.obligationStats.implicitResolved += 1;
    this.lastReplyResolution = {
      human: sender,
      bot: top.item.asker,
      answer: answer.slice(0, 100),
      question: top.item.question.slice(0, 100),
      expected: top.item.expected,
      score: Math.round(top.score),
      resolution: "implicit",
      replyTo: top.item.messageId || "",
      at: now
    };
    this.broadcast({ type: "reply_resolution", ...this.lastReplyResolution });
    return row;
  }

  resolveDirectTarget(text, sender = "") {
    const explicit = this.explicitBotMention(text);
    if (explicit) {
      this.setFocus?.(sender, explicit, Date.now(), "explicit-name");
      const open = [...this.openObligations].reverse().find((item) => item.asker === explicit && item.status === "open");
      if (open?.messageId) this.pendingHumanReplyTo?.set(sender, open.messageId);
      this.obligationStats.explicitResolved += 1;
      return explicit;
    }

    if (messageAddressesRoom(text) || messageBreaksFocus(text)) {
      this.clearFocus?.(sender);
      return "room";
    }

    const question = this.inferOpenQuestion(text, sender, Date.now());
    if (question?.from && this.activeBotNames.includes(question.from)) {
      this.pendingHumanReplyTo?.set(sender, question.messageId || "");
      this.setFocus?.(sender, question.from, Date.now(), "open-obligation");
      this.implicitReplyCount = Number(this.implicitReplyCount || 0) + 1;
      this.lastImplicitReply = {
        human: sender,
        bot: question.from,
        question: String(question.text || "").slice(0, 100),
        answer: String(text || "").slice(0, 100),
        at: Date.now()
      };
      return question.from;
    }

    return super.resolveDirectTarget(text, sender);
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const pendingReplyTo = kind === "human" ? (this.pendingHumanReplyTo?.get(from) || meta.replyTo || "") : "";
    const result = super.say(from, text, kind, source, meta);
    if (result && kind === "human") {
      const row = (this.history || [])[this.history.length - 1];
      const linked = row?.kind === "human" ? row : { ...row, kind: "human", from, text, target: meta.target, replyTo: pendingReplyTo };
      const closed = this.closeObligationFromHuman(linked, true);
      if (closed && this.lastReplyResolution?.resolution !== "implicit") {
        this.lastReplyResolution = {
          human: from,
          bot: closed.asker,
          answer: String(text || "").slice(0, 100),
          question: closed.question.slice(0, 100),
          expected: closed.expected,
          resolution: pendingReplyTo ? "linked" : "explicit",
          replyTo: closed.messageId || pendingReplyTo,
          at: Date.now()
        };
        this.broadcast({ type: "reply_resolution", ...this.lastReplyResolution });
      }
    }
    return result;
  }

  obligationPrompt() {
    this.pruneObligations(Date.now(), true);
    const open = this.openObligations.slice(-8);
    if (!open.length) return "OPEN CONVERSATIONAL OBLIGATIONS:\n- none right now";
    const now = Date.now();
    return `OPEN CONVERSATIONAL OBLIGATIONS:\n${open.map((item) => {
      const audience = item.audience === "room" ? "room" : item.audience;
      return `- ${item.asker} asked ${audience} (${Math.round((now - item.at) / 1000)}s ago; expects ${item.expected}): ${item.question}`;
    }).join("\n")}\nWhen a human gives a short answer that plausibly satisfies one of these, preserve that ownership even if they did not repeat the asker's screen name. Do not make unrelated people act as though the answer was meant for them.`;
  }

  plannerContext() {
    return `${super.plannerContext()}\n\n${this.obligationPrompt()}`;
  }

  humanResponseDelay(human) {
    const direct = human?.target && human.target !== "room";
    const words = String(human?.text || "").trim().split(/\s+/).filter(Boolean).length;
    const base = direct ? DIRECT_REPLY_MIN_DELAY_MS : ROOM_REPLY_MIN_DELAY_MS;
    const reading = Math.min(1500, words * 120);
    const jitter = stableJitter(human, 3000);
    const character = direct ? getCharacter(human.target) : null;
    const slowerTyper = Number(character?.typing?.avgWords || 7) <= 5 ? 550 : 0;
    return clamp(base + reading + jitter + slowerTyper, base, MAX_HUMAN_REPLY_DELAY_MS);
  }

  async handlePendingHumanWithAi(now = Date.now()) {
    const human = this.pendingHumans?.[0];
    if (human) {
      if (!human._replyDueAt) {
        human._replyDelayMs = this.humanResponseDelay(human);
        human._replyDueAt = Number(human.at || now) + human._replyDelayMs;
      }
      if (now < human._replyDueAt) {
        this.nextBotAt = Math.max(Number(this.nextBotAt || 0), human._replyDueAt);
        return "wait";
      }
      if (!human._timingRecorded) {
        human._timingRecorded = true;
        this.responseTimingStats.delayedHumanTurns += 1;
        this.responseTimingStats.totalPlannedDelayMs += Number(human._replyDelayMs || 0);
        this.responseTimingStats.lastPlannedDelayMs = Number(human._replyDelayMs || 0);
        this.broadcast({
          type: "response_timing",
          human: human.from,
          target: human.target || "room",
          plannedDelayMs: Number(human._replyDelayMs || 0),
          at: now
        });
      }
    }
    return super.handlePendingHumanWithAi(now);
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      pass: "obligation-reply-timing-v21",
      replyEngine: {
        openObligations: this.openObligations.filter((item) => item.status === "open").map((item) => ({
          asker: item.asker,
          audience: item.audience,
          expected: item.expected,
          ageMs: now - item.at,
          question: item.question,
          messageId: item.messageId
        })),
        stats: { ...this.obligationStats },
        lastResolution: this.lastReplyResolution
      },
      responseTiming: {
        ...this.responseTimingStats,
        averagePlannedDelayMs: this.responseTimingStats.delayedHumanTurns
          ? Math.round(this.responseTimingStats.totalPlannedDelayMs / this.responseTimingStats.delayedHumanTurns)
          : 0
      }
    };
  }
}
