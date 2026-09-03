import { eraWorldViolation } from "./era_world.js";

const SCOPE_STOPWORDS = new Set([
  "a", "an", "and", "answer", "are", "as", "at", "be", "did", "do", "does",
  "for", "give", "he", "her", "him", "his", "how", "human", "i", "in", "is",
  "it", "its", "latest", "me", "message", "much", "my", "of", "on", "or", "our",
  "price", "cost", "say", "she", "that", "the", "their", "them", "they", "this",
  "to", "was", "were", "what", "whether", "with", "you", "your"
]);
const PRONOUN = "(?:it|that|this|one|they|them|those|these)";
const CLAUSE_LEADER = "(?:how|what|why|when|where|who|do|does|did|is|are|was|were|have|has|had|can|could|would|will|should|i|you|he|she|we|they|there)";
const DISCOURSE_MARKER = "(?:that\\s+being\\s+said|that\\s+said|that\\s+aside|having\\s+said\\s+that|besides\\s+that|apart\\s+from\\s+that|other\\s+than\\s+that|honestly|frankly|seriously|actually|well|anyway|anyhow|look|okay|ok|so|personally)";
const DEMONSTRATIVE = "(?:this|that|these|those)";
const DEMONSTRATIVE_PRONOUN_FOLLOW = new Set([
  "a", "an", "any", "as", "actually", "also", "better", "bad", "cheap", "cool",
  "even", "expensive", "fine", "fun", "good", "great", "okay", "ok", "really",
  "still", "so", "terrible", "too", "very", "well", "worse", "worth",
  "is", "are", "was", "were", "did", "does", "do", "has", "have", "had",
  "can", "could", "would", "will", "should"
]);

function clean(value, max = 1800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeClauseBoundaries(value) {
  let surface = clean(value).replace(/[’]/g, "'");
  surface = surface.replace(
    new RegExp(`(${DISCOURSE_MARKER})\\s*,\\s+(?=${CLAUSE_LEADER}\\b)`, "gi"),
    "$1 "
  );
  surface = surface.replace(new RegExp(`,\\s+(?=${CLAUSE_LEADER}\\b)`, "gi"), "; ");
  surface = surface.replace(new RegExp(`\\s+(?:plus|also)\\s+(?=${CLAUSE_LEADER}\\b)`, "gi"), "; ");
  return surface;
}

function splitClauses(value) {
  return normalizeClauseBoundaries(value)
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

function stripDiscourseAnaphor(value) {
  let clause = clean(value, 500);
  const prefix = new RegExp(`^(?:(?:${DISCOURSE_MARKER})[,;:]?\\s+)+`, "i");
  while (prefix.test(clause)) clause = clause.replace(prefix, "");
  return clause;
}

function demonstrativeActsAsDeterminer(clause) {
  const normalized = clean(clause, 500).toLowerCase();
  const match = normalized.match(new RegExp(`\\b${DEMONSTRATIVE}\\s+([a-z0-9][a-z0-9-]*)\\b`, "i"));
  if (!match) return false;
  return !DEMONSTRATIVE_PRONOUN_FOLLOW.has(match[1]);
}

function clauseIsAnaphoric(value) {
  const clause = stripDiscourseAnaphor(value);
  if (!clause) return false;
  const pronoun = PRONOUN;
  const demonstrativeDeterminer = demonstrativeActsAsDeterminer(clause);
  const directPronoun = new RegExp(`^(?:${pronoun})\\b`, "i").test(clause);
  const auxiliaryPronoun = new RegExp(`^(?:is|was|were|are|did|does|do|has|have|had|can|could|would|will|should)\\s+${pronoun}\\b`, "i").test(clause);
  const whPronoun = new RegExp(`^(?:how|what|why|when|where)\\b.*\\b${pronoun}\\b`, "i").test(clause);
  const youPronoun = new RegExp(`^(?:do|did|does|have|has|had|would|could|can|will|should)\\s+you\\b.*\\b${pronoun}\\b`, "i").test(clause);

  if (demonstrativeDeterminer && new RegExp(`\\b${DEMONSTRATIVE}\\b`, "i").test(clause)) {
    const withoutDemonstratives = clause.replace(new RegExp(`\\b${DEMONSTRATIVE}\\b`, "gi"), " explicit-subject ");
    return new RegExp(`^(?:it|one|they|them)\\b`, "i").test(withoutDemonstratives)
      || new RegExp(`^(?:is|was|were|are|did|does|do|has|have|had|can|could|would|will|should)\\s+(?:it|one|they|them)\\b`, "i").test(withoutDemonstratives)
      || new RegExp(`^(?:how|what|why|when|where)\\b.*\\b(?:it|one|they|them)\\b`, "i").test(withoutDemonstratives)
      || new RegExp(`^(?:do|did|does|have|has|had|would|could|can|will|should)\\s+you\\b.*\\b(?:it|one|they|them)\\b`, "i").test(withoutDemonstratives);
  }

  return directPronoun || auxiliaryPronoun || whPronoun || youPronoun;
}

function groupedRows(humanText, eraDateKey) {
  const rows = [];
  for (const clause of splitClauses(humanText)) {
    const rawViolation = eraWorldViolation(clause, eraDateKey);
    const violation = rawViolation && rawViolation !== "empty" ? rawViolation : "";
    if (!violation && rows.length && clauseIsAnaphoric(clause)) {
      const previous = rows[rows.length - 1];
      previous.clause = `${previous.clause}; ${clause}`;
      previous.anaphoricTail = true;
      continue;
    }
    rows.push({ clause, violation });
  }
  return rows;
}

export function trustedGenerationContractScope(last, human) {
  const stored = last?.human;
  if (!stored || !human) return "";

  const storedId = clean(stored.messageId, 120);
  const currentId = clean(human.messageId, 120);
  if (storedId && currentId && storedId !== currentId) return "";

  if (clean(stored.from, 32) !== clean(human.from, 32)) return "";
  if (clean(stored.target || "room", 32) !== clean(human.target || "room", 32)) return "";
  if (clean(stored.replyTo, 120) !== clean(human.replyTo, 120)) return "";
  if (clean(stored.text, 1800) !== clean(human.text, 1800)) return "";

  const move = last.move || {};
  return clean([
    move.subject,
    move.goal,
    move.meaning,
    move.topic,
    JSON.stringify(move)
  ].filter(Boolean).join(" "), 1200);
}

export function scopedFallbackEraViolation(humanText, eraDateKey, scopeText = "") {
  const fullViolation = eraWorldViolation(humanText || "", eraDateKey);
  if (!fullViolation || fullViolation === "empty") return "";

  const rows = groupedRows(humanText, eraDateKey);
  if (rows.length <= 1) return fullViolation;
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
