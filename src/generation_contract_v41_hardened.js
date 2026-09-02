import {
  buildPrimaryHumanVoiceContract as buildBaseContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateBaseVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41.js";

const POLARITY_AUX = "(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)";
const CROSS_TYPE_HOW_MUCH_OR = new RegExp(`(\\bhow much\\b[^?]{0,180}?)\\s+or\\s+(?=${POLARITY_AUX}\\b)`, "gi");
const CHOICE_OR_QUESTION = new RegExp(`^\\s*${POLARITY_AUX}\\b[^?]{0,180}\\s+or\\s+${POLARITY_AUX}\\b`, "i");
const STANDALONE = /^\s*(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|maybe|probably|i do|i don't|i dont|i did|i didn't|i didnt|i have|i am|i'm|i was|i wasn't|i wasnt|i will|i won't|i wont)\s*$/i;
const LEADING_POLARITY = /^\s*(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|maybe|probably)\b/i;
const OPINION = /\b(?:like|love|hate|prefer|favorite|fave|worth|think|believe|feel|good|bad|rules?|rocks?|sucks?|awesome|cool|great|terrible|awful|best|worst)\b/i;
const OWNERSHIP = /\b(?:own|owns|owned|got)\b|\b(?:i|we|he|she|they)\s+(?:have|has|had)\s+(?:(?:a|an|the|one|it|any|some|no|this|that|these|those)\b|\d+\b)/i;
const ABILITY = /\b(?:can|could|able|can't|cant|cannot|couldn't|couldnt)\b/i;
const PAYMENT = /\b(?:pay|paid)\b/i;
const SUBJECT_AUX = /\b(?:i|we|you|u|he|she|they|it|this|that)\s+(?:am|is|are|was|were|do|does|did|have|has|had|can|could|will|would)\b/i;
const EXPLICIT_GROUPED_COUNT = /\b\d{1,3}(?:,\d{3})+\s+(?:copies|units|systems?|consoles?|games?|ones?)\b/i;
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
  return clean(value).replace(CROSS_TYPE_HOW_MUCH_OR, "$1; ");
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
    .replace(/\bthere's\s+(?=(?:a|an|one|some|any|no|none|nothing|something|plenty|few|several|many|\d)\b)/gi, "there is ");

  text = text.replace(
    /(^|[,;!?]\s*|\b(?:and|but|or)\s+)there\s+(is|are|was|were)\s+not\b/gi,
    (_, boundary, aux) => `${boundary}no there ${aux} not`
  );
  text = text.replace(
    /(^|[,;!?]\s*|\b(?:and|but|or)\s+)there\s+(is|are|was|were)\b(?!\s+not\b)/gi,
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

function splitResponseClauses(value) {
  return clean(value)
    .split(/(?:[,;!?]+|\b(?:and|but|though|tho|or)\b)/i)
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

function scopedClauseMatches(clause, obligation) {
  const scope = obligation?.scope || "generic";
  if (scope === "ownership") return OWNERSHIP.test(clause);
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
  if (scope === "ownership") return OWNERSHIP.test(clause);
  if (scope === "opinion") return OPINION.test(clause);
  if (scope === "ability") return ABILITY.test(clause);
  if (scope === "payment") return PAYMENT.test(clause);
  return SUBJECT_AUX.test(clause) || /\bthere\s+(?:is|are|was|were)\b/i.test(clause);
}

function orderedPolarityCoverage(obligations, normalizedText) {
  const rows = Array.isArray(obligations) ? obligations : [];
  const satisfied = new Set();
  if (rows.length <= 1) return satisfied;

  for (const clause of splitResponseClauses(normalizedText)) {
    if (STANDALONE.test(clause)) {
      const next = rows.find((row) => !satisfied.has(row.id));
      if (next) satisfied.add(next.id);
      continue;
    }

    const match = rows.find((row) => !satisfied.has(row.id) && clauseCarriesPolarity(clause, row));
    if (match) satisfied.add(match.id);
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

function repairExplicitGroupedQuantity(evaluation, rawText) {
  if (evaluation?.ok || !EXPLICIT_GROUPED_COUNT.test(clean(rawText))) return evaluation;
  return repairCoverage(evaluation, "quantity", { explicitGroupedQuantity: true });
}

function selectedChoiceAlternative(question, surface) {
  const source = clean(question);
  if (!CHOICE_OR_QUESTION.test(source)) return false;
  const parts = source.split(/\s+or\s+/i);
  if (parts.length !== 2) return false;
  const left = contentTokens(parts[0]);
  const right = contentTokens(parts[1]);
  const unique = new Set([...left, ...right].filter((token) => !(left.has(token) && right.has(token))));
  if (!unique.size) return false;
  const output = contentTokens(surface);
  for (const token of output) if (unique.has(token)) return true;
  return false;
}

function repairChoiceAlternative(evaluation, question, rawText) {
  if (evaluation?.ok || !/^missing-.*polarity/.test(evaluation?.reason || "")) return evaluation;
  if (!selectedChoiceAlternative(question, rawText)) return evaluation;
  return repairCoverage(evaluation, "polarity", { explicitChoiceAlternative: true });
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

  const obligations = evaluation?.contract?.polarityObligations || [];
  if (obligations.length <= 1) return evaluation;

  const surface = normalized.lines?.[0]?.text || "";
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
