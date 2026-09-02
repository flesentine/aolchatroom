import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateBaseVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_identity_choice_guard_base.js";

const CHOICE_AUX = "(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)";
const CHOICE_OR_QUESTION = new RegExp(`\\s*${CHOICE_AUX}\\b[^?]{0,180}\\s+or\\s+${CHOICE_AUX}\\b`, "i");
const AUX_OWNERSHIP_OBJECT = /\b(?:i|we|he|she|they)\s+(?:(?:do|does|did|really|actually|definitely|absolutely|certainly|personally|still|currently)\s+){0,4}(?:own|owns|owned)\s+([^,;.!?]+?)(?=\s*(?:[,;.!?]|$|\b(?:and|but|though|tho|or|plus)\b))/gi;
const DIRECT_OBJECT = /^(?:it|one|this|that|these|those|\d+)$/i;
const IDENTITY_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "own", "owns", "owned", "she", "some", "that", "the", "their", "them", "they",
  "this", "to", "u", "was", "we", "were", "will", "would", "yes", "yeah", "you", "your", "what", "which",
  "console", "consoles", "system", "systems", "unit", "units", "copy", "copies", "game", "games", "device", "devices", "machine", "machines"
]);
const IDENTITY_HARMLESS = new Set([
  "sony", "sega", "nintendo", "microsoft", "atari", "snk", "nec", "panasonic", "philips"
]);
const IDENTITY_VARIANT = new Set([
  "pro", "slim", "lite", "mini", "max", "plus", "oled", "digital", "disc", "elite", "classic", "xl", "ll", "x", "s"
]);
const REPEATED_SUBJECT_STOP = new Set([
  "how", "many", "much", "price", "cost", "costs", "costed", "worth", "pay", "paid", "number", "quantity", "count",
  "about", "around", "roughly", "approximately", "approx", "between"
]);
const HARD_PRICE_QUESTION = /\b(?:how much|price|cost|worth|pay|paid)\b/i;
const MONEY_EVIDENCE = /(?:[$£€¥]\s*\d+(?:\.\d{1,2})?)|\b\d+(?:\.\d{1,2})?\s*(?:bucks?|dollars?|usd)\b/i;
const ALT_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "she", "that", "the", "their", "them", "they", "this", "to", "u", "was", "we",
  "were", "will", "would", "yes", "yeah", "you", "your", "want", "wants", "wanted", "choose", "pick", "take", "prefer"
]);
const FORWARD_HARDWARE_PRICE_BRIDGE = /^(?:\s+|(?:consoles?|systems?|units?|devices?|machines?)\b\s*)?(?:(?:launch|retail|list|street|used|current|original|msrp)\b\s*)?(?:(?:price|cost)\b\s*)?(?:(?:is|was|were|cost|costs|costed|went\s+for|goes?\s+for|sells?\s+for|sold\s+for|priced\s+at|worth|:|-)\s*)?(?:(?:about|around|roughly|approximately|approx|nearly|almost|exactly|only|just|like)\b\s*)?$/i;
const REVERSE_HARDWARE_PRICE_BRIDGE = /^\s*(?:(?:for|of|on)\s+(?:the|a|an|my|your|his|her|their|our)?\s*)?$/i;

function clean(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonicalIdentityText(value) {
  return clean(value)
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
    canonicalIdentityText(value)
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

function containsAll(expected, actual) {
  for (const token of expected) if (!actual.has(token)) return false;
  return true;
}

function identityMatches(expectedTokens, actualTokens) {
  const expected = comparableIdentity(expectedTokens);
  const actual = comparableIdentity(actualTokens);
  if (!containsAll(expected, actual)) return false;
  for (const token of actual) {
    if (expected.has(token)) continue;
    if (/^\d+$/.test(token) || IDENTITY_VARIANT.has(token)) return false;
  }
  return true;
}

function requestedOwnershipIdentity(clause) {
  const match = canonicalIdentityText(clause).match(/\b(?:own|owns|owned)\s+(.+)$/i);
  if (!match) return new Set();
  const raw = clean(match[1], 120).replace(/^(?:a|an|the|some|any)\s+/i, "");
  if (DIRECT_OBJECT.test(raw)) return new Set();
  return identityTokens(raw);
}

function ownedObjectIdentity(rawObject) {
  const raw = clean(rawObject, 120);
  if (DIRECT_OBJECT.test(raw)) return { direct: true, tokens: new Set(), raw };
  const stripped = raw.replace(/^(?:a|an|the|some|any|no|one|two|three|four|five|six|seven|eight|nine|ten|this|that|these|those|\d+)\s+/i, "");
  return { direct: false, tokens: identityTokens(stripped), raw };
}

function responseClauses(value) {
  return clean(value)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function validateAuxiliaryOwnership(evaluation, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return evaluation;
  const ownership = (evaluation?.contract?.polarityObligations || []).filter((row) => row?.scope === "ownership");
  if (!ownership.length) return evaluation;

  const objects = [];
  const matcher = new RegExp(AUX_OWNERSHIP_OBJECT.source, "gi");
  let match;
  while ((match = matcher.exec(canonicalIdentityText(surface)))) objects.push(ownedObjectIdentity(match[1]));
  if (!objects.length || objects.some((row) => row.direct)) return evaluation;

  for (const obligation of ownership) {
    const expected = requestedOwnershipIdentity(obligation?.clause || "");
    if (!expected.size) continue;
    if (objects.some((row) => identityMatches(expected, row.tokens))) continue;
    return {
      ...evaluation,
      ok: false,
      reason: "missing-polarity",
      evidence: {
        ...(evaluation.evidence || {}),
        reviewGuardAuxiliaryOwnershipMismatch: objects.map((row) => row.raw)
      }
    };
  }
  return evaluation;
}

function repeatedModelSignature(clause) {
  const tokens = new Set([...comparableIdentity(identityTokens(clause))].filter((token) => !REPEATED_SUBJECT_STOP.has(token)));
  const discriminators = new Set([...tokens].filter((token) => /^\d+$/.test(token) || IDENTITY_VARIANT.has(token)));
  const family = new Set([...tokens].filter((token) => !discriminators.has(token)));
  return { discriminators, family };
}

function discriminatorKey(signature) {
  return [...signature.discriminators].sort().join("|");
}

function sharedFamily(signatures) {
  if (!signatures.length) return new Set();
  const [first, ...rest] = signatures;
  return new Set([...first.family].filter((token) => rest.every((row) => row.family.has(token))));
}

function tokenSpans(value) {
  const text = canonicalIdentityText(value).toLowerCase();
  const tokens = [];
  for (const match of text.matchAll(/\b[a-z0-9']+\b/g)) {
    tokens.push({ token: canonicalToken(match[0]), start: match.index, end: match.index + match[0].length });
  }
  return { text, tokens };
}

function modelSpans(value, family, discriminators) {
  const { text, tokens } = tokenSpans(value);
  const required = new Set([...family, ...discriminators]);
  const spans = [];
  for (let start = 0; start < tokens.length; start += 1) {
    if (!family.has(tokens[start].token)) continue;
    const seen = new Set();
    for (let end = start; end < Math.min(tokens.length, start + 8); end += 1) {
      if (required.has(tokens[end].token)) seen.add(tokens[end].token);
      if (seen.size === required.size) {
        spans.push({ start: tokens[start].start, end: tokens[end].end });
        break;
      }
    }
  }
  return { text, spans };
}

function priceEvidenceBoundToHardware(clause, family, discriminators) {
  const { text, spans } = modelSpans(clause, family, discriminators);
  const amounts = [...text.matchAll(new RegExp(MONEY_EVIDENCE.source, "gi"))]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
  for (const span of spans) {
    for (const amount of amounts) {
      if (span.end <= amount.start) {
        const between = text.slice(span.end, amount.start);
        if (between.length <= 52 && FORWARD_HARDWARE_PRICE_BRIDGE.test(between)) return true;
      } else if (amount.end <= span.start) {
        const between = text.slice(amount.end, span.start);
        if (between.length <= 48 && REVERSE_HARDWARE_PRICE_BRIDGE.test(between)) return true;
      }
    }
  }
  return false;
}

function validateHardwarePriceSubjects(evaluation, question, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return evaluation;
  const clauses = responseClauses(canonicalIdentityText(question)).filter((clause) => HARD_PRICE_QUESTION.test(clause));
  if (clauses.length < 2) return evaluation;
  const signatures = clauses.map(repeatedModelSignature).filter((row) => row.discriminators.size);
  if (signatures.length < 2) return evaluation;
  if (new Set(signatures.map(discriminatorKey)).size < 2) return evaluation;
  const family = sharedFamily(signatures);
  if (!family.size) return evaluation;

  const missing = signatures.filter((signature) => !responseClauses(canonicalIdentityText(surface))
    .some((clause) => priceEvidenceBoundToHardware(clause, family, signature.discriminators)));
  if (!missing.length) return evaluation;
  return {
    ...evaluation,
    ok: false,
    reason: "missing-price",
    evidence: {
      ...(evaluation.evidence || {}),
      reviewGuardHardwarePriceMismatch: missing.map(discriminatorKey)
    }
  };
}

function altTokens(value) {
  return new Set(
    canonicalIdentityText(value)
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

function choiceAlternativeTokens(question) {
  const source = canonicalIdentityText(question);
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
  return canonicalIdentityText(value)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clauseNegatesToken(clause, tokenValue) {
  const token = escapeRegex(tokenValue);
  const negative = "(?:not|no|never|without|don't|dont|didn't|didnt|wouldn't|wouldnt|won't|wont|can't|cant|cannot|avoid|avoiding|skip|skipping|exclude|excluding|reject|rejecting|rejected|refuse|refusing|decline|declining|rule\\s+out|pass\\s+on|stay\\s+away\\s+from)";
  const before = new RegExp(`\\b${negative}\\b[^,;.!?]{0,60}\\b${token}\\b`, "i");
  const after = new RegExp(`\\b${token}\\b[^,;.!?]{0,60}\\b${negative}\\b`, "i");
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
    new RegExp(`\\b${token}\\b\\s+(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|is\\s+my\\s+choice|would\\s+be\\s+(?:nice|good|great|fine|better)|for\\s+me|looks?\\s+better)\\b`, "i"),
    new RegExp(`\\b${token}\\b\\s+(?:is|was|would\\s+be)\\s+(?:what|the\\s+one|the\\s+thing)\\s+(?:i|we)\\s+(?:want|prefer|choose|pick|would\\s+like|'d\\s+like)\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(clause));
}

function strictChoiceSelection(question, surface) {
  const alternatives = choiceAlternativeTokens(question);
  if (!alternatives) return null;
  const text = canonicalIdentityText(surface).toLowerCase();
  if (/^\s*(?:neither|either|both|anything|whatever|no thanks|none(?: of them)?|i don't care|i dont care)\b/i.test(text)) return true;
  const clauses = choiceClauses(text);
  const leftPositive = [...alternatives.leftUnique].some((token) => clauses.some((clause) => clauseSelectsToken(clause, token)));
  const rightPositive = [...alternatives.rightUnique].some((token) => clauses.some((clause) => clauseSelectsToken(clause, token)));
  return leftPositive !== rightPositive;
}

function validateCanonicalStrictChoice(evaluation, question, surface) {
  const valid = strictChoiceSelection(question, surface);
  if (valid === null || !evaluation?.enforced) return evaluation;
  if (valid) {
    if (evaluation?.ok) return evaluation;
    if (evaluation?.reason !== "missing-choice-selection") return evaluation;
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), reviewGuardCanonicalSelectionRepaired: true }
    };
  }
  if (!evaluation?.ok) return evaluation;
  return {
    ...evaluation,
    ok: false,
    reason: "missing-choice-selection",
    evidence: { ...(evaluation.evidence || {}), reviewGuardCanonicalSelectionRejected: true }
  };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  let evaluation = evaluateBaseVoice(args);
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  evaluation = validateAuxiliaryOwnership(evaluation, surface);
  evaluation = validateHardwarePriceSubjects(evaluation, question, surface);
  evaluation = validateCanonicalStrictChoice(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
