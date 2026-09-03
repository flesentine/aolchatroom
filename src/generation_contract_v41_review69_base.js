import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateReview64Voice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_review64_base.js";

const DIRECT_OBJECT = /^(?:it|one|this|that|these|those|\d+)$/i;
const STANDALONE_NEGATIVE = /^(?:no|nah|nope|not really|never|i don't|i dont|i do not)$/i;
const STANDALONE_POSITIVE = /^(?:yes|yeah|yep|yup|sure|definitely|absolutely|i do)$/i;
const OWN_ASSERTION = /\b(?:i|we|he|she|they)\s+(?:(?:do|does|did|really|actually|definitely|absolutely|certainly|personally|still|currently)\s+)*(?:(not|never)\s+)?(?:own|owns|owned)\s+(.+)$/i;
const MONEY = "(?:[$£€¥]\\s*\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?\\s*(?:bucks?|dollars?|usd)\\b)";
const SAFE_HARDWARE_TAIL = new Set(["console", "consoles", "system", "systems", "unit", "units", "device", "devices", "machine", "machines"]);
const IDENTITY_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "own", "owns", "owned", "she", "some", "that", "the", "their", "them", "they",
  "this", "to", "u", "was", "we", "were", "will", "would", "yes", "yeah", "you", "your", "what", "which",
  "console", "consoles", "system", "systems", "unit", "units", "copy", "copies", "game", "games", "device", "devices", "machine", "machines"
]);
const IDENTITY_HARMLESS = new Set(["sony", "sega", "nintendo", "microsoft", "atari", "snk", "nec", "panasonic", "philips"]);
const IDENTITY_VARIANT = new Set(["pro", "slim", "lite", "mini", "max", "plus", "oled", "digital", "disc", "elite", "classic", "xl", "ll", "x", "s"]);
const COMPLEMENT_NEGATION = /\b(?:not|no|never|without|don't|dont|didn't|didnt|wouldn't|wouldnt|won't|wont|can't|cant|cannot|avoid(?:ed|ing|s)?|skip(?:ped|ping|s)?|exclude(?:d|s|ing)?|reject(?:ed|s|ing)?|refus(?:e|ed|es|ing)|declin(?:e|ed|es|ing)|rule\s+out|pass\s+on|stay\s+away\s+from)\b/i;

function clean(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonicalText(value) {
  return clean(value)
    .replace(/[’]/g, "'")
    .replace(/\bdon't\b/gi, "do not")
    .replace(/\bdoesn't\b/gi, "does not")
    .replace(/\bdidn't\b/gi, "did not")
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
  return new Set(
    canonicalText(value)
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^'+|'+$/g, ""))
      .filter((token) => token && !IDENTITY_STOP.has(token))
      .map(canonicalToken)
  );
}

function comparableIdentity(tokens) {
  return new Set([...tokens].filter((token) => !IDENTITY_HARMLESS.has(token)));
}

function identityMatches(expectedTokens, actualTokens) {
  const expected = comparableIdentity(expectedTokens);
  const actual = comparableIdentity(actualTokens);
  if (!expected.size || !actual.size) return false;
  for (const token of expected) if (!actual.has(token)) return false;
  for (const token of actual) {
    if (expected.has(token)) continue;
    if (/^\d+$/.test(token) || IDENTITY_VARIANT.has(token)) return false;
  }
  return true;
}

function responseClauses(value) {
  return canonicalText(value)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function requestedOwnershipIdentity(clause) {
  const match = canonicalText(clause).match(/\b(?:own|owns|owned)\s+(.+)$/i);
  if (!match) return { direct: true, tokens: new Set() };
  const raw = clean(match[1], 120).replace(/^(?:a|an|the|some|any)\s+/i, "").replace(/[?]+$/, "");
  if (DIRECT_OBJECT.test(raw)) return { direct: true, tokens: new Set() };
  return { direct: false, tokens: identityTokens(raw) };
}

function responseOwnershipAssertion(clause) {
  const match = canonicalText(clause).match(OWN_ASSERTION);
  if (!match) return null;
  const raw = clean(match[2], 120).replace(/^(?:a|an|the|some|any|one|two|three|four|five|six|seven|eight|nine|ten|this|that|these|those|\d+)\s+/i, "");
  return {
    negative: Boolean(match[1]),
    direct: DIRECT_OBJECT.test(clean(match[2], 120)),
    tokens: identityTokens(raw),
    raw: clean(match[2], 120)
  };
}

function validateOwnershipPerObligation(evaluation, surface) {
  if (!evaluation?.enforced) return evaluation;
  const polarity = evaluation?.contract?.polarityObligations || [];
  const ownership = polarity.filter((row) => row?.scope === "ownership");
  if (!ownership.length) return evaluation;

  const clauses = responseClauses(surface);
  const assertions = clauses.map(responseOwnershipAssertion);
  const hasExplicitOwn = assertions.some(Boolean);
  if (!hasExplicitOwn && ownership.length < 2) return evaluation;

  const assigned = Array(ownership.length).fill(false);
  const firstPolarityIsOwnership = polarity[0]?.scope === "ownership";
  const laterExplicit = assertions.some(Boolean);

  clauses.forEach((clause, clauseIndex) => {
    if (clauseIndex === 0 && firstPolarityIsOwnership && STANDALONE_NEGATIVE.test(clause)) {
      const slot = assigned.findIndex((value) => !value);
      if (slot >= 0) assigned[slot] = true;
      return;
    }
    if (clauseIndex === 0 && firstPolarityIsOwnership && STANDALONE_POSITIVE.test(clause) && !laterExplicit) {
      const slot = assigned.findIndex((value) => !value);
      if (slot >= 0) assigned[slot] = true;
      return;
    }

    const assertion = assertions[clauseIndex];
    if (!assertion) return;
    if (assertion.direct) {
      const slot = assigned.findIndex((value) => !value);
      if (slot >= 0) assigned[slot] = true;
      return;
    }
    const slot = ownership.findIndex((obligation, index) => {
      if (assigned[index]) return false;
      const expected = requestedOwnershipIdentity(obligation?.clause || "");
      return !expected.direct && identityMatches(expected.tokens, assertion.tokens);
    });
    if (slot >= 0) assigned[slot] = true;
  });

  const complete = assigned.every(Boolean);
  if (!complete && evaluation?.ok) {
    return {
      ...evaluation,
      ok: false,
      reason: "missing-polarity",
      evidence: { ...(evaluation.evidence || {}), review65OwnershipAllocation: assigned }
    };
  }
  if (complete && !evaluation?.ok && evaluation?.reason === "missing-polarity" && polarity.every((row) => row?.scope === "ownership")) {
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), review65OwnershipAllocationRepaired: true }
    };
  }
  return evaluation;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(value) {
  return escapeRegex(canonicalText(value).toLowerCase().trim()).replace(/\\ /g, "\\s+");
}

function extractPriceModels(question) {
  return canonicalText(question)
    .split(/(?:[,;?]+|\band\b)/i)
    .map((clause) => clause.trim())
    .map((clause) => {
      const match = clause.match(/\b(?:how much did|how much does|how much do|what did|what does|what was|what is)\s+(?:the\s+)?(.+?)\s+(?:cost|costs|go\s+for|sell\s+for|worth)\b/i);
      return match ? clean(match[1], 100).replace(/^(?:a|an|the)\s+/i, "") : "";
    })
    .filter(Boolean);
}

function possessivePriceEvidence(surface, model) {
  const modelPattern = phraseRegex(model);
  const pattern = new RegExp(`\\b${modelPattern}(?:'s)\\s+(?:price|cost)\\s+(?:(?:is|was|were|costs?|=|:)\\s*)?${MONEY}`, "i");
  return responseClauses(surface).some((clause) => pattern.test(canonicalText(clause).toLowerCase()));
}

function safePriceEvidence(surface, model) {
  const modelPattern = phraseRegex(model);
  const forward = new RegExp(`\\b${modelPattern}(?:\\s+(?:console|system|unit|device|machine))?(?:'s)?\\s+(?:(?:price|cost)\\s+)?(?:is|was|were|costs?|cost|went\\s+for|goes?\\s+for|sells?\\s+for|sold\\s+for|priced\\s+at|worth|:|-)\\s*${MONEY}`, "i");
  const reverse = new RegExp(`${MONEY}\\s+(?:for|of|on)\\s+(?:the|a|an)?\\s*${modelPattern}(?:\\s+(?:console|system|unit|device|machine))?\\s*$`, "i");
  return responseClauses(surface).some((clause) => {
    const text = canonicalText(clause).toLowerCase();
    return forward.test(text) || reverse.test(text) || possessivePriceEvidence(text, model);
  });
}

function reversePeripheralEvidence(surface, model) {
  const modelPattern = phraseRegex(model);
  const reverse = new RegExp(`${MONEY}\\s+(?:for|of|on)\\s+(?:the|a|an)?\\s*${modelPattern}\\s+([a-z][a-z0-9'-]*)\\b`, "i");
  return responseClauses(surface).some((clause) => {
    const match = canonicalText(clause).toLowerCase().match(reverse);
    return Boolean(match && !SAFE_HARDWARE_TAIL.has(canonicalToken(match[1])));
  });
}

function validatePriceEdgeCases(evaluation, question, surface) {
  if (!evaluation?.enforced) return evaluation;
  const models = extractPriceModels(question);
  if (models.length < 2) return evaluation;

  const unsafe = models.filter((model) => reversePeripheralEvidence(surface, model) && !safePriceEvidence(surface, model));
  if (evaluation?.ok && unsafe.length) {
    return {
      ...evaluation,
      ok: false,
      reason: "missing-price",
      evidence: { ...(evaluation.evidence || {}), review65ReversePeripheralPrice: unsafe }
    };
  }

  const polarity = evaluation?.contract?.polarityObligations || [];
  const hasPossessive = models.some((model) => possessivePriceEvidence(surface, model));
  if (!evaluation?.ok && evaluation?.reason === "missing-price" && !polarity.length && hasPossessive && models.every((model) => safePriceEvidence(surface, model))) {
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), review65PossessivePriceRepaired: true }
    };
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
  if (!left || !right || left === right) return null;
  return { left, right };
}

function choiceClauses(surface) {
  return canonicalText(surface)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function alternativePattern(alternative) {
  const base = phraseRegex(alternative);
  return `(?:a|an|the)?\\s*${base}(?!\\s+(?:\\d+|pro|slim|lite|mini|max|plus|oled|digital|disc|elite|classic|xl|ll)\\b)`;
}

function clauseSelectsAlternative(clause, alternative) {
  const text = canonicalText(clause).toLowerCase();
  const alt = alternativePattern(alternative);
  if (!new RegExp(`\\b${alt}`, "i").test(text) || COMPLEMENT_NEGATION.test(text)) return false;
  const patterns = [
    new RegExp(`^\\s*(?:probably\\s+|definitely\\s+|maybe\\s+)?${alt}(?:\\s+please)?(?:\\s+thanks?)?\\s*$`, "i"),
    new RegExp(`\\b(?:i|we|he|she|they)\\s+(?:want|choose|pick|take|prefer)\\b[^,;.!?]{0,45}\\b${alt}`, "i"),
    new RegExp(`\\b(?:i(?:'d| would)\\s+(?:like|prefer|have|take|choose|pick)|i(?:'ll| will)\\s+(?:take|have|choose|pick)|give\\s+me|go\\s+with|let(?:'s|s)\\s+(?:do|go\\s+with))\\b[^,;.!?]{0,45}\\b${alt}`, "i"),
    new RegExp(`\\b(?:it(?:'s| is)|that(?:'s| is))\\s+${alt}`, "i"),
    new RegExp(`\\b${alt}\\s+(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|is\\s+my\\s+choice|would\\s+be\\s+(?:nice|good|great|fine|better)|for\\s+me|looks?\\s+better)\\b`, "i"),
    new RegExp(`\\b${alt}\\s+(?:is|was|would\\s+be)\\s+(?:what|the\\s+one|the\\s+thing)\\s+(?:i|we)\\s+(?:want|prefer|choose|pick|would\\s+like|'d\\s+like)\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function strictChoiceSelection(question, surface) {
  const alternatives = choiceAlternatives(question);
  if (!alternatives) return null;
  const text = canonicalText(surface).toLowerCase();
  if (/^\s*(?:neither|either|both|anything|whatever|no thanks|none(?: of them)?|i don't care|i dont care)\b/i.test(text)) return true;
  const clauses = choiceClauses(text);
  const left = clauses.some((clause) => clauseSelectsAlternative(clause, alternatives.left));
  const right = clauses.some((clause) => clauseSelectsAlternative(clause, alternatives.right));
  return left !== right;
}

function validateCompleteChoiceIdentity(evaluation, question, surface) {
  if (!evaluation?.enforced) return evaluation;
  const valid = strictChoiceSelection(question, surface);
  if (valid === null) return evaluation;
  if (valid) {
    if (evaluation?.ok) return evaluation;
    if (evaluation?.reason !== "missing-choice-selection") return evaluation;
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), review65CompleteChoiceRepaired: true }
    };
  }
  if (!evaluation?.ok) return evaluation;
  return {
    ...evaluation,
    ok: false,
    reason: "missing-choice-selection",
    evidence: { ...(evaluation.evidence || {}), review65CompleteChoiceRejected: true }
  };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  let evaluation = evaluateReview64Voice(args);
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  evaluation = validateOwnershipPerObligation(evaluation, surface);
  evaluation = validatePriceEdgeCases(evaluation, question, surface);
  evaluation = validateCompleteChoiceIdentity(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
