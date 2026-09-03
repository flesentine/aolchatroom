import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateReview69Voice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_review69_base.js";

const DIRECT_OBJECT = /^(?:it|one|this|that|these|those|\d+)$/i;
const STANDALONE_NEGATIVE = /^(?:no|nah|nope|not really|never|i don't|i dont|i do not)$/i;
const STANDALONE_POLARITY = /^(?:no|nah|nope|not really|never|i don't|i dont|i do not|yes|yeah|yep|yup|sure|definitely|absolutely|i do)$/i;
const OWN_ASSERTION = /\b(?:i|we|he|she|they)\s+(?:(?:do|does|did|really|actually|definitely|absolutely|certainly|personally|still|currently)\s+)*(?:(not|never|no\s+longer)\s+)?(?:own|owns|owned)\s+(.+)$/i;
const HAVE_ASSERTION = /\b(?:i|we|he|she|they)\s+(?:(not|never|no\s+longer|do\s+not|does\s+not|did\s+not)\s+)?(?:have|has|had|got)\s+(.+)$/i;
const MONEY = "(?:[$£€¥]\\s*\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?\\s*(?:bucks?|dollars?|usd)\\b)";
const SAFE_HARDWARE = new Set(["console", "system", "unit", "device", "machine"]);
const HARMLESS_IDENTITY = new Set(["sony", "sega", "nintendo", "microsoft", "atari", "snk", "nec", "panasonic", "philips"]);
const IDENTITY_VARIANT = new Set(["pro", "slim", "lite", "mini", "max", "plus", "oled", "digital", "disc", "elite", "classic", "xl", "ll", "x", "s"]);
const IDENTITY_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "own", "owns", "owned", "she", "some", "that", "the", "their", "them", "they",
  "this", "to", "u", "was", "we", "were", "will", "would", "yes", "yeah", "you", "your", "what", "which",
  "console", "consoles", "system", "systems", "unit", "units", "device", "devices", "machine", "machines"
]);

function clean(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonicalText(value) {
  return clean(value)
    .replace(/[’]/g, "'")
    .replace(/\bdon't\b/gi, "do not")
    .replace(/\bdont\b/gi, "do not")
    .replace(/\bdoesn't\b/gi, "does not")
    .replace(/\bdoesnt\b/gi, "does not")
    .replace(/\bdidn't\b/gi, "did not")
    .replace(/\bdidnt\b/gi, "did not")
    .replace(/\bps\s*([0-9]+)\b/gi, "playstation $1")
    .replace(/\bplaystation\s*([0-9]+)\b/gi, "playstation $1");
}

function canonicalToken(token) {
  const value = String(token || "").toLowerCase();
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && value.length > 3 && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function identityTokens(value) {
  return new Set(canonicalText(value).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token && !IDENTITY_STOP.has(token))
    .map(canonicalToken));
}

function comparable(tokens) {
  return new Set([...tokens].filter((token) => !HARMLESS_IDENTITY.has(token)));
}

function identityMatches(expectedTokens, actualTokens) {
  const expected = comparable(expectedTokens);
  const actual = comparable(actualTokens);
  if (!expected.size || !actual.size) return false;
  if (expected.size !== actual.size) return false;
  for (const token of expected) if (!actual.has(token)) return false;
  return true;
}

function responseClauses(value) {
  return canonicalText(value).split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim()).filter(Boolean);
}

function requestedOwnershipIdentity(clause) {
  const text = canonicalText(clause).replace(/[?]+$/, "");
  let match = text.match(/\b(?:own|owns|owned)\s+(.+)$/i);
  if (!match) match = text.match(/\b(?:do|does|did)\s+(?:you|u|he|she|they|we|i)\s+have\s+(.+)$/i);
  if (!match) match = text.match(/\b(?:have|has|had)\s+(?:you|u|he|she|they|we|i)\s+(?:got\s+)?(.+)$/i);
  if (!match) return { direct: true, tokens: new Set() };
  const raw = clean(match[1], 140).replace(/^(?:a|an|the|some|any)\s+/i, "");
  return DIRECT_OBJECT.test(raw) ? { direct: true, tokens: new Set() } : { direct: false, tokens: identityTokens(raw) };
}

function responseOwnershipAssertion(clause) {
  const text = canonicalText(clause);
  let match = text.match(OWN_ASSERTION);
  let form = "own";
  if (!match) {
    match = text.match(HAVE_ASSERTION);
    form = "have";
  }
  if (!match) return null;
  const raw = clean(match[2], 140);
  if (form === "have" && /^to\b/i.test(raw)) return null;
  const direct = DIRECT_OBJECT.test(raw);
  const stripped = raw.replace(/^(?:a|an|the|some|any|no|one|two|three|four|five|six|seven|eight|nine|ten|this|that|these|those|\d+)\s+/i, "");
  const tokens = identityTokens(stripped);
  if (!direct && !tokens.size) return null;
  return { direct, tokens, raw, form };
}

function validateOwnership(evaluation, surface) {
  if (!evaluation?.enforced) return evaluation;
  const polarity = evaluation?.contract?.polarityObligations || [];
  const ownership = polarity.filter((row) => row?.scope === "ownership");
  if (!ownership.length) return evaluation;
  const clauses = responseClauses(surface);
  const assertions = clauses.map(responseOwnershipAssertion);

  if (ownership.length === 1) {
    if (!assertions.some(Boolean)) return evaluation;
    const leadingDenial = polarity[0]?.scope === "ownership" && STANDALONE_NEGATIVE.test(clauses[0] || "");
    if (leadingDenial) return evaluation;
    const expected = requestedOwnershipIdentity(ownership[0]?.clause || "");
    if (!expected.direct) {
      const matched = assertions.filter(Boolean).some((row) => row.direct || identityMatches(expected.tokens, row.tokens));
      if (!matched && evaluation?.ok) return { ...evaluation, ok: false, reason: "missing-polarity", evidence: { ...(evaluation.evidence || {}), review70OwnershipMismatch: assertions.filter(Boolean).map((row) => row.raw) } };
    }
    return evaluation;
  }

  if (polarity.length !== ownership.length) return evaluation;
  const assigned = Array(ownership.length).fill(false);
  clauses.forEach((clause, clauseIndex) => {
    const assertion = assertions[clauseIndex];
    if (assertion) {
      if (assertion.direct) {
        const slot = assigned.findIndex((value) => !value);
        if (slot >= 0) assigned[slot] = true;
        return;
      }
      const slot = ownership.findIndex((obligation, index) => {
        if (assigned[index]) return false;
        const expected = requestedOwnershipIdentity(obligation?.clause || "");
        if (expected.direct) return assertion.form === "own";
        return identityMatches(expected.tokens, assertion.tokens);
      });
      if (slot >= 0) assigned[slot] = true;
      return;
    }
    if (STANDALONE_POLARITY.test(clause)) {
      const slot = assigned.findIndex((value) => !value);
      if (slot >= 0) assigned[slot] = true;
    }
  });
  const complete = assigned.every(Boolean);
  if (!complete && evaluation?.ok) return { ...evaluation, ok: false, reason: "missing-polarity", evidence: { ...(evaluation.evidence || {}), review70OwnershipAllocation: assigned } };
  if (complete && !evaluation?.ok && evaluation?.reason === "missing-polarity") return { ...evaluation, ok: true, reason: "recognized-obligations-covered", evidence: { ...(evaluation.evidence || {}), review70OwnershipAllocationRepaired: true } };
  return evaluation;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function phraseRegex(value) {
  return escapeRegex(canonicalText(value).toLowerCase().trim()).replace(/\\ /g, "\\s+");
}
function extractPriceModels(question) {
  return canonicalText(question).split(/(?:[,;?]+|\band\b)/i).map((clause) => clause.trim()).map((clause) => {
    const match = clause.match(/\b(?:how much did|how much does|how much do|what did|what does|what was|what is)\s+(?:the\s+)?(.+?)\s+(?:cost|costs|go\s+for|sell\s+for|worth)\b/i);
    return match ? clean(match[1], 100).replace(/^(?:a|an|the)\s+/i, "") : "";
  }).filter(Boolean);
}
function possessiveHardwarePrice(surface, model) {
  const modelPattern = phraseRegex(model);
  const pattern = new RegExp(`\\b${modelPattern}(?:\\s+(?:console|system|unit|device|machine))?'s\\s+(?:price|cost)\\s+(?:(?:is|was|were|costs?|=|:)\\s*)?${MONEY}`, "i");
  return responseClauses(surface).some((clause) => pattern.test(canonicalText(clause).toLowerCase()));
}
function tailTokens(value) {
  return clean(value || "").split(/\s+/).filter(Boolean)
    .map((token) => canonicalToken(token.replace(/'s$/i, "")));
}
function unsafeReverseTail(surface, model) {
  const modelPattern = phraseRegex(model);
  const pattern = new RegExp(`${MONEY}\\s+(?:for|of|on)\\s+(?:the|a|an)?\\s*${modelPattern}(?<tail>(?:\\s+[a-z][a-z0-9'-]*)*)\\s*$`, "i");
  return responseClauses(surface).some((clause) => {
    const match = canonicalText(clause).toLowerCase().match(pattern);
    if (!match) return false;
    return tailTokens(match.groups?.tail).some((token) => !SAFE_HARDWARE.has(token));
  });
}
function unsafeForwardTail(surface, model) {
  const modelPattern = phraseRegex(model);
  const pattern = new RegExp(`\\b${modelPattern}(?<tail>(?:\\s+[a-z][a-z0-9'-]*)*)\\s+(?:(?:price|cost)\\s+)?(?:is|was|were|costs?|cost|went\\s+for|goes?\\s+for|sells?\\s+for|sold\\s+for|priced\\s+at|worth|:|-)\\s*${MONEY}`, "i");
  return responseClauses(surface).some((clause) => {
    const match = canonicalText(clause).toLowerCase().match(pattern);
    if (!match) return false;
    return tailTokens(match.groups?.tail).some((token) => !SAFE_HARDWARE.has(token));
  });
}
function validatePrice(evaluation, question, surface) {
  if (!evaluation?.enforced) return evaluation;
  const models = extractPriceModels(question);
  if (!models.length) return evaluation;
  const unsafe = models.filter((model) => unsafeReverseTail(surface, model) || unsafeForwardTail(surface, model));
  if (evaluation?.ok && unsafe.length) return { ...evaluation, ok: false, reason: "missing-price", evidence: { ...(evaluation.evidence || {}), review70UnsafePriceBinding: unsafe } };
  if (!evaluation?.ok && evaluation?.reason === "missing-price" && !(evaluation?.contract?.polarityObligations || []).length && models.every((model) => possessiveHardwarePrice(surface, model))) {
    return { ...evaluation, ok: true, reason: "recognized-obligations-covered", evidence: { ...(evaluation.evidence || {}), review70HardwarePossessivePriceRepaired: true } };
  }
  return evaluation;
}

function extractChoiceAlternative(part) {
  let text = canonicalText(part).toLowerCase().replace(/[?]+$/, "").trim();
  const selector = text.match(/\b(?:want|prefer|choose|pick|take|like)\b\s+(.+)$/i);
  if (selector) text = selector[1];
  else {
    const predicate = text.match(/^(?:is|are|was|were)\s+(?:it|this|that|they|these|those)\s+(.+)$/i);
    if (!predicate) return "";
    text = predicate[1];
  }
  return text.replace(/^(?:a|an|the)\s+/i, "").trim();
}
function choiceAlternatives(question) {
  const parts = canonicalText(question).split(/\s+or\s+/i);
  if (parts.length !== 2) return null;
  const left = extractChoiceAlternative(parts[0]);
  const right = extractChoiceAlternative(parts[1]);
  return left && right && left !== right ? [left, right] : null;
}
function selectedObject(clause) {
  const text = canonicalText(clause).toLowerCase().trim();
  let match = text.match(/\bi(?:'d| would)\s+(?:like|prefer|have|take|choose|pick)\s+(.+)$/i)
    || text.match(/\b(?:i|we|he|she|they)\s+(?:want|choose|pick|take|prefer)\s+(.+)$/i)
    || text.match(/\b(?:give\s+me|go\s+with)\s+(.+)$/i);
  if (match) return clean(match[1], 160).replace(/\s+(?:please|thanks?)$/i, "");
  if (/^(?:probably\s+|definitely\s+|maybe\s+)?[a-z0-9]/i.test(text) && !/\b(?:i|we|he|she|they)\b/i.test(text)) return text.replace(/\s+(?:please|thanks?)$/i, "");
  return "";
}
function choiceIdentityExact(expected, actual) {
  const expectedTokens = comparable(identityTokens(expected));
  const actualTokens = comparable(identityTokens(actual));
  if (!expectedTokens.size || !actualTokens.size) return false;
  for (const token of expectedTokens) if (!actualTokens.has(token)) return false;
  for (const token of actualTokens) {
    if (expectedTokens.has(token) || SAFE_HARDWARE.has(token)) continue;
    return false;
  }
  return true;
}
function validateChoiceExtensions(evaluation, question, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return evaluation;
  const alternatives = choiceAlternatives(question);
  if (!alternatives) return evaluation;
  const modelLike = alternatives.some((alt) => [...comparable(identityTokens(alt))].some((token) => /^\d+$/.test(token) || IDENTITY_VARIANT.has(token)));
  if (!modelLike) return evaluation;
  const objects = responseClauses(surface).map(selectedObject).filter(Boolean);
  if (!objects.length) return evaluation;
  if (objects.some((object) => alternatives.some((alt) => choiceIdentityExact(alt, object)))) return evaluation;
  const overlaps = objects.some((object) => {
    const actual = comparable(identityTokens(object));
    return alternatives.some((alt) => [...comparable(identityTokens(alt))].some((token) => actual.has(token)));
  });
  if (!overlaps) return evaluation;
  return { ...evaluation, ok: false, reason: "missing-choice-selection", evidence: { ...(evaluation.evidence || {}), review70ChoiceExtensionRejected: objects } };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  let evaluation = evaluateReview69Voice(args);
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  evaluation = validateOwnership(evaluation, surface);
  evaluation = validatePrice(evaluation, question, surface);
  evaluation = validateChoiceExtensions(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};