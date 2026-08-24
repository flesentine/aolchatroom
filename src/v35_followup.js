import { V35PlumbingChatRoom } from "./v35_plumbing.js";
import { getCharacter } from "./characters.js";

const DIRECT_REPAIR_WINDOW_MS = 90 * 1000;
const MAX_BRAIN_MOVES = 7;
const FOLLOWUP_CUE = /\?|\b(?:can you elaborate|elaborate|what do you mean|why(?: does| is| are| did| do)?|how(?: does| is| are| did| do)?|are you sure|r u sure|you sure|not sure|really|like whom|like who|come on|cmon)\b/i;
const REFERENTIAL_CUE = /\b(?:it|that|this|those|them|sure|really|why|how|elaborate|mean)\b/i;
const TOKEN_STOP = new Set([
  "about", "after", "again", "also", "been", "before", "being", "come", "does", "dont", "from", "have",
  "just", "like", "make", "more", "much", "really", "sure", "that", "them", "then", "there", "these", "they",
  "this", "those", "what", "when", "where", "which", "whom", "with", "would", "your", "youre"
]);

function compact(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !TOKEN_STOP.has(word));
}

function tokenOverlap(a, b) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  let n = 0;
  for (const word of aa) if (bb.has(word)) n += 1;
  return n;
}

function phraseOverlap(a, b) {
  const aa = tokens(a);
  const bb = new Set(tokens(b));
  if (aa.length < 2) return 0;
  let n = 0;
  for (let i = 0; i < aa.length - 1; i += 1) {
    if (bb.has(aa[i]) && bb.has(aa[i + 1])) n += 1;
  }
  return n;
}

export class V35FollowupChatRoom extends V35PlumbingChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v35PlanningHuman = null;
    this.v35StructuredGenerationDepth = 0;
    this.v35StructuredSkipNoted = false;
    this.lastSemanticRetarget = null;
  }

  explicitCharacterMention(text) {
    const value = String(text || "").toLowerCase();
    for (const name of this.activeBotNames || []) {
      if (value.includes(String(name || "").toLowerCase())) return name;
    }
    return "";
  }

  candidateReplyScore(human, row, now = Date.now()) {
    if (!row?.from || row.kind !== "bot" || !getCharacter(row.from)) return -999;
    const age = Math.max(0, now - Number(row.at || 0));
    if (age > DIRECT_REPAIR_WINDOW_MS) return -999;
    if (!this.activeBotNames?.includes(row.from)) return -999;

    const overlap = tokenOverlap(human?.text || "", row.text || "");
    const phrases = phraseOverlap(human?.text || "", row.text || "");
    let score = overlap * 11 + phrases * 7;
    if (row.target === human?.from) score += 4;
    if (row.from === human?.target) score += 3;
    if (REFERENTIAL_CUE.test(String(human?.text || "")) && overlap > 0) score += 5;
    score -= Math.min(7, age / 15000);
    return score;
  }

  repairHumanTarget(human, now = Date.now()) {
    if (!human || human.__v35TargetChecked) return human;
    human.__v35TargetChecked = true;
    const current = String(human.target || "room");
    if (current === "room" || !getCharacter(current) || this.explicitCharacterMention(human.text)) return human;

    const candidates = [];
    for (let i = (this.history || []).length - 1; i >= 0; i -= 1) {
      const row = this.history[i];
      const age = now - Number(row?.at || 0);
      if (age > DIRECT_REPAIR_WINDOW_MS) break;
      if (row?.kind !== "bot" || !row.from || !getCharacter(row.from)) continue;
      const score = this.candidateReplyScore(human, row, now);
      if (score > -900) candidates.push({ row, score });
      if (candidates.length >= 16) break;
    }
    if (!candidates.length) return human;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const currentBest = candidates.find((item) => item.row.from === current);
    const currentScore = Number(currentBest?.score ?? -999);
    if (!best?.row?.from || best.row.from === current || best.score < 10 || best.score < currentScore + 6) return human;

    const oldTarget = current;
    human.target = best.row.from;
    human.replyTo = best.row.messageId || human.replyTo || "";
    const historyRow = typeof this.humanHistoryRow === "function" ? this.humanHistoryRow(human) : null;
    if (historyRow) {
      historyRow.target = best.row.from;
      historyRow.replyTo = best.row.messageId || historyRow.replyTo || "";
      historyRow.threadId = best.row.threadId || historyRow.threadId;
      historyRow.sceneId = best.row.sceneId || historyRow.sceneId;
      if (best.row.topic && best.row.topic !== "general") historyRow.topic = best.row.topic;
    }
    if (best.row.messageId && this.pendingHumanReplyTo instanceof Map) this.pendingHumanReplyTo.set(human.from, best.row.messageId);
    this.setFocus?.(human.from, best.row.from, now, "v35-semantic-retarget");
    this.lockDirectConversation(best.row.from, human.from, now, "semantic-retarget");
    const oldLock = this.v35PresenceLocks?.get(oldTarget);
    if (oldLock?.human === human.from && oldLock?.reason === "human-direct") this.v35PresenceLocks.delete(oldTarget);

    this.bumpV35("semanticDirectRetargets");
    this.lastSemanticRetarget = {
      human: human.from,
      text: compact(human.text, 100),
      from: oldTarget,
      to: best.row.from,
      matchedText: compact(best.row.text, 120),
      score: Math.round(best.score),
      at: now
    };
    this.broadcast?.({ type: "v35_direct", action: "semantic-retarget", ...this.lastSemanticRetarget });
    return human;
  }

  directReplyObligation(human, now = Date.now()) {
    const target = String(human?.target || "room");
    if (target === "room" || !getCharacter(target) || !this.activeBotNames?.includes(target)) return false;
    if (this.pendingDepartures?.has(target)) return false;
    if (FOLLOWUP_CUE.test(String(human?.text || ""))) return true;
    return typeof this.recentExchangeScore === "function" && this.recentExchangeScore(target, human.from, now) > 0;
  }

  engagementDecision(human, now = Date.now()) {
    const decision = super.engagementDecision(human, now);
    if (!this.directReplyObligation(human, now)) return decision;
    decision.respond = true;
    decision.chance = 1;
    decision.directReplyGuarantee = true;
    this.bumpV35("directEngagementGuarantees");
    return decision;
  }

  async handlePendingHumanWithAi(now = Date.now()) {
    if (this.pendingHumans?.length) this.repairHumanTarget(this.pendingHumans[0], now);
    return super.handlePendingHumanWithAi(now);
  }

  async generateHumanReplan(human) {
    this.repairHumanTarget(human, Date.now());
    this.v35PlanningHuman = human || null;
    try {
      return await super.generateHumanReplan(human);
    } finally {
      this.v35PlanningHuman = null;
    }
  }

  validateBrainMoves(rawMoves, activeNames) {
    let moves = super.validateBrainMoves(rawMoves, activeNames);
    const human = this.v35PlanningHuman;
    if (!this.directReplyObligation(human, Date.now())) return moves;

    const target = human.target;
    const directIndex = moves.findIndex((move) => move.speaker === target && move.target === human.from);
    const prefix = `Directly address ${human.from}'s latest message before changing topic. If a premise or factual detail is uncertain, clarify it or say you are not sure instead of inventing confirmation.`;

    if (directIndex >= 0) {
      const direct = { ...moves[directIndex], meaning: compact(`${prefix} ${moves[directIndex].meaning || ""}`, 260) };
      moves.splice(directIndex, 1);
      moves.unshift(direct);
      if (directIndex > 0) this.bumpV35("directFirstMovesReordered");
      else this.bumpV35("directFirstMovesReinforced");
      return moves.slice(0, MAX_BRAIN_MOVES);
    }

    moves.unshift({
      speaker: target,
      target: human.from,
      intent: "reply",
      topic: "general",
      meaning: prefix
    });
    this.bumpV35("directFirstMovesInjected");
    return moves.slice(0, MAX_BRAIN_MOVES);
  }

  async callGroq(...args) {
    this.v35StructuredGenerationDepth += 1;
    this.v35StructuredSkipNoted = false;
    try {
      return await super.callGroq(...args);
    } finally {
      this.v35StructuredGenerationDepth = Math.max(0, this.v35StructuredGenerationDepth - 1);
      if (!this.v35StructuredGenerationDepth) this.v35StructuredSkipNoted = false;
    }
  }

  orderedReadyProviders(now = Date.now()) {
    const providers = super.orderedReadyProviders(now);
    if (!this.v35StructuredGenerationDepth) return providers;
    const filtered = providers.filter((provider) => provider !== "workers-ai");
    if (filtered.length !== providers.length && !this.v35StructuredSkipNoted) {
      this.v35StructuredSkipNoted = true;
      this.bumpV35("workersStructuredSkips");
    }
    return filtered;
  }
}
