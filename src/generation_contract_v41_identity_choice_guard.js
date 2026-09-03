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
const ERA_IGNORANCE_CLAUSE = /^(?:(?:huh+|what|lol\s+what|uh+\s+what)|what(?:'s|\s+is|\s+are)?\s+(?:that|this|it)|what\s+do\s+you\s+mean(?:\s+by\s+(?:that|this|it))?|what\s+are\s+you\s+talking\s+about|(?:i(?:'ve|\s+have)?\s+)?never\s+heard(?:\s+of)?\s+(?:that|it)(?:\s+before)?|(?:i\s+)?(?:haven't|have\s+not)\s+heard\s+of\s+(?:that|it)|(?:i\s+)?have\s+never\s+heard\s+of\s+(?:that|it)|(?:i\s+)?(?:do\s+not|don't|dont)\s+know(?:\s+what\s+(?:that|it)\s+is)?|(?:i\s+)?(?:have\s+)?no\s+(?:idea|clue)(?:\s+what\s+(?:that|it)\s+is)?|beats\s+me|(?:(?:that|this|it)\s+)?(?:doesn't|does\s+not|doesnt)\s+ring\s+a\s+bell|are\s+you\s+(?:joking|kidding|making\s+that\s+up)|(?:that|it)\s+sounds\s+made\s+up|you\s+mean\s+(?:the\s+)?playstation|are\s+you\s+from\s+the\s+future|from\s+the\s+future)$/i;

function clean(value, max = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeInternalApostrophePossessives(value) {
  return value.replace(
    /\b(?:the\s+)?(?:(?:[a-z][a-z0-9-]*(?:'[a-z][a-z0-9-]*)+'(?:s)?)\s+)+(?:(?!(?:for|with|compatible|designed|made|built|intended|works?|used|on|of|at|by|to|from)\b)[a-z][a-z0-9-]*\s+)*(?=(?:playstation|ps)\s*\d+\b)/gi,
    "my "
  );
}

function normalizeSafeHeadCompoundModifiers(value) {
  return value.replace(
    /\b(console|system|unit|device|machine)\s+(?:well|hand|factory|mass|purpose|home|custom)(?:\s*-\s*|\s+)(designed|made|built|intended)\b/gi,
    "$1 $2"
  );
}

function normalizeReview96to100Surface(value) {
  let surface = clean(value).replace(/[’]/g, "'");
  surface = normalizeInternalApostrophePossessives(surface);
  surface = normalizeSafeHeadCompoundModifiers(surface);
  return clean(surface);
}

function splitHumanEraClauses(value) {
  return clean(value, 1800)
    .replace(/[’]/g, "'")
    .split(/\s*(?:[;!?]+|\.\s+)\s*|\s+(?:even\s+though|even\s+if|although|while|whereas|but|and)\s+/i)
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

  const rows = clauses.map((clause) => {
    const violation = eraWorldViolation(clause, dateKey);
    return {
      clause,
      violation: violation && violation !== "empty" ? violation : null
    };
  });
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
        review100EraHumanViolation: humanViolation,
        review100EraSurfaceViolation: responseViolation
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
        review100EraHumanViolation: humanViolation,
        review100PeriodCorrectIgnorance: true
      }
    };
  }

  return {
    ...evaluation,
    ok: false,
    reason: "era-boundary-confident-answer",
    evidence: {
      ...(evaluation.evidence || {}),
      review100EraHumanViolation: humanViolation
    }
  };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const surface = args?.lines?.[0]?.text || "";
  const normalized = normalizeReview96to100Surface(surface);
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
        review96to100NormalizedSurface: normalized
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
