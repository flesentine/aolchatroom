import { futureKnowledgeViolation, simulatedCutoff } from "./historical_knowledge_v27.js";

export const V39_BOT_REENTRY_COOLDOWN_MS = 3 * 60 * 1000;
export const V39_TARGET_REPAIR_WINDOW_MS = 90 * 1000;

const POST_1996_EVENTS = [
  {
    date: "1997-03-13",
    title: "Phoenix Lights",
    aliases: [/\bphoenix\s+lights\b/i]
  }
];

const REPAIR_CUE = /\b(?:who\s+me|what\s+do\s+you\s+mean|what\s+does\b.{0,70}\bhave\s+to\s+do\s+with|not\s+even\s+the\s+same\s+topic|had\s+what|so\s+why\s+(?:are|r)\s+(?:you|u)\s+saying|why\s+(?:are|r)\s+(?:you|u)\s+saying|i\s+thought|but\s+someone\s+said|makes?\s+no\s+sense|what(?:'s|\s+is)\s+(?:he|she|that)\s+have\s+to\s+do\s+with|who\s+is\s+(?:he|she|that)|who(?:'s|\s+is)\s+(?:he|she|that)|what\s+are\s+(?:you|u)\s+talking\s+about)\b/i;
const CHALLENGE_CUE = /\b(?:doesn'?t\s+make\s+sense|makes?\s+no\s+sense|not\s+even\s+the\s+same\s+topic|that\s+contradicts|you\s+just\s+said|u\s+just\s+said|i\s+thought|why\s+(?:are|r)\s+(?:you|u)\s+saying|so\s+why\s+(?:are|r)\s+(?:you|u)\s+saying|but\s+someone\s+said|that'?s\s+not\s+what|how\s+is\s+that|what\s+does\b.{0,70}\bhave\s+to\s+do\s+with)\b/i;
const CLARIFY_CUE = /\b(?:who\s+me|what\s+do\s+you\s+mean|had\s+what|who\s+is|who'?s|what'?s\s+(?:he|she|that)|give\s+me\s+an\s+example|do\s+you\s+have\s+an\s+example|what\s+are\s+you\s+talking\s+about)\b/i;
const SECOND_PERSON = /\b(?:you|your|youre|you're|u|ur)\b/i;
const IMPLIED_SECOND_PERSON = /\b(?:dude|man|stop|quit|knock it off|trying to|dont|don't)\b/i;
const REACTIVE_INTENT = /^(?:reply|answer|agree|disagree|react|clarify|respond|confirm|question|challenge|tease|correct|acknowledge)$/i;

function compact(value, max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function aliasToken(token) {
  const value = String(token || "").toLowerCase();
  if (value === "netcape") return "netscape";
  if (value === "ps" || value === "psx") return "playstation";
  if (value === "vcrs") return "vcr";
  return value;
}

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .map(aliasToken)
    .filter((word) => !["the", "and", "that", "this", "what", "with", "have", "does", "even", "same", "topic", "you", "your", "are", "why", "who", "but", "someone", "said"].includes(word));
}

function overlapCount(a, b) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  let overlap = 0;
  for (const word of aa) if (bb.has(word)) overlap += 1;
  return overlap;
}

function explicitBotMention(text, activeBotNames = []) {
  const lower = String(text || "").toLowerCase();
  return (activeBotNames || []).find((name) => lower.includes(String(name || "").toLowerCase())) || "";
}

export function futureEventViolation(text, now = Date.now()) {
  const value = compact(text);
  if (!value) return null;

  const inherited = futureKnowledgeViolation(value, now);
  if (inherited) {
    return {
      kind: "future-era-event",
      reason: `1996 event boundary blocked ${inherited.title}`,
      event: inherited.title,
      notBefore: inherited.date,
      cutoff: inherited.cutoff || simulatedCutoff(now).dateKey,
      text: value
    };
  }

  const cutoff = simulatedCutoff(now);
  for (const event of POST_1996_EVENTS) {
    if (!(event.aliases || []).some((pattern) => pattern.test(value))) continue;
    if (event.date <= cutoff.dateKey) continue;
    return {
      kind: "future-era-event",
      reason: `1996 event boundary blocked ${event.title}`,
      event: event.title,
      notBefore: event.date,
      cutoff: cutoff.dateKey,
      text: value
    };
  }
  return null;
}

export function inferClarificationTarget(history = [], text = "", sender = "", activeBotNames = [], now = Date.now()) {
  const value = compact(text, 320);
  if (!value || !REPAIR_CUE.test(value)) return null;
  if (explicitBotMention(value, activeBotNames)) return null;

  const active = new Set(activeBotNames || []);
  const recent = (history || [])
    .filter((row) => row?.kind === "bot" && active.has(row.from) && Number(now) - Number(row.at || 0) <= V39_TARGET_REPAIR_WINDOW_MS)
    .slice(-14);
  if (!recent.length) return null;

  const whoMe = /\bwho\s+me\b/i.test(value);
  const scored = recent.map((row, index) => {
    const ageMs = Math.max(0, Number(now) - Number(row.at || 0));
    const lexical = overlapCount(value, row.text || "");
    let score = lexical * 24;
    score += Math.max(0, 34 - ageMs / 2200);
    if (row.target === sender) score += 30;
    if (whoMe && (SECOND_PERSON.test(row.text || "") || IMPLIED_SECOND_PERSON.test(row.text || ""))) score += 42;
    if (/\bhotel\b/i.test(value) && /\bhotel\b/i.test(row.text || "")) score += 42;
    if (/\b(?:netscape|netcape)\b/i.test(value) && /\b(?:netscape|netcape)\b/i.test(row.text || "")) score += 30;
    if (/\bsaturn\b/i.test(value) && /\bsaturn\b/i.test(row.text || "")) score += 28;
    if (/\b(?:vcr|clock)\b/i.test(value) && /\b(?:vcr|clock)\b/i.test(row.text || "")) score += 24;
    return { row, score, index };
  }).sort((a, b) => b.score - a.score || b.index - a.index);

  const best = scored[0];
  if (!best || best.score < 48) return null;
  if (scored[1] && best.score - scored[1].score < 7 && overlapCount(value, best.row.text) === 0) return null;
  return {
    name: best.row.from,
    messageId: best.row.messageId || "",
    text: compact(best.row.text, 220),
    score: Math.round(best.score),
    reason: CHALLENGE_CUE.test(value) ? "challenge-repair" : "clarification-repair"
  };
}

function findHumanTrigger(history = [], human = null) {
  const rows = history || [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.kind !== "human") continue;
    if (human?.from && row.from !== human.from) continue;
    if (human?.text && compact(row.text, 320) !== compact(human.text, 320)) continue;
    return row;
  }
  return null;
}

function rowById(history = [], id = "") {
  if (!id) return null;
  return [...(history || [])].reverse().find((row) => String(row?.messageId || row?.id || "") === String(id)) || null;
}

export function humanCoherenceConstraint(history = [], human = null) {
  const trigger = findHumanTrigger(history, human) || human || null;
  if (!trigger) return { text: "", trigger: null, anchor: null, mode: "" };
  const anchor = rowById(history, trigger.replyTo || human?.replyTo || "");
  const triggerText = compact(trigger.text || human?.text, 240);
  const challenged = CHALLENGE_CUE.test(triggerText);
  const clarifying = CLARIFY_CUE.test(triggerText) || challenged;

  const rows = [
    "V39 COHERENCE LOCK:",
    `- Human trigger: ${trigger.from || human?.from || "human"}: \"${triggerText}\".`
  ];
  if (anchor) rows.push(`- Exact referenced line: ${anchor.from || "unknown"}: \"${compact(anchor.text, 240)}\".`);
  rows.push("- Answer the human's exact current meaning first. Do not jump to an unrelated artist, person, product, anecdote, or topic just to keep the chat moving.");
  rows.push("- Treat the exact referenced line and the immediately surrounding exchange as stronger evidence than stale scene/topic labels.");
  if (clarifying) rows.push("- This is a clarification/repair turn: explain the referenced wording or admit what was meant; do not invent a new premise.");
  if (challenged) rows.push("- The human is challenging an inconsistency. Acknowledge/correct the mismatch plainly if it exists; never defend an impossible premise by inventing another explanation.");
  return {
    text: rows.join("\n"),
    trigger,
    anchor,
    mode: challenged ? "challenge" : clarifying ? "clarify" : "direct"
  };
}

export function withCoherenceConstraint(plan = {}, history = [], human = null) {
  const constraint = humanCoherenceConstraint(history, human);
  if (!constraint.text) return { plan, constraint };
  const moves = Array.isArray(plan?.moves) ? plan.moves.map((move, index) => index === 0 ? {
    ...move,
    meaning: `${compact(move?.meaning || "", 420)}\n\n${constraint.text}`.trim()
  } : move) : [];
  return {
    plan: {
      ...plan,
      goal: `${compact(plan?.goal || "", 420)}\n\n${constraint.text}`.trim(),
      moves
    },
    constraint
  };
}

export function filterSelfDialogueLines(lines = []) {
  const kept = [];
  const blocked = [];
  for (const row of lines || []) {
    const speaker = String(row?.speaker || "");
    const target = String(row?.target || "room");
    const previous = kept[kept.length - 1] || null;
    let reason = "";
    if (speaker && target && target !== "room" && speaker === target) reason = "self-target";
    else if (previous && speaker && previous.speaker === speaker && REACTIVE_INTENT.test(String(row?.intent || ""))) reason = "consecutive-self-reaction";
    if (reason) blocked.push({ ...row, _v39SelfDialogueReason: reason });
    else kept.push(row);
  }
  return { kept, blocked };
}

export function lastBotLeaveAt(history = [], name = "") {
  if (!name) return 0;
  const needle = `${name} has left the room.`;
  const row = [...(history || [])].reverse().find((item) => item?.kind === "system" && item?.text === needle);
  return Number(row?.at || 0);
}

export function reentryCooldownRemaining(history = [], name = "", now = Date.now(), cooldownMs = V39_BOT_REENTRY_COOLDOWN_MS, rememberedLeaveAt = 0) {
  const leftAt = Math.max(Number(rememberedLeaveAt || 0), lastBotLeaveAt(history, name));
  if (!leftAt) return 0;
  return Math.max(0, Number(cooldownMs || 0) - (Number(now || 0) - leftAt));
}

export function auditFutureEventHistory(history = [], floor = 0) {
  const examples = [];
  let checkedBotLines = 0;
  for (const row of history || []) {
    if (row?.kind !== "bot" || Number(row?.at || 0) < Number(floor || 0)) continue;
    checkedBotLines += 1;
    const violation = futureEventViolation(row?.text || "", Number(row?.at || Date.now()));
    if (!violation) continue;
    examples.push({
      at: row.at,
      from: row.from,
      text: compact(row.text, 220),
      severity: "block",
      reason: violation.reason,
      event: violation.event,
      notBefore: violation.notBefore,
      messageId: row.messageId || ""
    });
  }
  return {
    checkedBotLines,
    violations: examples.length,
    blockers: examples.length,
    examples: examples.slice(-8)
  };
}
