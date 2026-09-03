import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateReview81Voice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_review81_base.js";

const MONEY = "(?:[$£€¥]\\s*\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?\\s*(?:bucks?|dollars?|usd)\\b)";
const SAFE_HARDWARE = "(?:(?:(?:video\\s+game|gaming|home)\\s+)?(?:console|system|unit|device|machine))";
const PRICE_QUALIFIER = "(?:(?:(?:launch|retail|list|original|new|used|street|sale|asking|current|average)\\s+)?(?:price|cost)|msrp)";
const PRICE_VERB = "(?:is|was|were|costs?|cost|went\\s+for|goes?\\s+for|sells?\\s+for|sold\\s+for|priced\\s+at|worth|:|-)";
const SIMPLE_MODEL_DETERMINER = "(?:the|a|an|my|your|his|her|our|their|its|this|that|these|those)";
const NAMED_POSSESSIVE = "(?:(?:(?:[a-z][a-z0-9-]*\\s+){0,2}[a-z][a-z0-9-]*'s)\\s+)";
const MODEL_DETERMINER = `(?:(?:${SIMPLE_MODEL_DETERMINER}\\s+)?(?:${NAMED_POSSESSIVE})*)`;
const RELATION_MODIFIERS = "(?:\\s+[a-z][a-z0-9'-]*){0,4}";
const PRICE_RELATION = `(?:for\\s+use\\s+with|compatible\\s+with|(?:made|designed|intended|built)${RELATION_MODIFIERS}\\s+(?:for|to\\s+(?:work|use)\\s+with)|works?${RELATION_MODIFIERS}\\s+with|used${RELATION_MODIFIERS}\\s+with|with|on|of|for)`;

function clean(value, max = 900) {
  return String(value || "").replace(/\\s+/g, " ").trim().slice(0, max);
}

function canonicalText(value) {
  return clean(value)
    .replace(/[’]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\\bdon't\\b/gi, "do not")
    .replace(/\\bdont\\b/gi, "do not")
    .replace(/\\bdoesn't\\b/gi, "does not")
    .replace(/\\bdoesnt\\b/gi, "does not")
    .replace(/\\bdidn't\\b/gi, "did not")
    .replace(/\\bdidnt\\b/gi, "did not")
    .replace(/\\bps[\\s-]*([0-9]+)\\b/gi, "playstation $1")
    .replace(/\\bplaystation[\\s-]*([0-9]+)\\b/gi, "playstation $1");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
}

function phraseRegex(value) {
  return escapeRegex(canonicalText(value).toLowerCase().trim()).replace(/\\\\ /g, "\\s+");
}

function responseClauses(value) {
  return canonicalText(value).split(/(?:[,;.!?]+|\\b(?:and|but|though|tho|or|plus|while|whereas)\\b)/i)
    .map((part) => part.trim()).filter(Boolean);
}

function extractPriceModels(question) {
  return canonicalText(question).split(/(?:[,;?]+|\\band\\b)/i).map((clause) => clause.trim()).map((clause) => {
    const match = clause.match(/\\b(?:how much did|how much does|how much do|what did|what does|what was|what is)\\s+(?:the\\s+)?(.+?)\\s+(?:cost|costs|go\\s+for|sell\\s+for|worth)\\b/i);
    return match ? clean(match[1], 100).replace(/^(?:a|an|the)\\s+/i, "") : "";
  }).filter(Boolean);
}

function normalizePricePhrase(value) {
  return clean(value).toLowerCase()
    .replace(/^\\s*(?:(?:for|on|of|with|into|toward|towards)\\s+)+/i, "")
    .replace(/^\\s*(?:(?:a|an|the|my|your|his|her|our|their|its|this|that|these|those)\\s+)+/i, "")
    .replace(/'s\\b/g, "")
    .replace(/\\s+(?:at\\s+launch|at\\s+retail|when\\s+new|when\\s+used)$/i, "")
    .replace(/\\s+/g, " ").trim();
}

function safePricePhrase(value) {
  const phrase = normalizePricePhrase(value);
  if (!phrase) return true;
  const hardware = new RegExp(`^${SAFE_HARDWARE}(?:\\s+${PRICE_QUALIFIER})?$`, "i");
  const qualifier = new RegExp(`^${PRICE_QUALIFIER}$`, "i");
  return hardware.test(phrase) || qualifier.test(phrase);
}

function relationHead(prefix) {
  let phrase = canonicalText(prefix).toLowerCase().trim();
  if (!phrase) return "";
  const pieces = phrase.split(/\\b(?:and|but|though|tho|or|plus|while|whereas)\\b/i);
  phrase = clean(pieces[pieces.length - 1] || "").toLowerCase();

  const money = new RegExp(MONEY, "gi");
  let match;
  let lastMoney = null;
  while ((match = money.exec(phrase))) lastMoney = match;
  if (lastMoney) phrase = phrase.slice(lastMoney.index + lastMoney[0].length);

  return normalizePricePhrase(phrase);
}

function relationBindings(clause, modelPattern) {
  const bindings = [];
  const relation = new RegExp(`(?<relation>${PRICE_RELATION})\\s+${MODEL_DETERMINER}(?<model>${modelPattern})\\b`, "gi");
  let match;
  while ((match = relation.exec(clause))) {
    const head = relationHead(clause.slice(0, match.index));
    if (!head) continue;
    const modelText = match.groups?.model || "";
    const modelOffset = match[0].lastIndexOf(modelText);
    const modelStart = match.index + Math.max(0, modelOffset);
    bindings.push({
      head,
      safe: safePricePhrase(head),
      modelStart,
      modelEnd: modelStart + modelText.length
    });
  }
  return bindings;
}

function overlapsUnsafeModel(modelStart, modelEnd, relations) {
  return relations.some((row) => !row.safe && modelStart < row.modelEnd && modelEnd > row.modelStart);
}

function classifyPriceBindings(surface, model) {
  const modelPattern = phraseRegex(model);
  let valid = false;
  let unsafe = false;

  for (const rawClause of responseClauses(surface)) {
    const clause = canonicalText(rawClause).toLowerCase();
    const relations = relationBindings(clause, modelPattern);
    const clauseHasMoney = new RegExp(MONEY, "i").test(clause);

    for (const relation of relations) {
      if (relation.safe) {
        if (clauseHasMoney) valid = true;
      } else {
        unsafe = true;
      }
    }

    const reverse = new RegExp(`${MONEY}\\s+(?:for|of|on)\\s+${MODEL_DETERMINER}(?<model>${modelPattern})(?<tail>(?:\\s+[a-z][a-z0-9'-]*){0,8})\\s*$`, "gi");
    let match;
    while ((match = reverse.exec(clause))) {
      if (safePricePhrase(match.groups?.tail || "")) valid = true;
      else unsafe = true;
    }

    const compound = new RegExp(`\\b(?<model>${modelPattern})-(?<tail>[a-z][a-z0-9'-]*(?:\\s+[a-z][a-z0-9'-]*){0,8})\\s+${PRICE_VERB}\\s*${MONEY}`, "gi");
    while ((match = compound.exec(clause))) {
      if (safePricePhrase(match.groups?.tail || "")) valid = true;
      else unsafe = true;
    }

    const forward = new RegExp(`\\b(?<model>${modelPattern})(?<tail>(?:\\s+[a-z][a-z0-9'-]*){0,8})\\s+${PRICE_VERB}\\s*${MONEY}`, "gi");
    while ((match = forward.exec(clause))) {
      const modelText = match.groups?.model || "";
      const modelStart = match.index;
      const modelEnd = modelStart + modelText.length;
      if (overlapsUnsafeModel(modelStart, modelEnd, relations)) {
        unsafe = true;
        continue;
      }
      if (safePricePhrase(match.groups?.tail || "")) valid = true;
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
      evidence: { ...(evaluation.evidence || {}), review82to85UnsafePriceSubject: bad.map((row) => row.model) }
    };
  }

  if (evaluation?.reason === "missing-price" && bindings.every((row) => row.valid)) {
    return {
      ...evaluation,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: { ...(evaluation.evidence || {}), review85SafePriceBindingRepaired: bindings.map((row) => row.model) }
    };
  }
  return evaluation;
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const evaluation = evaluateReview81Voice(args);
  const surface = args?.lines?.[0]?.text || "";
  const question = args?.human?.text || "";
  return validatePriceBindings(evaluation, question, surface);
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
