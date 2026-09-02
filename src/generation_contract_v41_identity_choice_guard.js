import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateFinalGuardVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_final_guard.js";

const CHOICE_AUX = "(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)";
const CHOICE_OR_QUESTION = new RegExp(`\\s*${CHOICE_AUX}\\b[^?]{0,180}\\s+or\\s+${CHOICE_AUX}\\b`, "i");
const EXPLICIT_OWNERSHIP_OBJECT = /\b(?:i|we|he|she|they)\s+(?:own|owns|owned)\s+([^,;.!?]+?)(?=\s*(?:[,;.!?]|$|\b(?:and|but|though|tho|or|plus)\b))/gi;
const DIRECT_OBJECT = /^(?:it|one|this|that|these|those|\d+)$/i;
const STANDALONE_POLARITY = /^\s*(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|maybe|probably|i do|i don't|i dont|i did|i didn't|i didnt|i have|i haven't|i havent|i am|i'm|i was|i wasn't|i wasnt|i will|i won't|i wont)\s*$/i;
const IDENTITY_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "own", "owns", "owned", "she", "some", "that", "the", "their", "them", "they",
  "this", "to", "u", "was", "we", "were", "will", "would", "yes", "yeah", "you", "your", "what", "which",
  "console", "consoles", "system", "systems", "unit", "units", "copy", "copies", "game", "games", "device", "devices", "machine", "machines"
]);
const ALT_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "she", "that", "the", "their", "them", "they", "this", "to", "u", "was", "we",
  "were", "will", "would", "yes", "yeah", "you", "your", "want", "wants", "wanted", "choose", "pick", "take", "prefer"
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

function identityTokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^'+|'+$/g, ""))
      .filter((token) => token && !IDENTITY_STOP.has(token))
      .map(canonicalToken)
  );
}

function altTokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^'+|'+$/g, ""))
      .filter((token) => token.length >= 2 && !ALT_STOP.has(token))
      .map(canonicalToken)
  );
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

function requestedOwnershipIdentity(clause) {
  const match = clean(clause).match(/\b(?:own|owns|owned)\s+(.+)$/i);
  if (!match) return new Set();
  let raw = clean(match[1], 120).replace(/^(?:a|an|the|some|any)\s+/i, "");
  if (DIRECT_OBJECT.test(raw)) return new Set();
  return identityTokens(raw);
}

function ownedObjectIdentity(rawObject) {
  const raw = clean(rawObject, 120);
  if (DIRECT_OBJECT.test(raw)) return { direct: true, tokens: new Set(), raw };
  const stripped = raw.replace(/^(?:a|an|the|some|any|no|one|two|three|four|five|six|seven|eight|nine|ten|this|that|these|those|\d+)\s+/i, "");
  return { direct: false, tokens: identityTokens(stripped), raw };
}

function containsAll(expected, actual) {
  for (const token of expected) if (!actual.has(token)) return false;
  return true;
}

function validateModelIdentity(evaluation, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return evaluation;
  const allPolarity = evaluation?.contract?.polarityObligations || [];
  const ownershipIndexes = allPolarity
    .map((row, index) => row?.scope === "ownership" ? index : -1)
    .filter((index) => index >= 0);
  if (!ownershipIndexes.length) return evaluation;

  const clauses = responseClauses(surface);
  if (ownershipIndexes[0] === 0 && STANDALONE_POLARITY.test(clauses[0] || "")) return evaluation;

  const objects = [];
  const matcher = new RegExp(EXPLICIT_OWNERSHIP_OBJECT.source, "gi");
  let match;
  while ((match = matcher.exec(clean(surface)))) objects.push(ownedObjectIdentity(match[1]));
  if (!objects.length || objects.some((row) => row.direct)) return evaluation;

  for (const index of ownershipIndexes) {
    const expected = requestedOwnershipIdentity(allPolarity[index]?.clause || "");
    if (!expected.size) continue;
    if (objects.some((row) => containsAll(expected, row.tokens))) continue;
    return {
      ...evaluation,
      ok: false,
      reason: "missing-polarity",
      evidence: {
        ...(evaluation.evidence || {}),
        identityChoiceGuardOwnershipMismatch: objects.map((row) => row.raw)
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
  const left = altTokens(parts[0]);
  const right = altTokens(parts[1]);
  const leftUnique = new Set([...left].filter((token) => !right.has(token)));
  const rightUnique = new Set([...right].filter((token) => !left.has(token)));
  if (!leftUnique.size || !rightUnique.size) return null;
  return { leftUnique, rightUnique };
}

function choiceClauses(value) {
  return clean(value)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clauseNegatesToken(clause, tokenValue) {
  const token = escapeRegex(tokenValue);
  const before = new RegExp(`\\b(?:not|no|never|without|don't|dont|didn't|didnt|wouldn't|wouldnt|won't|wont|can't|cant|cannot)\\b[^,;.!?]{0,60}\\b${token}\\b`, "i");
  const after = new RegExp(`\\b${token}\\b[^,;.!?]{0,30}\\b(?:not|no|never)\\b`, "i");
  return before.test(clause) || after.test(clause);
}

function clauseSelectsToken(clause, tokenValue) {
  const token = escapeRegex(tokenValue);
  if (!new RegExp(`\\b${token}\\b`, "i").test(clause) || clauseNegatesToken(clause, tokenValue)) return false;
  const patterns = [
    new RegExp(`^\\s*(?:probably\\s+|definitely\\s+|maybe\\s+)?${token}(?:\\s+please)?(?:\\s+thanks?)?\\s*$`, "i"),
    new RegExp(`\\b(?:i|we|he|she|they)\\s+(?:want|choose|pick|take|prefer)\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:i(?:'d| would)\\s+(?:like|prefer|have|take|choose|pick)|i(?:'ll| will)\\s+(?:take|have|choose|pick)|give\\s+me|go\\s+with|let(?:'s|s)\\s+(?:do|go\\s+with))\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:it(?:'s| is)|that(?:'s| is))\\s+${token}\\b`, "i"),
    new RegExp(`\\b${token}\\b\\s+(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|is\\s+my\\s+choice|would\\s+be\\s+(?:nice|good|great|fine|better)|for\\s+me|looks?\\s+better)\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(clause));
}

function strictChoiceSelection(question, surface) {
  const alternatives = choiceAlternativeTokens(question);
  if (!alternatives) return null;
  const text = clean(surface).toLowerCase();
  if (/^\s*(?:neither|either|both|anything|whatever|no thanks|none(?: of them)?|i don't care|i dont care)\b/i.test(text)) return true;
  const clauses = choiceClauses(text);
  const leftPositive = [...alternatives.leftUnique].some((token) => clauses.some((clause) => clauseSelectsToken(clause, token)));
  const rightPositive = [...alternatives.rightUnique].some((token) => clauses.some((clause) => clauseSelectsToken(clause, token)));
  return leftPositive !== rightPositive;
}

function validateStrictChoice(evaluation, question, surface) {
  const valid = strictChoiceSelection(question, surface);
  if (valid === null || !evaluation?.enforced) return evaluation;
  if (valid) {
    if (evaluation?.ok) return evaluation;
    if (evaluation?.reason !== "missing-choice-selection") return evaluation;
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), identityChoiceGuardSelectionRepaired: true }
    };
  }
  if (!evaluation?.ok) return evaluation;
  return {
    ...evaluation,
    ok: false,
    reason: "missing-choice-selection",
    evidence: { ...(evaluation.evidence || {}), identityChoiceGuardSelectionRejected: true }
  };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  let evaluation = evaluateFinalGuardVoice(args);
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  evaluation = validateModelIdentity(evaluation, surface);
  evaluation = validateStrictChoice(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
