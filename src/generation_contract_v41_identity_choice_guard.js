import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateReview77Voice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_review77_base.js";

const MONEY = "(?:[$£€¥]\\s*\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?\\s*(?:bucks?|dollars?|usd)\\b)";
const SAFE_HARDWARE = "(?:(?:(?:video\\s+game|gaming|home)\\s+)?(?:console|system|unit|device|machine))";
const PRICE_QUALIFIER = "(?:(?:(?:launch|retail|list|original|new|used|street|sale|asking|current|average)\\s+)?(?:price|cost)|msrp)";
const PRICE_VERB = "(?:is|was|were|costs?|cost|went\\s+for|goes?\\s+for|sells?\\s+for|sold\\s+for|priced\\s+at|worth|:|-)";
const OWN_ASSERTION = /(\b(?:i|we|he|she|they)\s+(?:(?:do|does|did|really|actually|definitely|absolutely|certainly|personally|still|currently)\s+)*(?:(?:not|never|no\s+longer)\s+)?(?:own|owns|owned)\s+)([^,;.!?]+?)(?=\s+\b(?:and|but|though|tho|or|plus)\b|[,;.!?]|$)/gi;
const HAVE_ASSERTION = /(\b(?:i|we|he|she|they)\s+(?:(?:not|never|no\s+longer|do\s+not|does\s+not|did\s+not)\s+)?(?:have|has|had|got)\s+)([^,;.!?]+?)(?=\s+\b(?:and|but|though|tho|or|plus)\b|[,;.!?]|$)/gi;

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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(value) {
  return escapeRegex(canonicalText(value).toLowerCase().trim()).replace(/\\ /g, "\\s+");
}

function responseClauses(value) {
  return canonicalText(value).split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim()).filter(Boolean);
}

function extractPriceModels(question) {
  return canonicalText(question).split(/(?:[,;?]+|\band\b)/i).map((clause) => clause.trim()).map((clause) => {
    const match = clause.match(/\b(?:how much did|how much does|how much do|what did|what does|what was|what is)\s+(?:the\s+)?(.+?)\s+(?:cost|costs|go\s+for|sell\s+for|worth)\b/i);
    return match ? clean(match[1], 100).replace(/^(?:a|an|the)\s+/i, "") : "";
  }).filter(Boolean);
}

function normalizeOwnershipObject(value) {
  let object = canonicalText(value).trim();
  object = object.replace(/\s+(?:that|which)\b.*$/i, "");
  object = object.replace(/\s+(?:at|in|on|with|from|for|inside|outside|near|around|by)\b.*$/i, "");
  object = object.replace(/\b(?:video\s+game|gaming|home)\s+(console|system|unit|device|machine)\b/gi, "$1");
  return clean(object, 140);
}

function normalizeHarmlessOwnershipSurface(surface) {
  const normalize = (_match, prefix, object) => `${prefix}${normalizeOwnershipObject(object)}`;
  return canonicalText(surface)
    .replace(OWN_ASSERTION, normalize)
    .replace(HAVE_ASSERTION, normalize);
}

function retryOwnershipAdjunct(evaluation, args) {
  if (evaluation?.ok || evaluation?.reason !== "missing-polarity") return evaluation;
  const evidence = evaluation?.evidence || {};
  if (!evidence.review70OwnershipMismatch && !evidence.review70OwnershipAllocation) return evaluation;
  const surface = args?.lines?.[0]?.text || "";
  const normalized = normalizeHarmlessOwnershipSurface(surface);
  if (!normalized || normalized === canonicalText(surface)) return evaluation;
  const retry = evaluateReview77Voice({
    ...args,
    lines: [{ ...(args?.lines?.[0] || {}), text: normalized }, ...(args?.lines || []).slice(1)]
  });
  if (!retry?.ok) return evaluation;
  return {
    ...evaluation,
    ok: true,
    reason: "recognized-obligations-covered",
    evidence: { ...evidence, review78OwnershipAdjunctNormalized: normalized }
  };
}

function normalizePricePhrase(value) {
  return clean(value).toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/\s+(?:at\s+launch|at\s+retail|when\s+new|when\s+used)$/i, "")
    .replace(/\s+/g, " ").trim();
}

function safePricePhrase(value) {
  const phrase = normalizePricePhrase(value);
  if (!phrase) return true;
  const hardware = new RegExp(`^${SAFE_HARDWARE}(?:\\s+${PRICE_QUALIFIER})?$`, "i");
  const qualifier = new RegExp(`^${PRICE_QUALIFIER}$`, "i");
  return hardware.test(phrase) || qualifier.test(phrase);
}

function classifyPriceBindings(surface, model) {
  const modelPattern = phraseRegex(model);
  const money = new RegExp(MONEY, "i");
  let valid = false;
  let unsafe = false;

  for (const rawClause of responseClauses(surface)) {
    const clause = canonicalText(rawClause).toLowerCase();

    const leading = clause.match(new RegExp(`(?:^(?:(?:a|an|the)\\s+)?|\\b(?:a|an|the)\\s+)(?<head>[a-z][a-z0-9'-]*(?:\\s+[a-z][a-z0-9'-]*){0,4})\\s+for\\s+(?:the\\s+)?${modelPattern}\\b`, "i"));
    if (leading && money.test(clause)) {
      if (safePricePhrase(leading.groups?.head || "")) valid = true;
      else {
        unsafe = true;
        continue;
      }
    }

    const reverse = clause.match(new RegExp(`${MONEY}\\s+(?:for|of|on)\\s+(?:the|a|an)?\\s*${modelPattern}(?<tail>(?:\\s+[a-z][a-z0-9'-]*){0,6})\\s*$`, "i"));
    if (reverse) {
      if (safePricePhrase(reverse.groups?.tail || "")) valid = true;
      else unsafe = true;
    }

    const forward = clause.match(new RegExp(`\\b${modelPattern}(?<tail>(?:\\s+[a-z][a-z0-9'-]*){0,6})\\s+${PRICE_VERB}\\s*${MONEY}`, "i"));
    if (forward) {
      if (safePricePhrase(forward.groups?.tail || "")) valid = true;
      else unsafe = true;
    }
  }

  return { valid, unsafe };
}

function validatePriceBindings(evaluation, question, surface) {
  if (!evaluation?.enforced) return evaluation;
  const models = extractPriceModels(question);
  if (!models.length) return evaluation;
  const bindings = models.map((model) => ({ model, ...classifyPriceBindings(surface, model) }));

  if (evaluation?.ok) {
    const bad = bindings.filter((row) => row.unsafe && !row.valid);
    if (!bad.length) return evaluation;
    return {
      ...evaluation,
      ok: false,
      reason: "missing-price",
      evidence: { ...(evaluation.evidence || {}), review79UnsafePriceSubject: bad.map((row) => row.model) }
    };
  }

  const oldUnsafe = evaluation?.evidence?.review70UnsafePriceBinding;
  if (evaluation?.reason === "missing-price" && oldUnsafe && bindings.every((row) => row.valid)) {
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), review79SafePriceQualifierRepaired: bindings.map((row) => row.model) }
    };
  }
  return evaluation;
}

export function evaluatePrimaryHumanVoice(args = {}) {
  let evaluation = evaluateReview77Voice(args);
  evaluation = retryOwnershipAdjunct(evaluation, args);
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  evaluation = validatePriceBindings(evaluation, question, surface);
  return evaluation;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
