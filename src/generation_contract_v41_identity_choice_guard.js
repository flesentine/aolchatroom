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
const HARD_QUANTITY_QUESTION = /\b(?:how many|number of|quantity|count of)\b/i;
const HARD_PRICE_QUESTION = /\b(?:how much|price|cost|worth|pay|paid)\b/i;
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
  if (value.endsWith("s") && value.length > 3 && !value.endsWith("ss")) return value.slice(0, -1);
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

function comparableIdentity(tokens) {
  return new Set([...tokens].filter((token) => !IDENTITY_HARMLESS.has(token)));
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
    if (objects.some((row) => identityMatches(expected, row.tokens))) continue;
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

function repeatedModelSignature(clause) {
  const tokens = new Set([...comparableIdentity(identityTokens(clause))].filter((token) => !REPEATED_SUBJECT_STOP.has(token)));
  const versions = new Set([...tokens].filter((token) => /^\d+$/.test(token)));
  const family = new Set([...tokens].filter((token) => !/^\d+$/.test(token) && !IDENTITY_VARIANT.has(token)));
  return { tokens, versions, family };
}

function sharedFamily(signatures) {
  if (!signatures.length) return new Set();
  const [first, ...rest] = signatures;
  return new Set([...first.family].filter((token) => rest.every((row) => row.family.has(token))));
}

function surfaceMentionsFamilyVersion(surface, family, version) {
  const text = clean(surface);
  for (const familyToken of family) {
    const familyRx = escapeRegex(familyToken);
    const versionRx = escapeRegex(version);
    if (new RegExp(`\\b${familyRx}\\b[^,;.!?]{0,32}\\b${versionRx}\\b`, "i").test(text)) return true;
    if (new RegExp(`\\b${versionRx}\\b[^,;.!?]{0,32}\\b${familyRx}\\b`, "i").test(text)) return true;
  }
  return false;
}

function rawRepeatedClauses(question, kind) {
  const matcher = kind === "quantity" ? HARD_QUANTITY_QUESTION : HARD_PRICE_QUESTION;
  return responseClauses(question).filter((clause) => matcher.test(clause));
}

function validateRepeatedModelSubjects(evaluation, question, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return evaluation;
  const repeated = evaluation?.contract?.repeatedHardObligations || {};
  for (const kind of ["quantity", "price"]) {
    const contractClauses = repeated[kind];
    const clauses = Array.isArray(contractClauses) && contractClauses.length >= 2
      ? contractClauses
      : rawRepeatedClauses(question, kind);
    if (clauses.length < 2) continue;
    const signatures = clauses.map(repeatedModelSignature);
    const versioned = signatures.filter((row) => row.versions.size);
    if (versioned.length < 2) continue;
    const distinctVersions = new Set(versioned.flatMap((row) => [...row.versions]));
    if (distinctVersions.size < 2) continue;
    const family = sharedFamily(versioned);
    if (!family.size) continue;
    const missing = [];
    for (const signature of versioned) {
      for (const version of signature.versions) {
        if (!surfaceMentionsFamilyVersion(surface, family, version)) missing.push(version);
      }
    }
    if (!missing.length) continue;
    return {
      ...evaluation,
      ok: false,
      reason: `missing-${kind}`,
      evidence: {
        ...(evaluation.evidence || {}),
        identityChoiceGuardRepeatedModelMismatch: { kind, missingVersions: [...new Set(missing)] }
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
    new RegExp(`\\b${token}\\b\\s+(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|is\\s+my\\s+choice|would\\s+be\\s+(?:nice|good|great|fine|better)|for\\s+me|looks?\\s+better)\\b`, "i"),
    new RegExp(`\\b${token}\\b\\s+(?:is|was|would\\s+be)\\s+(?:what|the\\s+one|the\\s+thing)\\s+(?:i|we)\\s+(?:want|prefer|choose|pick|would\\s+like|'d\\s+like)\\b`, "i")
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
  evaluation = validateRepeatedModelSubjects(evaluation, question, surface);
  evaluation = validateStrictChoice(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
