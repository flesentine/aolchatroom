import { eraWorldViolation } from "./era_world.js";

const SCOPE_STOPWORDS = new Set([
  "a", "an", "and", "answer", "are", "as", "at", "be", "did", "do", "does",
  "for", "give", "he", "her", "him", "his", "how", "human", "i", "in", "is",
  "it", "its", "latest", "me", "message", "much", "my", "of", "on", "or", "our",
  "price", "cost", "say", "she", "that", "the", "their", "them", "they", "this",
  "to", "was", "were", "what", "whether", "with", "you", "your"
]);
const PRONOUN = "(?:it|that|this|one|they|them|those|these)";
const STRONG_CLAUSE_LEADER = "(?:do|does|did|is|are|was|were|have|has|had|can|could|would|will|should|i|you|he|she|we|they|there)";
const WH_QUESTION_START = "(?:(?:how(?:\\s+(?:much|many))?|what|why|when|where|who)\\s+(?:do|does|did|is|are|was|were|have|has|had|can|could|would|will|should)\\b)";
const NEGATED_CLAUSE_LEADER = "(?:isn't|aren't|wasn't|weren't|don't|doesn't|didn't|hasn't|haven't|hadn't|can't|couldn't|wouldn't|won't|shouldn't)";
const NOUN_CLAUSE_START = "(?:(?:the|my|your|his|her|our|their|this|that|these|those)\\s+(?:[a-z0-9][a-z0-9'-]*\\s+){0,9}[a-z0-9][a-z0-9'-]*\\s+(?:costs?|is|are|was|were|has|have|had|does|do|did)\\b)";
const INDEPENDENT_CLAUSE_START = `(?:${STRONG_CLAUSE_LEADER}\\b|${NEGATED_CLAUSE_LEADER}\\b|${WH_QUESTION_START})`;
const DISCOURSE_MARKER = "(?:that\\s+being\\s+said|that\\s+said|that\\s+aside|having\\s+said\\s+that|besides\\s+that|apart\\s+from\\s+that|other\\s+than\\s+that|honestly|frankly|seriously|actually|well|anyway|anyways|anyhow|then|now|btw|by\\s+the\\s+way|look|okay|ok|so|personally)";
const BOUNDARY_START = `(?:(?:${DISCOURSE_MARKER})[,;:]?\\s+)*${INDEPENDENT_CLAUSE_START}`;
const DISCOURSE_NOUN_BOUNDARY_START = `(?:(?:${DISCOURSE_MARKER})[,;:]?\\s+)+${NOUN_CLAUSE_START}`;
const DEMONSTRATIVE = "(?:this|that|these|those)";
const DEMONSTRATIVE_PRONOUN_FOLLOW = new Set([
  "a", "an", "any", "as", "actually", "also", "awesome", "awful", "bad", "better",
  "big", "black", "blue", "broken", "cheap", "cool", "even", "expensive", "fine",
  "fun", "good", "great", "gray", "green", "grey", "huge", "large", "little",
  "new", "newer", "nice", "old", "older", "okay", "ok", "original", "other",
  "pricey", "purple", "really", "red", "regular", "same", "silver", "sleek", "small", "so", "standard",
  "still", "terrible", "tiny", "too", "used", "very", "weird", "well", "white",
  "working", "worse", "worth", "yellow",
  "is", "are", "was", "were", "did", "does", "do", "has", "have", "had",
  "can", "could", "would", "will", "should"
]);
const NEGATIVE_AUXILIARY = new Map([
  ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"], ["weren't", "were not"],
  ["don't", "do not"], ["doesn't", "does not"], ["didn't", "did not"],
  ["hasn't", "has not"], ["haven't", "have not"], ["hadn't", "had not"],
  ["can't", "can not"], ["couldn't", "could not"], ["wouldn't", "would not"],
  ["won't", "will not"], ["shouldn't", "should not"]
]);
const BOUNDED_CLAUSE_MODIFIERS = "(?:(?:(?:not|still|just|even|always|never|maybe|perhaps|very|quite|rather|almost|nearly|too|so|yet|most|more)|[a-z]+ly)\\s+){0,4}";

function clean(value, max = 1800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeClauseBoundaries(value) {
  let surface = clean(value).replace(/[’]/g, "'");
  surface = surface.replace(
    new RegExp(`(${DISCOURSE_MARKER})\\s*,\\s+(?=${INDEPENDENT_CLAUSE_START})`, "gi"),
    "$1 "
  );
  surface = surface.replace(new RegExp(`,\\s+(?=${BOUNDARY_START})`, "gi"), "; ");
  surface = surface.replace(
    new RegExp(`\\s+(?:plus|also|and|but|although|while|whereas|even\\s+though|even\\s+if),?\\s+(?=(?:${BOUNDARY_START}|${DISCOURSE_NOUN_BOUNDARY_START}))`, "gi"),
    "; "
  );
  surface = surface.replace(
    new RegExp(`\\s+(?:plus|also),\\s+(?=${NOUN_CLAUSE_START})`, "gi"),
    "; "
  );
  return surface;
}

function splitClauses(value) {
  return normalizeClauseBoundaries(value)
    .split(/\s*(?:[;!?]+|\.\s+)\s*/i)
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

function normalizeNegativeAuxiliaries(value) {
  return clean(value, 500).replace(
    /\b(?:isn't|aren't|wasn't|weren't|don't|doesn't|didn't|hasn't|haven't|hadn't|can't|couldn't|wouldn't|won't|shouldn't)\b/gi,
    (match) => NEGATIVE_AUXILIARY.get(match.toLowerCase()) || match
  );
}

const DEMONSTRATIVE_NON_NOUN_FOLLOW = new Set([
  "and", "as", "at", "because", "but", "by", "for", "from", "if", "in",
  "of", "on", "or", "than", "to", "versus", "vs", "when", "where", "while", "with"
]);
const DEMONSTRATIVE_GENERIC_REFERENT = new Set([
  "accessory", "computer", "console", "controller", "device", "gadget", "game", "handheld",
  "hardware", "machine", "model", "one", "peripheral", "platform", "product",
  "system", "thing", "unit", "version"
]);
const DEMONSTRATIVE_NAMED_REFERENT_SOURCE = "(?:neo\\s+geo|sega\\s+saturn|saturn|super\\s+nintendo|nintendo\\s+64|n64|game\\s+boy|virtual\\s+boy|atari\\s+jaguar|jaguar|3do|playstation|genesis|snes|nes)";
const DEMONSTRATIVE_NAMED_REFERENT = new RegExp(`\\b${DEMONSTRATIVE_NAMED_REFERENT_SOURCE}\\b(?!-)`, "i");
const DEMONSTRATIVE_RELATION_PREDICATE_SOURCE =
  "(?:style|styled|compatible|inspired|based|like|themed|shaped|designed|type)";
const DEMONSTRATIVE_RELATION_NOMINAL_SOURCE =
  "(?:styling|compatibility|theme|theming|inspiration|shape|shaping|design|designing|likeness)";
const DEMONSTRATIVE_RELATION_TERM_SOURCE =
  `(?:${DEMONSTRATIVE_RELATION_PREDICATE_SOURCE}|${DEMONSTRATIVE_RELATION_NOMINAL_SOURCE})`;
const DEMONSTRATIVE_NAMING_ADVERB_SOURCE =
  "(?:also|better|commonly|formerly|generally|more|often|sometimes|typically|usually|widely)";
const DEMONSTRATIVE_NAMING_PREFIX_SOURCE =
  `(?:(?:(?:is|are|was|were)\\s+(?:${DEMONSTRATIVE_NAMING_ADVERB_SOURCE}\\s+){0,2})|(?:(?:has|have|had)\\s+(?:${DEMONSTRATIVE_NAMING_ADVERB_SOURCE}\\s+){0,2}been\\s+(?:${DEMONSTRATIVE_NAMING_ADVERB_SOURCE}\\s+){0,2}))?(?:called|named|known\\s+as)\\s+(?:the\\s+)?`;
const DEMONSTRATIVE_NAMED_RELATION_TAIL_SOURCE =
  `(?:-${DEMONSTRATIVE_RELATION_TERM_SOURCE}\\b|\\s+(?:(?:[a-z0-9]+-){1,3}${DEMONSTRATIVE_RELATION_TERM_SOURCE}\\b|(?:[a-z0-9-]+\\s+){0,2}${DEMONSTRATIVE_RELATION_TERM_SOURCE}\\b))`;
const DEMONSTRATIVE_NAMED_AFTER_GENERIC = new RegExp(
  `^\\s*(?:${DEMONSTRATIVE_NAMING_PREFIX_SOURCE}${DEMONSTRATIVE_NAMED_REFERENT_SOURCE}\\b(?!-)|,\\s*(?:${DEMONSTRATIVE_NAMING_PREFIX_SOURCE}${DEMONSTRATIVE_NAMED_REFERENT_SOURCE}\\b(?!-)|(?:the\\s+)?${DEMONSTRATIVE_NAMED_REFERENT_SOURCE}\\b(?!-)(?!${DEMONSTRATIVE_NAMED_RELATION_TAIL_SOURCE})))`,
  "i"
);
const DEMONSTRATIVE_NAMED_RELATION_MODIFIER = new RegExp(
  `${DEMONSTRATIVE_NAMED_REFERENT_SOURCE}${DEMONSTRATIVE_NAMED_RELATION_TAIL_SOURCE}`,
  "i"
);

function demonstrativeIsGenericReferent(value) {
  const normalized = String(value || "").toLowerCase();
  if (DEMONSTRATIVE_GENERIC_REFERENT.has(normalized)) return true;
  if (normalized.endsWith("ies") && DEMONSTRATIVE_GENERIC_REFERENT.has(`${normalized.slice(0, -3)}y`)) return true;
  return normalized.endsWith("s") && DEMONSTRATIVE_GENERIC_REFERENT.has(normalized.slice(0, -1));
}
const DEMONSTRATIVE_PREDICATE_FOLLOW = new Set([
  "cost", "costs", "feel", "feels", "fit", "fits", "happen", "happens",
  "help", "helps", "look", "looks", "matter", "matters", "mean", "means",
  "play", "plays", "run", "runs", "seem", "seems", "sound", "sounds",
  "suck", "sucks", "work", "works"
]);

function demonstrativeActsAsDeterminerAt(surface, offset, demonstrative) {
  const tail = surface.slice(offset + demonstrative.length);
  const match = /^\s+((?:[a-z0-9][a-z0-9-]*(?:\s+|(?=[,;.!?]|$))){1,10})/i.exec(tail);
  if (!match) return false;
  const tokenMatches = [...match[1].matchAll(/[a-z0-9][a-z0-9-]*/gi)];
  const words = tokenMatches.map((token) => token[0]);
  if (!words.length) return false;

  let explicitCandidate = false;
  let namedCandidate = false;
  const consumed = [];
  const phraseOffset = tail.indexOf(match[1]);
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const normalized = word.toLowerCase();
    if (demonstrativeIsGenericReferent(normalized)) {
      const token = tokenMatches[index];
      const afterGeneric = tail.slice(phraseOffset + token.index + word.length);
      const consumedSurface = consumed.join(" ");
      const namedBeforeGeneric = (
        namedCandidate || DEMONSTRATIVE_NAMED_REFERENT.test(consumedSurface)
      ) && !DEMONSTRATIVE_NAMED_RELATION_MODIFIER.test(consumedSurface);
      return namedBeforeGeneric || DEMONSTRATIVE_NAMED_AFTER_GENERIC.test(afterGeneric);
    }
    if (/^(?:it|one|they|them|this|that|these|those)$/.test(normalized)) return explicitCandidate;
    if (DEMONSTRATIVE_PREDICATE_FOLLOW.has(normalized)) return explicitCandidate;
    if (DEMONSTRATIVE_NON_NOUN_FOLLOW.has(normalized)) return explicitCandidate;
    consumed.push(word);
    if (DEMONSTRATIVE_PRONOUN_FOLLOW.has(normalized) || /ly$/.test(normalized)) continue;
    explicitCandidate = true;
    if (DEMONSTRATIVE_NAMED_REFERENT.test(consumed.join(" "))) {
      namedCandidate = true;
    }
  }
  return explicitCandidate;
}

function maskDemonstrativeDeterminers(clause) {
  const surface = clean(clause, 500);
  return surface.replace(
    new RegExp(`\\b(${DEMONSTRATIVE})\\b`, "gi"),
    (match, demonstrative, offset) => demonstrativeActsAsDeterminerAt(surface, offset, demonstrative)
      ? "explicit-subject"
      : match
  );
}

function embeddedPronounUsesPriorReferent(clause, pronoun) {
  const leader = new RegExp(
    `^(?:i\\s+(?:(?:can|could|would|might|may|really|just|actually|probably|still)\\s+){0,2}(?:think|guess|bet|mean|wonder|feel|hear|heard|know|believe|suppose|assume|suspect|remember|recall|figure|hope|doubt|reckon|understand|realize|realise|imagine|expect|consider|notice)|you\\s+(?:(?:can|could|would|might|may|really|just|actually|probably|still)\\s+){0,2}(?:think|guess|say|said|mean|know|believe|suppose|remember|recall|figure|reckon|understand|realize|realise|imagine|expect|consider|notice)|there\\s+(?:is|are|was|were))\\b\\s*(.*)`,
    "i"
  ).exec(clause);
  if (!leader) return false;

  const tail = leader[1] || "";
  const pronounMatch = new RegExp(`\\b${pronoun}\\b`, "i").exec(tail);
  if (!pronounMatch) return false;

  const beforePronoun = tail.slice(0, pronounMatch.index);
  const explicitSubject = new RegExp(
    `^\\s*(?!(?:${pronoun})\\b)(?:(?:the|a|an|my|your|his|her|our|their|explicit-subject)\\s+)?[a-z0-9][a-z0-9'-]*(?:\\s+[a-z0-9][a-z0-9'-]*){0,9}\\s+(?:(?:is|are|was|were|costs?|has|have|had|does|do|did)|(?:will|would|can|could|should|may|might|must)\\s+${BOUNDED_CLAUSE_MODIFIERS}(?:be|have|cost|work|look|seem|feel|run))\\b`,
    "i"
  ).test(beforePronoun);

  return !explicitSubject;
}

function comparisonPronounUsesPriorReferent(clause, pronoun) {
  const comparison = new RegExp(`\\b(?:than|versus|vs\\.?|over|compared\\s+(?:with|to|against)|(?:in|by)\\s+comparison\\s+(?:with|to|against)|relative\\s+to|(?:in|by)\\s+contrast\\s+(?:to|with|against)|contrasted\\s+(?:with|to|against)|in\\s+relation\\s+(?:to|with)|as\\s+opposed\\s+to)\\s+(${pronoun})\\b`, "gi");
  const localSelfTail = new RegExp(
    `^\\s+${BOUNDED_CLAUSE_MODIFIERS}(?:used\\s+to\\s+be|was|were|is|are|(?:has|have|had)\\s+${BOUNDED_CLAUSE_MODIFIERS}been)\\b`,
    "i"
  );
  let match;
  while ((match = comparison.exec(clause))) {
    const tail = clause.slice(comparison.lastIndex);
    if (localSelfTail.test(tail)) continue;
    return true;
  }
  return false;
}

function clauseIsAnaphoric(value) {
  const clause = normalizeNegativeAuxiliaries(stripDiscourseAnaphor(value));
  if (!clause) return false;
  const pronoun = PRONOUN;
  const masked = maskDemonstrativeDeterminers(clause);
  const directPronoun = new RegExp(`^(?:${pronoun})\\b`, "i").test(masked);
  const auxiliaryPronoun = new RegExp(`^(?:is|was|were|are|did|does|do|has|have|had|can|could|would|will|should)\\s+(?:not\\s+)?${pronoun}\\b`, "i").test(masked);
  const whPronoun = new RegExp(`^(?:how|what|why|when|where)\\b.*\\b${pronoun}\\b`, "i").test(masked);
  const youPronoun = new RegExp(`^(?:do|did|does|have|has|had|would|could|can|will|should)\\s+(?:not\\s+)?you\\b.*\\b${pronoun}\\b`, "i").test(masked);
  const embeddedPronoun = embeddedPronounUsesPriorReferent(masked, pronoun);
  const comparisonPronoun = comparisonPronounUsesPriorReferent(masked, pronoun);

  return directPronoun || auxiliaryPronoun || whPronoun || youPronoun || embeddedPronoun || comparisonPronoun;
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
