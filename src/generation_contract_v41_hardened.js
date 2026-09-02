import {
  buildPrimaryHumanVoiceContract as buildBaseContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateBaseVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41.js";

const POLARITY_AUX = "(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)";
const CROSS_TYPE_HOW_MUCH_OR = new RegExp(`\\bhow much\\b[^?]{0,180}?\\s+or\\s+(?=${POLARITY_AUX}\\b)`, "gi");
const CHOICE_OR_QUESTION = new RegExp(`^\\s*${POLARITY_AUX}\\b[^?]{0,180}\\s+or\\s+${POLARITY_AUX}\\b`, "i");
const STANDALONE = /^\s*(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|maybe|probably|i do|i don't|i dont|i did|i didn't|i didnt|i have|i am|i'm|i was|i wasn't|i wasnt|i will|i won't|i wont)\s*$/i;
const LEADING_POLARITY = /^\s*(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|maybe|probably)\b/i;
const OPINION = /\b(?:like|love|hate|prefer|favorite|fave|worth|think|believe|feel|good|bad|rules?|rocks?|sucks?|awesome|cool|great|terrible|awful|best|worst)\b/i;
const EXPLICIT_OWNERSHIP = /\b(?:own|owns|owned)\b/i;
const DIRECT_POSSESSION = /\b(?:i|we|he|she|they)\s+(?:(?:have|has|had)(?:\s+got)?|got)\s+(?:it|this|that|these|those|\d+\b|one\b(?!\s+[a-z]))/i;
const NAMED_POSSESSION = /\b(?:i|we|he|she|they)\s+(?:(?:have|has|had)(?:\s+got)?|got)\s+(?:a|an|the|some|any|no)\s+([a-z0-9'-]+(?:\s+[a-z0-9'-]+){0,2})/i;
const ABILITY = /\b(?:can|could|able|can't|cant|cannot|couldn't|couldnt)\b/i;
const PAYMENT = /\b(?:pay|paid)\b/i;
const SUBJECT_AUX = /\b(?:i|we|you|u|he|she|they|it|this|that)\s+(?:am|is|are|was|were|do|does|did|have|has|had|can|could|will|would)\b/i;
const GROUPED_COUNT_PATTERN = /\b\d{1,3}(?:,\d{3})+\s+(?:copies|units|systems|(?:game\s+)?consoles|games|ones)\b/gi;
const COUNT_APPROX = "(?:(?:about|around|roughly|nearly|almost|over|under|like)\\s+)?";
const HARD_QUANTITY_QUESTION = /\b(?:how many|number of|quantity|count of)\b/i;
const HARD_PRICE_QUESTION = /\bwhat(?:'s| is| was| are| were)?\s+(?:the\s+)?(?:price|cost)\b|\bwhat\s+(?:does|did|do|is|was|are|were)\b.{0,45}\b(?:cost|go(?:es)? for)\b|\bwhat(?:'d| did)\s+(?:you|u|he|she|they|we|it)\s+pay\b|\bhow much\b.{0,65}\b(?:costs?|cost|worth|paid|pay|go(?:es)? for|went for|price)\b|\bwhat(?:'s| is| are| was| were)?\b.{0,60}\bworth\b/i;
const PURCHASE_WORTH_OPINION = /\bworth\s+(?:buying|get(?:ting)?|owning|playing|trying|having|it)\b/i;
const MONEY_EVIDENCE = /(?:[$£€¥]\s*\d+(?:\.\d{1,2})?)|\b\d+(?:\.\d{1,2})?\s*(?:bucks?|dollars?|usd)\b/i;
const PRICE_CONTEXT = /\b(?:price|priced|costs?|cost|paid|pay|worth|go(?:es)? for|went for|sell(?:s|ing)? for)\b/i;
const PRICE_QUALITATIVE = /\b(?:cheap|cheaper|expensive|pricey|too much)\b/i;
const PRICE_AMOUNT_WORD = /\b(?:hundred|thousand|grand)\b/i;
const APPROX_NUMBER = /\b(?:about|around|like|roughly|approx(?:imately)?|maybe|probably)\s+\$?(\d+(?:\.\d{1,2})?)\b/i;
const COUNT_WORD = /\b(?:zero|none|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|couple|few|several|many|tons?)\b/i;
const COUNT_NOUN = /\b(?:copies|units|systems?|consoles?|games?|ones?)\b/i;
const CONTENT_STOP = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "she", "that", "the", "their", "them", "they", "this", "to", "u", "was", "we",
  "were", "will", "would", "yes", "yeah", "you", "your"
]);

function clean(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeGroupedNumbers(value) {
  let text = String(value || "");
  let prior = null;
  while (prior !== text) {
    prior = text;
    text = text.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  }
  return text;
}

function normalizeQuestion(value) {
  return clean(value).replace(CROSS_TYPE_HOW_MUCH_OR, (match) => match.replace(/\s+or\s+/i, "; "));
}

function normalizeResponse(value) {
  let text = normalizeGroupedNumbers(value);
  text = text
    .replace(/\b(i|we|you|they)'ve\b/gi, "$1 have")
    .replace(/\bhaven't\b/gi, "have not")
    .replace(/\bhasn't\b/gi, "has not")
    .replace(/\bhadn't\b/gi, "had not")
    .replace(/\baren't\b/gi, "are not")
    .replace(/\bisn't\b/gi, "is not")
    .replace(/\bwasn't\b/gi, "was not")
    .replace(/\bweren't\b/gi, "were not")
    .replace(/\bthere're\b/gi, "there are")
    .replace(/\bthere's\s+(?=(?:not|a|an|one|some|any|no|none|nothing|something|plenty|few|several|many|\d)\b)/gi, "there is ");

  text = text.replace(
    /(^|[,;!?]\s*|\b(?:and|but|or)\s+)there\s+(is|are|was|were)\s+(?:not|no)\b/gi,
    (match, boundary, aux) => `${boundary}no there ${aux}${/\s+no\b/i.test(match) ? " no" : " not"}`
  );
  text = text.replace(
    /(^|[,;!?]\s*|\b(?:and|but|or)\s+)there\s+(is|are|was|were)\b(?!\s+(?:not|no)\b)/gi,
    (_, boundary, aux) => `${boundary}yes there ${aux}`
  );
  return clean(text);
}

function normalizeInputs({ plan = null, human = null, lines = [] } = {}) {
  const normalizedPlan = plan ? {
    ...plan,
    goal: normalizeQuestion(plan.goal),
    moves: Array.isArray(plan.moves)
      ? plan.moves.map((move) => ({ ...move, meaning: normalizeQuestion(move?.meaning) }))
      : plan.moves
  } : plan;
  const normalizedHuman = human ? { ...human, text: normalizeQuestion(human.text) } : human;
  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => ({ ...line, text: normalizeResponse(line?.text) }))
    : lines;
  return { plan: normalizedPlan, human: normalizedHuman, lines: normalizedLines };
}

function splitResponseSegments(value) {
  const text = clean(value);
  const separator = /[,;!?/]+|\b(?:and|but|though|tho|or|plus)\b/gi;
  const segments = [];
  let start = 0;
  let connector = null;
  let match;
  while ((match = separator.exec(text))) {
    const part = text.slice(start, match.index).trim();
    if (part) segments.push({ text: part, connector });
    connector = match[0].trim().toLowerCase();
    start = separator.lastIndex;
  }
  const tail = text.slice(start).trim();
  if (tail) segments.push({ text: tail, connector });
  return segments;
}

function splitResponseClauses(value) {
  return splitResponseSegments(value).map((segment) => segment.text);
}

function splitQuestionClauses(value) {
  return clean(value)
    .split(/(?:[,;!?]+|\b(?:and|but|though|tho)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function contentTokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^'+|'+$/g, ""))
      .filter((token) => token.length >= 3 && !CONTENT_STOP.has(token))
  );
}

function overlapsObligation(clause, obligation) {
  const response = contentTokens(clause);
  const expected = contentTokens(obligation?.clause || "");
  for (const token of response) if (expected.has(token)) return true;
  return false;
}

function ownershipClauseMatches(clause, obligation) {
  const text = clean(clause);
  if (EXPLICIT_OWNERSHIP.test(text) || DIRECT_POSSESSION.test(text)) return true;
  const named = text.match(NAMED_POSSESSION);
  if (!named) return false;
  const objectTokens = contentTokens(named[1]);
  const expected = contentTokens(obligation?.clause || "");
  for (const token of objectTokens) if (expected.has(token)) return true;
  return false;
}

function scopedClauseMatches(clause, obligation) {
  const scope = obligation?.scope || "generic";
  if (scope === "ownership") return ownershipClauseMatches(clause, obligation);
  if (scope === "opinion") return OPINION.test(clause);
  if (scope === "ability") return ABILITY.test(clause);
  if (scope === "payment") return PAYMENT.test(clause);
  if (scope === "generic") return overlapsObligation(clause, obligation);
  return false;
}

function clauseCarriesPolarity(clause, obligation) {
  if (!scopedClauseMatches(clause, obligation)) return false;
  const scope = obligation?.scope || "generic";
  if (LEADING_POLARITY.test(clause)) return true;
  if (scope === "ownership") return ownershipClauseMatches(clause, obligation);
  if (scope === "opinion") return OPINION.test(clause);
  if (scope === "ability") return ABILITY.test(clause);
  if (scope === "payment") return PAYMENT.test(clause);
  return SUBJECT_AUX.test(clause) || /\bthere\s+(?:is|are|was|were)\b/i.test(clause);
}

function orderedPolarityCoverage(obligations, normalizedText) {
  const rows = Array.isArray(obligations) ? obligations : [];
  const satisfied = new Set();
  if (rows.length <= 1) return satisfied;

  let standaloneFloor = 0;
  let lastScopedIndex = -1;
  for (const segment of splitResponseSegments(normalizedText)) {
    const clause = segment.text;
    if (STANDALONE.test(clause)) {
      let nextIndex = -1;
      for (let index = standaloneFloor; index < rows.length; index += 1) {
        if (!satisfied.has(rows[index].id)) {
          nextIndex = index;
          break;
        }
      }

      const contrast = /^(?:but|though|tho)$/i.test(segment.connector || "");
      if (nextIndex < 0 && contrast && lastScopedIndex > 0) {
        for (let index = 0; index < lastScopedIndex; index += 1) {
          if (!satisfied.has(rows[index].id)) {
            nextIndex = index;
            break;
          }
        }
      }

      if (nextIndex >= 0) {
        satisfied.add(rows[nextIndex].id);
        if (nextIndex >= standaloneFloor) standaloneFloor = nextIndex + 1;
      }
      lastScopedIndex = -1;
      continue;
    }

    let matchIndex = -1;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!satisfied.has(row.id) && clauseCarriesPolarity(clause, row)) {
        matchIndex = index;
        break;
      }
    }
    if (matchIndex >= 0) {
      satisfied.add(rows[matchIndex].id);
      standaloneFloor = Math.max(standaloneFloor, matchIndex + 1);
      lastScopedIndex = matchIndex;
    } else {
      lastScopedIndex = -1;
    }
  }
  return satisfied;
}

function repairCoverage(evaluation, kind, evidence = {}) {
  const coverage = (evaluation?.coverage || []).map((row) => row.kind === kind
    ? { ...row, satisfied: true }
    : row);
  const missing = [...new Set(coverage.filter((row) => row.hard && !row.satisfied).map((row) => row.kind))];
  if (missing.length) return { ...evaluation, coverage, reason: `missing-${missing.join("+")}` };
  return {
    ...evaluation,
    ok: true,
    reason: "recognized-obligations-covered",
    coverage,
    evidence: { ...(evaluation?.evidence || {}), ...evidence }
  };
}

function canRepairMissingKind(evaluation, kind) {
  return Boolean(
    !evaluation?.ok
    && /^missing-/.test(evaluation?.reason || "")
    && (evaluation?.coverage || []).some((row) => row.kind === kind && row.hard && !row.satisfied)
  );
}

function hasExplicitGroupedQuantity(rawText) {
  const text = clean(rawText);
  const matcher = new RegExp(GROUPED_COUNT_PATTERN.source, "gi");
  let match;
  while ((match = matcher.exec(text))) {
    const prefix = text.slice(0, match.index);
    if (/(?:[$£€¥]\s*|(?:usd|dollars?|bucks?)\s*)$/i.test(prefix)) continue;
    if (new RegExp(`^\\s*${COUNT_APPROX}$`, "i").test(prefix)) return true;
    if (new RegExp(`\\b(?:i|we|he|she|they)\\s+(?:(?:have|has|had)(?:\\s+got)?|got|own|owns|owned)\\s+${COUNT_APPROX}$`, "i").test(prefix)) return true;
    if (new RegExp(`\\bthere\\s+(?:are|were)\\s+${COUNT_APPROX}$`, "i").test(prefix)) return true;
    if (new RegExp(`\\b(?:count|number)(?:\\s+(?:is|was))?\\s+${COUNT_APPROX}$`, "i").test(prefix)) return true;
  }
  return false;
}

function repairExplicitGroupedQuantity(evaluation, rawText) {
  if (!canRepairMissingKind(evaluation, "quantity") || !hasExplicitGroupedQuantity(rawText)) return evaluation;
  return repairCoverage(evaluation, "quantity", { explicitGroupedQuantity: true });
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

function selectedChoiceToken(question, surface) {
  const alternatives = choiceAlternativeTokens(question);
  if (!alternatives) return null;
  const output = contentTokens(surface);
  const leftHits = [...alternatives.leftUnique].filter((token) => output.has(token));
  const rightHits = [...alternatives.rightUnique].filter((token) => output.has(token));
  if (Boolean(leftHits.length) === Boolean(rightHits.length)) return null;
  return (leftHits.length ? leftHits : rightHits)[0] || null;
}

function selectedChoiceAlternative(question, surface) {
  const selected = selectedChoiceToken(question, surface);
  if (!selected) return false;
  const token = escapeRegex(selected);
  const text = clean(surface).toLowerCase();
  const patterns = [
    new RegExp(`^\\s*(?:probably\\s+|definitely\\s+|maybe\\s+)?${token}(?:\\s+please)?[.!]?\\s*$`, "i"),
    new RegExp(`\\b(?:want|wants|wanted|choose|chooses|chose|pick|picks|picked|take|takes|took|prefer|prefers|preferred)\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:i(?:'d| would)\\s+(?:like|prefer)|i(?:'ll| will)\\s+(?:take|have|choose|pick)|give\\s+me|go\\s+with)\\b[^,;.!?]{0,45}\\b${token}\\b`, "i"),
    new RegExp(`\\b(?:it(?:'s| is)|that(?:'s| is))\\s+${token}\\b`, "i"),
    new RegExp(`\\b${token}\\b\\s+(?:please|sounds?\\s+(?:good|great|better)|works?(?:\\s+for\\s+me)?|is\\s+(?:fine|good|better)|for\\s+me|looks?\\s+better)\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function repairChoiceAlternative(evaluation, question, rawText) {
  if (!canRepairMissingKind(evaluation, "polarity")) return evaluation;
  if (!selectedChoiceAlternative(question, rawText)) return evaluation;
  return repairCoverage(evaluation, "polarity", { explicitChoiceAlternative: true });
}

function repeatedHumanHardObligations(question) {
  const clauses = splitQuestionClauses(question);
  const quantity = clauses.filter((clause) => HARD_QUANTITY_QUESTION.test(clause));
  const price = clauses.filter((clause) => !PURCHASE_WORTH_OPINION.test(clause) && HARD_PRICE_QUESTION.test(clause));
  return {
    ...(quantity.length > 1 ? { quantity } : {}),
    ...(price.length > 1 ? { price } : {})
  };
}

function numericValues(value) {
  return [...clean(value).matchAll(/\b\d+(?:\.\d+)?\b/g)]
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
}

function isYear(value) {
  return Number.isInteger(value) && value >= 1800 && value <= 2199;
}

function priceEvidenceSegment(segment) {
  const text = clean(segment);
  if (!text) return false;
  if (MONEY_EVIDENCE.test(text) || PRICE_QUALITATIVE.test(text)) return true;
  if (PRICE_AMOUNT_WORD.test(text) && PRICE_CONTEXT.test(text)) return true;
  if (PRICE_CONTEXT.test(text) && numericValues(text).some((value) => !isYear(value))) return true;
  const approx = text.match(APPROX_NUMBER);
  return Boolean(approx && !isYear(Number(approx[1])));
}

function quantityEvidenceSegment(segment) {
  const text = clean(segment);
  if (!text || MONEY_EVIDENCE.test(text)) return false;
  if (/\b\d+\s+(?:copies|units|systems?|consoles?|games?|ones?)\b/i.test(text)) return true;
  if (/\b(?:have|has|had|own|owns|owned|got|there(?:'s| is| are)|count(?:ed)?|number(?:ed)?)\s+\d+\b/i.test(text)) {
    return numericValues(text).some((value) => Number.isInteger(value) && !isYear(value));
  }
  if (COUNT_WORD.test(text) && (COUNT_NOUN.test(text) || /^\s*(?:a\s+)?(?:zero|none|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|couple|few|several|many|tons?)\b/i.test(text))) return true;
  const numbers = numericValues(text);
  return /^\s*\d{1,3}\b/.test(text) && numbers.some((value) => Number.isInteger(value) && value >= 0 && value <= 99);
}

function validateRepeatedHardCoverage(evaluation, question, normalizedSurface) {
  if (!evaluation?.ok) return evaluation;
  const repeated = repeatedHumanHardObligations(question);
  const kinds = Object.keys(repeated);
  if (!kinds.length) return evaluation;

  const segments = splitResponseClauses(normalizedSurface);
  let coverage = [...(evaluation.coverage || [])];
  const evidence = { ...(evaluation.evidence || {}), repeatedHardCoverage: {} };
  let missingKind = null;

  for (const kind of kinds) {
    const clauses = repeated[kind];
    const matchingSegments = segments.filter((segment) => kind === "quantity"
      ? quantityEvidenceSegment(segment)
      : priceEvidenceSegment(segment));
    evidence.repeatedHardCoverage[kind] = {
      required: clauses.length,
      satisfied: Math.min(matchingSegments.length, clauses.length),
      segments: matchingSegments
    };
    coverage = coverage.filter((row) => row.kind !== kind);
    clauses.forEach((clause, index) => {
      coverage.push({
        id: `${kind}:clause:${index}`,
        kind,
        hard: true,
        satisfied: index < matchingSegments.length,
        clause
      });
    });
    if (matchingSegments.length < clauses.length && !missingKind) missingKind = kind;
  }

  const contract = {
    ...(evaluation.contract || {}),
    repeatedHardObligations: repeated
  };
  if (missingKind) {
    return {
      ...evaluation,
      ok: false,
      reason: `missing-${missingKind}`,
      contract,
      coverage,
      evidence
    };
  }
  return { ...evaluation, contract, coverage, evidence };
}

export function buildPrimaryHumanVoiceContract(args = {}) {
  const normalized = normalizeInputs({ plan: args.plan, human: args.human, lines: [] });
  return buildBaseContract({ ...args, plan: normalized.plan, human: normalized.human });
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const normalized = normalizeInputs(args);
  let evaluation = evaluateBaseVoice({
    ...args,
    plan: normalized.plan,
    human: normalized.human,
    lines: normalized.lines
  });

  const rawText = args?.lines?.[0]?.text || "";
  evaluation = repairExplicitGroupedQuantity(evaluation, rawText);
  evaluation = repairChoiceAlternative(evaluation, args?.human?.text || "", rawText);
  if (!evaluation?.ok) return evaluation;

  const surface = normalized.lines?.[0]?.text || "";
  evaluation = validateRepeatedHardCoverage(evaluation, normalized.human?.text || "", surface);
  if (!evaluation?.ok) return evaluation;

  const obligations = evaluation?.contract?.polarityObligations || [];
  if (obligations.length <= 1) return evaluation;

  const ordered = orderedPolarityCoverage(obligations, surface);
  if (ordered.size === obligations.length) return evaluation;

  const coverage = (evaluation.coverage || []).map((row) => row.kind === "polarity"
    ? { ...row, satisfied: ordered.has(row.id) }
    : row);
  return {
    ...evaluation,
    ok: false,
    reason: "missing-polarity",
    coverage,
    evidence: {
      ...(evaluation.evidence || {}),
      orderedPolarityCoverage: [...ordered],
      normalizedSurface: surface
    }
  };
}

export { evaluateHumanReplanPrimaryResponse, humanReplanPrimaryObligation };
