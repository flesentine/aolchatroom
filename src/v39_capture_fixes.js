import { simulatedCutoff, timelineEventsThrough } from "./historical_knowledge_v27.js";

const ERROR_CHALLENGE_CUE = /\b(?:how\s+can\s+you\s+make\s+(?:such\s+)?(?:a\s+)?(?:big\s+)?mistake|how\s+could\s+you\s+(?:make\s+(?:such\s+)?(?:a\s+)?(?:big\s+)?mistake|get\s+(?:that|it)\s+(?:so\s+)?wrong|be\s+(?:so\s+)?wrong)|how\s+did\s+you\s+get\s+(?:that|it)\s+(?:so\s+)?wrong|you\s+(?:got|had)\s+(?:that|it)\s+wrong|you\s+were\s+(?:just\s+)?wrong|that(?:'s|\s+is|\s+was)\s+(?:a\s+)?(?:pretty\s+|really\s+|big\s+)?mistake|that\s+was\s+wrong|why\s+did\s+you\s+say\s+that\s+if)\b/i;
const PUBLIC_EVENT_ASSERTION = /\b(?:released|release|opened|premiered|launched|debuted|came\s+out|got\s+released|was\s+released|just\s+released|just\s+opened)\b/i;
const RECENT_RELATIVE_DATE = /\b(?:today|tonight|yesterday|last\s+night|a\s+few\s+days\s+ago|this\s+week|last\s+week|(?:this|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;

function compact(value, max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function eventAgeDays(eventDate, cutoffDate) {
  const eventAt = Date.parse(`${eventDate}T12:00:00Z`);
  const cutoffAt = Date.parse(`${cutoffDate}T12:00:00Z`);
  if (!Number.isFinite(eventAt) || !Number.isFinite(cutoffAt)) return null;
  return Math.max(0, Math.floor((cutoffAt - eventAt) / 86400000));
}

function relativeWindowDays(text) {
  const value = String(text || "");
  if (/\blast\s+week\b/i.test(value)) return 14;
  if (/\bthis\s+week\b/i.test(value)) return 7;
  if (/\ba\s+few\s+days\s+ago\b/i.test(value)) return 6;
  return 8;
}

function matchingKnownEvent(text, cutoff) {
  const value = String(text || "");
  return timelineEventsThrough(cutoff, 3650).find((event) =>
    Array.isArray(event?.aliases) && event.aliases.some((pattern) => {
      try { return pattern.test(value); } catch { return false; }
    })
  ) || null;
}

export function isExplicitErrorChallenge(text = "") {
  return ERROR_CHALLENGE_CUE.test(String(text || ""));
}

export function applyErrorChallengePlan(plan = {}, human = null) {
  if (!isExplicitErrorChallenge(human?.text || "")) return plan;
  const lock = [
    "V39 ERROR-REPAIR LOCK:",
    `- Human challenge: \"${compact(human?.text || "", 220)}\".`,
    "- The human is explicitly challenging a mistake. Admit or explain the mistake FIRST in ordinary chat language.",
    "- Do not answer the challenge by merely supplying another date, title, correction, excuse, or unrelated fact.",
    "- If the prior bot statement was wrong, acknowledge that plainly instead of defending it or inventing a rationale."
  ].join("\n");
  const moves = Array.isArray(plan?.moves) ? plan.moves.map((move, index) => index === 0 ? {
    ...move,
    meaning: `${compact(move?.meaning || "", 420)}\n\n${lock}`.trim()
  } : move) : [];
  return {
    ...plan,
    goal: `${compact(plan?.goal || "", 420)}\n\n${lock}`.trim(),
    moves
  };
}

export function historicalDateMismatch(text, now = Date.now()) {
  const value = compact(text, 320);
  if (!value || !PUBLIC_EVENT_ASSERTION.test(value) || !RECENT_RELATIVE_DATE.test(value)) return null;

  const cutoff = simulatedCutoff(now);
  const event = matchingKnownEvent(value, cutoff);
  if (!event?.date) return null;

  const ageDays = eventAgeDays(event.date, cutoff.dateKey);
  const maxAgeDays = relativeWindowDays(value);
  if (ageDays === null || ageDays <= maxAgeDays) return null;

  return {
    kind: "historical-date-mismatch",
    reason: `relative date claim conflicts with known ${event.title} date`,
    event: event.title,
    actualDate: event.date,
    cutoff: cutoff.dateKey,
    eventAgeDays: ageDays,
    claimedWindowDays: maxAgeDays,
    text: value
  };
}

export function auditHistoricalDateClaims(history = [], floor = 0) {
  const examples = [];
  let checkedBotLines = 0;
  for (const row of history || []) {
    if (row?.kind !== "bot" || Number(row?.at || 0) < Number(floor || 0)) continue;
    checkedBotLines += 1;
    const violation = historicalDateMismatch(row?.text || "", Number(row?.at || Date.now()));
    if (!violation) continue;
    examples.push({
      at: row.at,
      from: row.from,
      text: compact(row.text, 220),
      severity: "block",
      reason: violation.reason,
      event: violation.event,
      actualDate: violation.actualDate,
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
