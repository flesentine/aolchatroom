import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateFinalVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_final.js";

const CHOICE_AUX = "(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)";
const CHOICE_OR_QUESTION = new RegExp(`\\s*${CHOICE_AUX}\\b[^?]{0,180}\\s+or\\s+${CHOICE_AUX}\\b`, "i");
const STANDALONE_POLARITY = /^\s*(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|maybe|probably|i do|i don't|i dont|i did|i didn't|i didnt|i have|i haven't|i havent|i am|i'm|i was|i wasn't|i wasnt|i will|i won't|i wont)\s*$/i;
const EXPLICIT_OWNERSHIP_OBJECT = /\b(?:i|we|he|she|they)\s+(?:own|owns|owned)\s+([^,;.!?]+?)(?=\s*(?:[,;.!?]|$|\b(?:and|but|though|tho|or|plus)\b))/gi;
const DIRECT_OBJECT = /^(?:it|one|this|that|these|those|\d+)$/i;
const MONEY = /(?:[$£€¥]\s*\d+(?:\.\d{1,2})?)|\b\d+(?:\.\d{1,2})?\s*(?:bucks?|dollars?|usd)\b/gi;
const RANGE = /\bbetween\b[^,;!?]{0,120}?\band\b[^,;!?]{0,120}?(?=\s*(?:[,;!?]|$|\b(?:but|plus|versus|vs\.?)\b))/gi;
const COUNT_TOKEN = "(?:\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|couple|few|several|many)";
const QUALIFIED_QUANTITY = new RegExp(`\\b${COUNT_TOKEN}\\b\\s+((?:[a-z0-9'-]+\\s+){0,3})(copies|units|systems?|consoles?|games?|ones?)\\b`, "gi");
const CONTENT_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "she", "that", "the", "their", "them", "they", "this", "to", "u", "was", "we",
  "were", "will", "would", "yes", "yeah", "you", "your"
]);
const SUBJECT_STOP = new Set([
  "what", "how", "much", "many", "price", "cost", "costs", "costed", "worth", "pay", "paid", "number", "quantity", "count",
  "own", "owns", "owned", "go", "goes", "went", "about", "around", "roughly", "approximately", "approx", "maybe", "probably", "between",
  "buck", "bucks", "dollar", "dollars", "usd", "hundred", "thousand", "grand",
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "dozen", "couple", "few", "several", "many"
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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function responseClauses(value) {
  return clean(value)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeGuardSurface(value) {
  return clean(value).replace(/\bthere'd\s+be\b/gi, "yes there would be");
}

function normalizeGuardLines(lines) {
  return Array.isArray(lines)
    ? lines.map((line) => ({ ...line, text: normalizeGuardSurface(line?.text) }))
    : lines;
}

function validateExplicitOwnershipObjects(evaluation, surface) {
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

  for (const index of ownershipIndexes) {
    const expected = subjectTokens(allPolarity[index]?.clause || "");
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
    new RegExp(`\\b(?:i(?:'d| would)\\s+(?:like|prefer|have|take|choose|pick)|i(?:'ll| will)\\s+(?:take|have|choose|pick)|give\\s+me|go\\s+with|let(?:'s|s)\\s+(?:do|go\\s+with))\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:it(?:'s| is)|that(?:'s| is))\\s+${token}\\b`, "i"),
    new RegExp(`\\b${token}\\b\\s*(?:,\\s*)?(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|is\\s+my\\s+choice|would\\s+be\\s+(?:nice|good|great|fine|better)|for\\s+me|looks?\\s+better)\\b`, "i")
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

function hasQuantityExpression(value) {
  const matcher = new RegExp(QUALIFIED_QUANTITY.source, "i");
  return matcher.test(clean(value));
}

function quantityEvidenceUnits(surface) {
  const text = clean(surface);
  const spans = rangeSpans(text);
  const emittedRanges = new Set();
  const units = [];
  const matcher = new RegExp(QUALIFIED_QUANTITY.source, "gi");
  let match;
  while ((match = matcher.exec(text))) {
    const range = containingRange(spans, match.index);
    if (range) {
      if (emittedRanges.has(range.start)) continue;
      emittedRanges.add(range.start);
      if (hasQuantityExpression(range.text)) units.push({ text: range.text, subject: subjectTokens(range.text) });
      continue;
    }
    const qualifier = clean(match[1] || "", 80);
    const unit = clean(match[2] || "", 30);
    units.push({ text: match[0], subject: subjectTokens(`${qualifier} ${unit}`) });
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
    const moneyMatcher = new RegExp(MONEY.source, "gi");
    const moneyMatches = [...piece.matchAll(moneyMatcher)];
    if (!moneyMatches.length) continue;
    if (ranges.length) {
      units.push({ text: piece, subject: subjectTokens(piece) });
      continue;
    }
    for (const match of moneyMatches) units.push({ text: match[0], subject: subjectTokens(piece) });
  }
  return units;
}

function isGenericSubject(subject) {
  return subject.size > 0 && [...subject].every((token) => GENERIC_SUBJECTS.has(token));
}

function assignStrictRepeated(clauses, units) {
  const clauseSubjects = clauses.map(subjectTokens);
  const assignments = Array(clauses.length).fill(null);
  const used = new Set();

  for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex += 1) {
    const unitIndex = units.findIndex((unit, index) => !used.has(index) && unit.subject.size && overlaps(clauseSubjects[clauseIndex], unit.subject));
    if (unitIndex >= 0) {
      assignments[clauseIndex] = units[unitIndex].text;
      used.add(unitIndex);
    }
  }

  const remainingClauses = () => assignments.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
  const remainingUnits = () => units.map((_, index) => used.has(index) ? -1 : index).filter((index) => index >= 0);

  const clauseIndexes = remainingClauses();
  const unitIndexes = remainingUnits();
  if (clauseIndexes.length === 1 && unitIndexes.length === 1) {
    const unit = units[unitIndexes[0]];
    const explicitGenericAlreadyRequested = [...unit.subject].some((token) => clauseSubjects.some((subject) => subject.has(token)));
    if (isGenericSubject(unit.subject) && !explicitGenericAlreadyRequested) {
      assignments[clauseIndexes[0]] = unit.text;
      used.add(unitIndexes[0]);
    }
  }

  for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex += 1) {
    if (assignments[clauseIndex]) continue;
    const unitIndex = units.findIndex((unit, index) => !used.has(index) && !unit.subject.size);
    if (unitIndex >= 0) {
      assignments[clauseIndex] = units[unitIndex].text;
      used.add(unitIndex);
    }
  }
  return assignments;
}

function repeatedCoverage(evaluation, kind, clauses, assignments) {
  const coverage = (evaluation.coverage || []).map((row) => row.kind === kind
    ? { ...row, satisfied: Boolean(assignments.find((_, index) => row.id === `${kind}:clause:${index}`) || assignments[(evaluation.coverage || []).filter((item) => item.kind === kind).indexOf(row)]) }
    : row);
  // The hardened/final layers use stable clause ids. Rebuild only repeated rows
  // when the old coverage shape cannot be mapped cleanly.
  const existingKindRows = coverage.filter((row) => row.kind === kind);
  if (existingKindRows.length === clauses.length) {
    let cursor = 0;
    return coverage.map((row) => row.kind === kind ? { ...row, satisfied: Boolean(assignments[cursor++]) } : row);
  }
  return [
    ...coverage.filter((row) => row.kind !== kind),
    ...clauses.map((clause, index) => ({
      id: `${kind}:clause:${index}`,
      kind,
      hard: true,
      satisfied: Boolean(assignments[index]),
      clause
    }))
  ];
}

function validateOrRepairRepeatedEvidence(evaluation, surface) {
  if (!evaluation?.enforced) return evaluation;
  const repeated = evaluation?.contract?.repeatedHardObligations || {};
  for (const kind of ["quantity", "price"]) {
    const clauses = repeated[kind];
    if (!Array.isArray(clauses) || clauses.length < 2) continue;
    const units = kind === "quantity" ? quantityEvidenceUnits(surface) : priceEvidenceUnits(surface);
    if (!units.length) continue;
    const assignments = assignStrictRepeated(clauses, units);
    const complete = assignments.every(Boolean);

    if (evaluation.ok) {
      if (units.length < clauses.length || complete) continue;
      const coverage = repeatedCoverage(evaluation, kind, clauses, assignments);
      return {
        ...evaluation,
        ok: false,
        reason: `missing-${kind}`,
        coverage,
        evidence: {
          ...(evaluation.evidence || {}),
          finalGuardRepeatedValidation: { kind, units, assignments }
        }
      };
    }

    if (evaluation.reason !== `missing-${kind}` || !complete) continue;
    const coverage = repeatedCoverage(evaluation, kind, clauses, assignments);
    const missing = [...new Set(coverage.filter((row) => row.hard && !row.satisfied).map((row) => row.kind))];
    if (missing.length) return { ...evaluation, coverage, reason: `missing-${missing.join("+")}` };
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      coverage,
      evidence: {
        ...(evaluation.evidence || {}),
        finalGuardRepeatedRepair: { kind, units, assignments }
      }
    };
  }
  return evaluation;
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const evaluationLines = normalizeGuardLines(args.lines);
  let evaluation = evaluateFinalVoice({ ...args, lines: evaluationLines });
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  evaluation = validateOrRepairRepeatedEvidence(evaluation, surface);
  evaluation = validateExplicitOwnershipObjects(evaluation, surface);
  evaluation = validateChoiceSelection(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
