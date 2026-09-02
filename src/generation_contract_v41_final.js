import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateHardenedVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_hardened.js";

const CHOICE_AUX = "(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)";
const CHOICE_OR_QUESTION = new RegExp(`^\\s*${CHOICE_AUX}\\b[^?]{0,180}\\s+or\\s+${CHOICE_AUX}\\b`, "i");
const STANDALONE_POLARITY = /^\s*(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|maybe|probably|i do|i don't|i dont|i did|i didn't|i didnt|i have|i am|i'm|i was|i wasn't|i wasnt|i will|i won't|i wont)\s*$/i;
const DIRECT_OWNERSHIP = /\b(?:i|we|he|she|they)\s+(?:own|owns|owned)\s+(?:it|one|this|that|these|those|\d+)\b/i;
const NAMED_OWNERSHIP = /\b(?:i|we|he|she|they)\s+(?:own|owns|owned)\s+(?:(?:a|an|the|some|any|no|\d+)\s+)?([a-z0-9'-]+(?:\s+[a-z0-9'-]+){0,2}?)(?=\s*(?:[,;.!?]|$|\b(?:and|but|though|tho|or|plus)\b))/gi;
const MONEY = /(?:[$£€¥]\s*\d+(?:\.\d{1,2})?)|\b\d+(?:\.\d{1,2})?\s*(?:bucks?|dollars?|usd)\b/gi;
const QUANTITY_UNIT = /\b\d+(?:\.\d+)?\s+(copies|units|systems?|consoles?|games?|ones?)\b/gi;
const RANGE = /\bbetween\b[^,;!?]{0,120}?\band\b[^,;!?]{0,120}?(?=\s*(?:[,;!?]|$|\b(?:but|plus|versus|vs\.?)\b))/gi;
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
const GENERIC_SUBJECTS = new Set(["console", "system", "unit", "copy", "game", "one"]);

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

function normalizeExtendedExistentials(value) {
  return clean(value)
    .replace(/\bthere\s+won't\b/gi, "no there will")
    .replace(/\bthere'll\b/gi, "yes there will")
    .replace(/\bthere\s+wouldn't\b/gi, "no there would")
    .replace(/\bthere's\s+been\b/gi, "yes there has been")
    .replace(/\bthere\s+hasn't\s+been\b/gi, "no there has been")
    .replace(/\bthere've\s+been\b/gi, "yes there have been")
    .replace(/\bthere\s+haven't\s+been\b/gi, "no there have been")
    .replace(/\bthere'd\s+been\b/gi, "yes there had been")
    .replace(/\bthere\s+hadn't\s+been\b/gi, "no there had been");
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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function choiceSelectionValid(question, surface) {
  const alternatives = choiceAlternativeTokens(question);
  if (!alternatives) return true;
  const text = clean(surface).toLowerCase();
  if (/^\s*(?:neither|either|both|anything|whatever|no thanks|none(?: of them)?|i don't care|i dont care)\b/i.test(text)) return true;

  const output = contentTokens(text);
  const leftHits = [...alternatives.leftUnique].filter((token) => output.has(token));
  const rightHits = [...alternatives.rightUnique].filter((token) => output.has(token));
  if (Boolean(leftHits.length) === Boolean(rightHits.length)) return false;
  const selected = (leftHits.length ? leftHits : rightHits)[0];
  const token = escapeRegex(selected);
  const patterns = [
    new RegExp(`^\\s*(?:probably\\s+|definitely\\s+|maybe\\s+)?${token}(?:\\s+please)?[.!]?\\s*$`, "i"),
    new RegExp(`\\b(?:want|wants|wanted|choose|chooses|chose|pick|picks|picked|take|takes|took|prefer|prefers|preferred)\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:i(?:'d| would)\\s+(?:like|prefer)|i(?:'ll| will)\\s+(?:take|have|choose|pick)|give\\s+me|go\\s+with)\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:it(?:'s| is)|that(?:'s| is))\\s+${token}\\b`, "i"),
    new RegExp(`\\b${token}\\b\\s+(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|for\\s+me|looks?\\s+better)\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function validateChoiceSelection(evaluation, question, surface) {
  if (!evaluation?.enforced || !evaluation?.ok || !choiceAlternativeTokens(question)) return evaluation;
  if (choiceSelectionValid(question, surface)) return evaluation;
  return {
    ...evaluation,
    ok: false,
    reason: "missing-choice-selection",
    evidence: { ...(evaluation.evidence || {}), finalChoiceSelectionRejected: true }
  };
}

function explicitOwnershipMismatch(evaluation, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return false;
  const ownership = (evaluation?.contract?.polarityObligations || []).filter((row) => row?.scope === "ownership");
  if (!ownership.length) return false;

  const responseSegments = clean(surface)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (responseSegments.some((part) => STANDALONE_POLARITY.test(part))) return false;
  if (DIRECT_OWNERSHIP.test(surface)) return false;

  const named = [];
  const matcher = new RegExp(NAMED_OWNERSHIP.source, "gi");
  let match;
  while ((match = matcher.exec(clean(surface)))) {
    const tokens = subjectTokens(match[1]);
    if (tokens.size) named.push(tokens);
  }
  if (!named.length) return false;

  for (const row of ownership) {
    const expected = subjectTokens(row?.clause || "");
    if (!expected.size) continue;
    if (named.some((tokens) => overlaps(tokens, expected))) continue;
    return true;
  }
  return false;
}

function validateExplicitOwnership(evaluation, surface) {
  if (!explicitOwnershipMismatch(evaluation, surface)) return evaluation;
  return {
    ...evaluation,
    ok: false,
    reason: "missing-polarity",
    evidence: { ...(evaluation.evidence || {}), finalOwnershipObjectMismatch: true }
  };
}

function rangeSpans(value) {
  const spans = [];
  const matcher = new RegExp(RANGE.source, "gi");
  let match;
  while ((match = matcher.exec(clean(value)))) spans.push({ start: match.index, end: matcher.lastIndex, text: match[0] });
  return spans;
}

function containingRange(spans, index) {
  return spans.find((span) => index >= span.start && index < span.end) || null;
}

function quantityEvidenceUnits(surface) {
  const text = clean(surface);
  const spans = rangeSpans(text);
  const emittedRanges = new Set();
  const units = [];
  const matcher = new RegExp(QUANTITY_UNIT.source, "gi");
  let match;
  while ((match = matcher.exec(text))) {
    const range = containingRange(spans, match.index);
    if (range) {
      if (emittedRanges.has(range.start)) continue;
      emittedRanges.add(range.start);
      units.push({ text: range.text, subject: subjectTokens(range.text) });
      continue;
    }
    units.push({ text: match[0], subject: new Set([canonicalToken(match[1])]) });
  }
  return units;
}

function evidencePieces(surface) {
  const text = clean(surface);
  const protectedRanges = [];
  let protectedText = text.replace(new RegExp(RANGE.source, "gi"), (match) => {
    const index = protectedRanges.push(match) - 1;
    return `__range_${index}__`;
  });
  protectedText = protectedText.replace(/\b(?:versus|vs\.?)\b/gi, ",");
  return protectedText
    .split(/(?:[,;!?]+|\b(?:and|but|plus)\b)/i)
    .map((part) => part.replace(/__range_(\d+)__/g, (_, index) => protectedRanges[Number(index)] || "").trim())
    .filter(Boolean);
}

function priceEvidenceUnits(surface) {
  const units = [];
  for (const piece of evidencePieces(surface)) {
    const ranges = rangeSpans(piece);
    if (ranges.length && MONEY.test(piece)) {
      units.push({ text: piece, subject: subjectTokens(piece) });
      MONEY.lastIndex = 0;
      continue;
    }
    MONEY.lastIndex = 0;
    const matches = [...piece.matchAll(new RegExp(MONEY.source, "gi"))];
    for (const match of matches) units.push({ text: match[0], subject: subjectTokens(piece) });
  }
  MONEY.lastIndex = 0;
  return units;
}

function isGenericSubject(subject) {
  return subject.size > 0 && [...subject].every((token) => GENERIC_SUBJECTS.has(token));
}

function assignUnitsToClauses(clauses, units) {
  const clauseSubjects = clauses.map(subjectTokens);
  const assignments = Array(clauses.length).fill(null);
  const used = new Set();

  for (let index = 0; index < clauses.length; index += 1) {
    const matchIndex = units.findIndex((unit, unitIndex) => !used.has(unitIndex) && unit.subject.size && overlaps(clauseSubjects[index], unit.subject));
    if (matchIndex >= 0) {
      assignments[index] = units[matchIndex].text;
      used.add(matchIndex);
    }
  }

  for (let index = 0; index < clauses.length; index += 1) {
    if (assignments[index]) continue;
    const remainingClauseIndexes = assignments.map((value, i) => value ? -1 : i).filter((i) => i >= 0);
    const remainingUnitIndexes = units.map((_, i) => used.has(i) ? -1 : i).filter((i) => i >= 0);
    if (remainingClauseIndexes.length === 1 && remainingUnitIndexes.length === 1 && isGenericSubject(units[remainingUnitIndexes[0]].subject)) {
      const unitIndex = remainingUnitIndexes[0];
      assignments[index] = units[unitIndex].text;
      used.add(unitIndex);
    }
  }

  for (let index = 0; index < clauses.length; index += 1) {
    if (assignments[index]) continue;
    const unitIndex = units.findIndex((unit, i) => !used.has(i) && !unit.subject.size);
    if (unitIndex >= 0) {
      assignments[index] = units[unitIndex].text;
      used.add(unitIndex);
    }
  }
  return assignments;
}

function repairCompactRepeatedEvidence(evaluation, surface) {
  if (evaluation?.ok || !/^missing-(?:quantity|price)$/.test(evaluation?.reason || "")) return evaluation;
  const kind = evaluation.reason === "missing-quantity" ? "quantity" : "price";
  const clauses = evaluation?.contract?.repeatedHardObligations?.[kind];
  if (!Array.isArray(clauses) || clauses.length < 2) return evaluation;

  const units = kind === "quantity" ? quantityEvidenceUnits(surface) : priceEvidenceUnits(surface);
  if (units.length < clauses.length) return evaluation;
  const assignments = assignUnitsToClauses(clauses, units);
  if (assignments.some((value) => !value)) return evaluation;

  const coverage = (evaluation.coverage || []).map((row) => row.kind === kind ? { ...row, satisfied: true } : row);
  const missing = [...new Set(coverage.filter((row) => row.hard && !row.satisfied).map((row) => row.kind))];
  if (missing.length) return { ...evaluation, coverage, reason: `missing-${missing.join("+")}` };
  return {
    ...evaluation,
    ok: true,
    reason: "recognized-obligations-covered",
    coverage,
    evidence: {
      ...(evaluation.evidence || {}),
      finalRepeatedEvidenceRepair: { kind, assignments }
    }
  };
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const evaluationLines = Array.isArray(args.lines)
    ? args.lines.map((line) => ({ ...line, text: normalizeExtendedExistentials(line?.text) }))
    : args.lines;
  let evaluation = evaluateHardenedVoice({ ...args, lines: evaluationLines });
  const rawSurface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";

  evaluation = repairCompactRepeatedEvidence(evaluation, rawSurface);
  evaluation = validateExplicitOwnership(evaluation, rawSurface);
  evaluation = validateChoiceSelection(evaluation, question, rawSurface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
