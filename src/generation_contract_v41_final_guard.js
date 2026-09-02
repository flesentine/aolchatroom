import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateFinalVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_final.js";

const CHOICE_AUX = "(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)";
const CHOICE_OR_QUESTION = new RegExp(`^\\s*${CHOICE_AUX}\\b[^?]{0,180}\\s+or\\s+${CHOICE_AUX}\\b`, "i");
const NEGATIVE_STANDALONE = /^\s*(?:no|nah|nope|never|not really|i don't|i dont|i didn't|i didnt|i haven't|i havent|i won't|i wont)\s*$/i;
const EXPLICIT_OWNERSHIP_OBJECT = /\b(?:i|we|he|she|they)\s+(?:own|owns|owned)\s+([^,;.!?]+?)(?=\s*(?:[,;.!?]|$|\b(?:and|but|though|tho|or|plus)\b))/gi;
const DIRECT_OBJECT = /^(?:it|one|this|that|these|those|\d+)$/i;
const CONTENT_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "she", "that", "the", "their", "them", "they", "this", "to", "u", "was", "we",
  "were", "will", "would", "yes", "yeah", "you", "your"
]);
const SUBJECT_STOP = new Set([
  "what", "how", "much", "many", "price", "cost", "costs", "costed", "worth", "pay", "paid", "number", "quantity", "count",
  "own", "owns", "owned", "go", "goes", "went", "about", "around", "roughly", "approximately", "approx", "maybe", "probably", "between",
  "buck", "bucks", "dollar", "dollars", "usd", "hundred", "thousand", "grand"
]);

function clean(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonicalToken(token) {
  const value = String(token || "").toLowerCase();
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && value.length > 4 && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function contentTokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^'+|'+$/g, ""))
      .filter((token) => token.length >= 3 && !CONTENT_STOP.has(token))
      .map(canonicalToken)
  );
}

function subjectTokens(value) {
  return new Set([...contentTokens(value)].filter((token) => !SUBJECT_STOP.has(token) && !/^\d/.test(token)));
}

function overlaps(a, b) {
  for (const token of a) if (b.has(token)) return true;
  return false;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function responseClauses(value) {
  return clean(value)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function validateExplicitOwnershipObjects(evaluation, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return evaluation;
  const obligations = (evaluation?.contract?.polarityObligations || []).filter((row) => row?.scope === "ownership");
  if (!obligations.length) return evaluation;
  if (responseClauses(surface).some((part) => NEGATIVE_STANDALONE.test(part))) return evaluation;

  const objects = [];
  const matcher = new RegExp(EXPLICIT_OWNERSHIP_OBJECT.source, "gi");
  let match;
  while ((match = matcher.exec(clean(surface)))) {
    const rawObject = clean(match[1], 120);
    if (DIRECT_OBJECT.test(rawObject)) {
      objects.push({ direct: true, tokens: new Set(), raw: rawObject });
      continue;
    }
    const tokens = subjectTokens(rawObject);
    if (tokens.size) objects.push({ direct: false, tokens, raw: rawObject });
  }
  if (!objects.length || objects.some((row) => row.direct)) return evaluation;

  for (const obligation of obligations) {
    const expected = subjectTokens(obligation?.clause || "");
    if (!expected.size) continue;
    if (objects.some((row) => overlaps(row.tokens, expected))) continue;
    return {
      ...evaluation,
      ok: false,
      reason: "missing-polarity",
      evidence: {
        ...(evaluation.evidence || {}),
        finalGuardOwnershipObjectMismatch: objects.map((row) => row.raw)
      }
    };
  }
  return evaluation;
}

function choiceAlternativeTokens(question) {
  const source = clean(question);
  if (!CHOICE_OR_QUESTION.test(source)) return null;
  const parts = source.split(/\s+or\s+/i);
  if (parts.length !== 2) return null;
  const left = contentTokens(parts[0]);
  const right = contentTokens(parts[1]);
  const leftUnique = new Set([...left].filter((token) => !right.has(token)));
  const rightUnique = new Set([...right].filter((token) => !left.has(token)));
  if (!leftUnique.size || !rightUnique.size) return null;
  return { leftUnique, rightUnique };
}

function tokenPositiveSelection(text, tokenValue) {
  const token = escapeRegex(tokenValue);
  const patterns = [
    new RegExp(`^\\s*(?:probably\\s+|definitely\\s+|maybe\\s+)?${token}(?:\\s*,?\\s*please)?(?:\\s*,?\\s*thanks?)?[.!]?\\s*$`, "i"),
    new RegExp(`\\b(?:i|we|he|she|they)\\s+(?:want|choose|pick|take|prefer)\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:i(?:'d| would)\\s+(?:like|prefer)|i(?:'ll| will)\\s+(?:take|have|choose|pick)|give\\s+me|go\\s+with|let(?:'s|s)\\s+(?:do|go\\s+with))\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:it(?:'s| is)|that(?:'s| is))\\s+${token}\\b`, "i"),
    new RegExp(`\\b${token}\\b\\s*(?:,\\s*)?(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|for\\s+me|looks?\\s+better)\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function robustChoiceSelection(question, surface) {
  const alternatives = choiceAlternativeTokens(question);
  if (!alternatives) return null;
  const text = clean(surface).toLowerCase();
  if (/^\s*(?:neither|either|both|anything|whatever|no thanks|none(?: of them)?|i don't care|i dont care)\b/i.test(text)) return true;

  const leftPositive = [...alternatives.leftUnique].some((token) => tokenPositiveSelection(text, token));
  const rightPositive = [...alternatives.rightUnique].some((token) => tokenPositiveSelection(text, token));
  if (leftPositive !== rightPositive) return true;
  return false;
}

function validateChoiceSelection(evaluation, question, surface) {
  const valid = robustChoiceSelection(question, surface);
  if (valid === null || !evaluation?.enforced) return evaluation;
  if (valid) {
    if (evaluation?.ok) return evaluation;
    if (evaluation?.reason !== "missing-choice-selection") return evaluation;
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), finalGuardChoiceSelectionRepaired: true }
    };
  }
  if (!evaluation?.ok && evaluation?.reason === "missing-choice-selection") return evaluation;
  if (!evaluation?.ok) return evaluation;
  return {
    ...evaluation,
    ok: false,
    reason: "missing-choice-selection",
    evidence: { ...(evaluation.evidence || {}), finalGuardChoiceSelectionRejected: true }
  };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  let evaluation = evaluateFinalVoice(args);
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  evaluation = validateExplicitOwnershipObjects(evaluation, surface);
  evaluation = validateChoiceSelection(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
