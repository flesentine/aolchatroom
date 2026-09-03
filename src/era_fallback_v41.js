import { eraWorldViolation } from "./era_world.js";

const SCOPE_STOPWORDS = new Set([
  "a", "an", "and", "answer", "are", "as", "at", "be", "did", "do", "does",
  "for", "give", "he", "her", "him", "his", "how", "human", "i", "in", "is",
  "it", "its", "latest", "me", "message", "much", "my", "of", "on", "or", "our",
  "price", "cost", "say", "she", "that", "the", "their", "them", "they", "this",
  "to", "was", "were", "what", "whether", "with", "you", "your"
]);

function clean(value, max = 1800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function splitClauses(value) {
  return clean(value)
    .replace(/[’]/g, "'")
    .split(/\s*(?:[;!?]+|\.\s+)\s*|\s+(?:even\s+though|even\s+if|although|while|whereas|but|and)\s+/i)
    .map((row) => clean(row, 500))
    .filter(Boolean);
}

function scopeTokens(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !SCOPE_STOPWORDS.has(token));
}

function overlapScore(left, right) {
  const a = new Set(scopeTokens(left));
  const b = new Set(scopeTokens(right));
  let score = 0;
  for (const token of a) if (b.has(token)) score += 1;
  return score;
}

export function scopedFallbackEraViolation(humanText, eraDateKey, scopeText = "") {
  const fullViolation = eraWorldViolation(humanText || "", eraDateKey);
  if (!fullViolation || fullViolation === "empty") return "";

  const clauses = splitClauses(humanText);
  if (clauses.length <= 1) return fullViolation;
  const rows = clauses.map((clause) => {
    const violation = eraWorldViolation(clause, eraDateKey);
    return { clause, violation: violation && violation !== "empty" ? violation : "" };
  });
  if (rows.every((row) => row.violation)) return fullViolation;

  const scope = clean(scopeText);
  if (!scope) return fullViolation;
  const scopeViolation = eraWorldViolation(scope, eraDateKey);
  if (scopeViolation && scopeViolation !== "empty") return scopeViolation;

  const scored = rows.map((row) => ({ ...row, score: overlapScore(scope, row.clause) }));
  const maxScore = Math.max(...scored.map((row) => row.score));
  if (maxScore <= 0) return fullViolation;
  const winners = scored.filter((row) => row.score === maxScore);
  if (winners.length !== 1) return fullViolation;
  return winners[0].violation || "";
}

export function periodSafeHumanFallbackLines(lines, human, eraDateKey, scopeText = "") {
  const rows = Array.isArray(lines) ? lines : [];
  const violation = eraDateKey && human
    ? scopedFallbackEraViolation(human.text || "", eraDateKey, scopeText)
    : "";
  if (!violation) return rows;

  // Preserve the inherited fallback's routing/source metadata. Only replace
  // built-in text when the human premise being answered cannot exist in the
  // sealed 1996 world; provider Voice has already been handled by Phase 2A.
  return rows.map((line) => {
    if (String(line?.source || "") !== "built-in") return line;
    return {
      ...line,
      text: "what? never heard of that",
      topic: "general",
      _v41EraSafeFallback: true
    };
  });
}
