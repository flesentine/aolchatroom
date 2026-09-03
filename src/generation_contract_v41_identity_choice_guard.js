import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateReview95Voice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_review95_base.js";
import { eraWorldViolation } from "./era_world.js";

const STRUCTURAL_FAILURE = /^(?:missing-primary-line|primary-speaker-mismatch|primary-target-mismatch)$/;
const ERA_SCOPE_STOPWORDS = new Set([
  "a", "an", "and", "answer", "are", "as", "at", "be", "did", "do", "does",
  "for", "give", "he", "her", "him", "his", "how", "human", "i", "in", "is",
  "it", "its", "latest", "me", "message", "much", "my", "of", "on", "or", "our",
  "price", "cost", "say", "she", "that", "the", "their", "them", "they", "this",
  "to", "was", "were", "what", "whether", "with", "you", "your"
]);
const ERA_PRONOUN = "(?:it|that|this|one|they|them|those|these)";
const ERA_STRONG_CLAUSE_LEADER = "(?:do|does|did|is|are|was|were|have|has|had|can|could|would|will|should|i|you|he|she|we|they|there)";
const ERA_WH_QUESTION_START = "(?:(?:how(?:\\s+(?:much|many))?|what|why|when|where|who)\\s+(?:do|does|did|is|are|was|were|have|has|had|can|could|would|will|should)\\b)";
const ERA_NEGATED_CLAUSE_LEADER = "(?:isn't|aren't|wasn't|weren't|don't|doesn't|didn't|hasn't|haven't|hadn't|can't|couldn't|wouldn't|won't|shouldn't)";
const ERA_NOUN_CLAUSE_START = "(?:(?:the|my|your|his|her|our|their|this|that|these|those)\\s+(?:[a-z0-9][a-z0-9'-]*\\s+){0,4}[a-z0-9][a-z0-9'-]*\\s+(?:costs?|is|are|was|were|has|have|had|does|do|did)\\b)";
const ERA_INDEPENDENT_CLAUSE_START = `(?:${ERA_STRONG_CLAUSE_LEADER}\\b|${ERA_NEGATED_CLAUSE_LEADER}\\b|${ERA_WH_QUESTION_START}|${ERA_NOUN_CLAUSE_START})`;
const ERA_DISCOURSE_MARKER = "(?:that\\s+being\\s+said|that\\s+said|that\\s+aside|having\\s+said\\s+that|besides\\s+that|apart\\s+from\\s+that|other\\s+than\\s+that|honestly|frankly|seriously|actually|well|anyway|anyways|anyhow|then|now|btw|by\\s+the\\s+way|look|okay|ok|so|personally)";
const ERA_BOUNDARY_START = `(?:(?:${ERA_DISCOURSE_MARKER})[,;:]?\\s+)*${ERA_INDEPENDENT_CLAUSE_START}`;
const DEMONSTRATIVE = "(?:this|that|these|those)";
const DEMONSTRATIVE_PRONOUN_FOLLOW = new Set([
  "a", "an", "any", "as", "actually", "also", "better", "bad", "cheap", "cool",
  "even", "expensive", "fine", "fun", "good", "great", "okay", "ok", "really",
  "still", "so", "terrible", "too", "very", "well", "worse", "worth",
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
const ERA_IGNORANCE_CLAUSE = /^(?:(?:huh+|what|lol\s+what|uh+\s+what)|what(?:'s|\s+is|\s+are)?\s+(?:that|this|it)|what\s+do\s+you\s+mean(?:\s+by\s+(?:that|this|it))?|what\s+are\s+you\s+talking\s+about|(?:i(?:'ve|\s+have)?\s+)?never\s+heard(?:\s+of)?\s+(?:that|it)(?:\s+before)?|(?:i\s+)?(?:haven't|have\s+not)\s+heard\s+of\s+(?:that|it)|(?:i\s+)?have\s+never\s+heard\s+of\s+(?:that|it)|(?:i\s+)?(?:do\s+not|don't|dont)\s+know(?:\s+what\s+(?:that|it)\s+is)?|(?:i\s+)?(?:have\s+)?no\s+(?:idea|clue)(?:\s+what\s+(?:that|it)\s+is)?|beats\s+me|(?:(?:that|this|it)\s+)?(?:doesn't|does\s+not|doesnt)\s+ring\s+a\s+bell|are\s+you\s+(?:joking|kidding|making\s+that\s+up)|(?:that|it)\s+sounds\s+made\s+up|you\s+mean\s+(?:the\s+)?playstation|are\s+you\s+from\s+the\s+future|from\s+the\s+future)$/i;

function clean(value, max = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeInternalApostrophePossessives(value) {
  return value.replace(
    /\b(?:the\s+)?(?:[a-z][a-z0-9-]*(?:'[a-z][a-z0-9-]*)*'(?:s)?)\s+(?:(?!(?:for|with|compatible|designed|made|built|intended|works?|used|on|of|at|by|to|from)\b)[a-z][a-z0-9'-]*\s+)*(?=(?:playstation|ps)\s*\d+\b)/gi,
    "my "
  );
}

function normalizeModelPossessive(value) {
  return value.replace(/\b((?:playstation|ps)\s*\d+)\s*'s\b/gi, "$1");
}

function normalizeRelationHeadCompoundModifiers(value) {
  return value.replace(
    /\b([a-z][a-z0-9-]*)\s+(?:(?:[a-z]+ly|very|well|hand|factory|mass|purpose|home|custom)(?:\s*-\s*|\s+))+(designed|made|built|intended)\b(?=[^.;!?]{0,120}\b(?:for|to\s+(?:work\s+)?with)\s+(?:(?:the|my|your|his|her|their|our)\s+)?(?:playstation|ps)\s*\d+\b)/gi,
    "$1 $2"
  );
}

function normalizeReview96to112Surface(value) {
  let surface = clean(value).replace(/[’]/g, "'");
  surface = normalizeInternalApostrophePossessives(surface);
  surface = normalizeModelPossessive(surface);
  surface = normalizeRelationHeadCompoundModifiers(surface);
  return clean(surface);
}

function normalizeEraClauseBoundaries(value) {
  let surface = clean(value, 1800).replace(/[’]/g, "'");
  surface = surface.replace(
    new RegExp(`(${ERA_DISCOURSE_MARKER})\\s*,\\s+(?=${ERA_INDEPENDENT_CLAUSE_START})`, "gi"),
    "$1 "
  );
  surface = surface.replace(new RegExp(`,\\s+(?=${ERA_BOUNDARY_START})`, "gi"), "; ");
  surface = surface.replace(
    new RegExp(`\\s+(?:plus|also|and|but|although|while|whereas|even\\s+though|even\\s+if),?\\s+(?=${ERA_BOUNDARY_START})`, "gi"),
    "; "
  );
  return surface;
}

function splitHumanEraClauses(value) {
  return normalizeEraClauseBoundaries(value)
    .split(/\s*(?:[;!?]+|\.\s+)\s*/i)
    .map((row) => clean(row, 500))
    .filter(Boolean);
}

function eraTokens(value) {
  return clean(value, 1800)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !ERA_SCOPE_STOPWORDS.has(token));
}

function overlapScore(left, right) {
  const a = new Set(eraTokens(left));
  const b = new Set(eraTokens(right));
  let score = 0;
  for (const token of a) if (b.has(token)) score += 1;
  return score;
}

function stripDiscourseAnaphor(value) {
  let clause = clean(value, 500);
  const prefix = new RegExp(`^(?:(?:${ERA_DISCOURSE_MARKER})[,;:]?\\s+)+`, "i");
  while (prefix.test(clause)) clause = clause.replace(prefix, "");
  return clause;
}

function normalizeNegativeAuxiliaries(value) {
  return clean(value, 500).replace(
    /\b(?:isn't|aren't|wasn't|weren't|don't|doesn't|didn't|hasn't|haven't|hadn't|can't|couldn't|wouldn't|won't|shouldn't)\b/gi,
    (match) => NEGATIVE_AUXILIARY.get(match.toLowerCase()) || match
  );
}

function maskDemonstrativeDeterminers(clause) {
  return clean(clause, 500).replace(
    new RegExp(`\\b(${DEMONSTRATIVE})\\s+([a-z0-9][a-z0-9-]*)\\b`, "gi"),
    (match, demonstrative, next) => DEMONSTRATIVE_PRONOUN_FOLLOW.has(String(next || "").toLowerCase())
      ? match
      : `explicit-subject ${next}`
  );
}

function clauseIsAnaphoric(value) {
  const clause = normalizeNegativeAuxiliaries(stripDiscourseAnaphor(value));
  if (!clause) return false;
  const pronoun = ERA_PRONOUN;
  const masked = maskDemonstrativeDeterminers(clause);
  const directPronoun = new RegExp(`^(?:${pronoun})\\b`, "i").test(masked);
  const auxiliaryPronoun = new RegExp(`^(?:is|was|were|are|did|does|do|has|have|had|can|could|would|will|should)\\s+(?:not\\s+)?${pronoun}\\b`, "i").test(masked);
  const whPronoun = new RegExp(`^(?:how|what|why|when|where)\\b.*\\b${pronoun}\\b`, "i").test(masked);
  const youPronoun = new RegExp(`^(?:do|did|does|have|has|had|would|could|can|will|should)\\s+(?:not\\s+)?you\\b.*\\b${pronoun}\\b`, "i").test(masked);
  const embeddedPronoun = new RegExp(
    `^(?:i\\s+(?:think|guess|bet|mean|wonder|feel|heard)|you\\s+(?:think|guess|said|say|mean)|there\\s+(?:is|are|was|were))\\b.*\\b${pronoun}\\b`,
    "i"
  ).test(masked);
  const comparisonPronoun = new RegExp(`\\b(?:than|versus|vs\\.?|over)\\s+${pronoun}\\b`, "i").test(masked);

  return directPronoun || auxiliaryPronoun || whPronoun || youPronoun || embeddedPronoun || comparisonPronoun;
}

function groupEraClauseRows(clauses, dateKey) {
  const rows = [];
  for (const clause of clauses) {
    const rawViolation = eraWorldViolation(clause, dateKey);
    const violation = rawViolation && rawViolation !== "empty" ? rawViolation : null;
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

function semanticScopeText(args, evaluation) {
  const planned = args?.plan?.moves?.[0] || {};
  const contracted = evaluation?.contract?.move || {};
  return clean([
    args?.plan?.subject,
    args?.plan?.goal,
    planned.subject,
    planned.goal,
    planned.meaning,
    contracted.subject,
    contracted.goal,
    contracted.meaning
  ].filter(Boolean).join(" "), 1800);
}

function scopedEraHumanViolation(args, evaluation, dateKey) {
  const clauses = splitHumanEraClauses(args?.human?.text || "");
  if (!clauses.length) return null;

  const rows = groupEraClauseRows(clauses, dateKey);
  const violating = rows.filter((row) => row.violation);
  if (!violating.length) return null;
  if (violating.length === rows.length) return violating[0].violation;

  const semantic = semanticScopeText(args, evaluation);
  const semanticViolation = semantic ? eraWorldViolation(semantic, dateKey) : null;
  if (semanticViolation && semanticViolation !== "empty") return semanticViolation;

  if (!eraTokens(semantic).length) return null;
  const scored = rows.map((row) => ({ ...row, score: overlapScore(semantic, row.clause) }));
  const maxScore = Math.max(...scored.map((row) => row.score));
  if (maxScore <= 0) return null;
  const winners = scored.filter((row) => row.score === maxScore);
  if (winners.length !== 1) return null;
  return winners[0].violation || null;
}

function eraIgnoranceClauses(value) {
  return clean(value, 1200)
    .replace(/[’]/g, "'")
    .split(/\s*(?:[;!?]+|,\s+|\.\s*)\s*|\s+(?:but|however|though|yet)\s+/i)
    .map((row) => clean(row, 400).replace(/^[,:;.!?\-]+|[,:;.!?\-]+$/g, "").trim())
    .filter(Boolean);
}

function periodCorrectIgnorance(value) {
  const clauses = eraIgnoranceClauses(value);
  return clauses.length > 0 && clauses.every((clause) => ERA_IGNORANCE_CLAUSE.test(clause));
}

function applyEraHumanBoundary(evaluation, args, surface) {
  const dateKey = clean(args?.eraDateKey, 16);
  if (!dateKey || !args?.human) return evaluation;
  if (!evaluation?.enforced) return evaluation;
  if (STRUCTURAL_FAILURE.test(evaluation.reason || "")) return evaluation;

  const humanViolation = scopedEraHumanViolation(args, evaluation, dateKey);
  if (!humanViolation) return evaluation;

  const responseViolation = eraWorldViolation(surface, dateKey);
  if (responseViolation && responseViolation !== "empty") {
    return {
      ...evaluation,
      ok: false,
      reason: "era-boundary-future-surface",
      evidence: {
        ...(evaluation.evidence || {}),
        review112EraHumanViolation: humanViolation,
        review112EraSurfaceViolation: responseViolation
      }
    };
  }

  if (periodCorrectIgnorance(surface)) {
    return {
      ...evaluation,
      ok: true,
      reason: "era-boundary-ignorance",
      evidence: {
        ...(evaluation.evidence || {}),
        review112EraHumanViolation: humanViolation,
        review112PeriodCorrectIgnorance: true
      }
    };
  }

  return {
    ...evaluation,
    ok: false,
    reason: "era-boundary-confident-answer",
    evidence: {
      ...(evaluation.evidence || {}),
      review112EraHumanViolation: humanViolation
    }
  };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const surface = args?.lines?.[0]?.text || "";
  const normalized = normalizeReview96to112Surface(surface);
  const baseArgs = { ...args, eraDateKey: "" };

  if (Array.isArray(args?.lines) && args.lines.length && normalized !== clean(surface)) {
    baseArgs.lines = [
      { ...(args.lines[0] || {}), text: normalized },
      ...args.lines.slice(1)
    ];
  }

  let evaluation = evaluateReview95Voice(baseArgs);
  if (normalized && normalized !== clean(surface) && evaluation?.enforced) {
    evaluation = {
      ...evaluation,
      evidence: {
        ...(evaluation.evidence || {}),
        review96to112NormalizedSurface: normalized
      }
    };
  }

  return applyEraHumanBoundary(evaluation, args, clean(surface));
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
