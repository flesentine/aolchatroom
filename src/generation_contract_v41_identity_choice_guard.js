import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateReview81Voice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_review81_base.js";

const LONG_RELATION_TO_PS = /(?:compatible\s+with|(?:made|designed|built|intended)(?:\s+[a-z][a-z0-9'-]*){0,6}\s+(?:for|to\s+(?:work|use)\s+with)|works?(?:\s+[a-z][a-z0-9'-]*){0,6}\s+with|used(?:\s+[a-z][a-z0-9'-]*){0,6}\s+with|for|with)\s+(?=(?:(?:the|a|an|my|your|his|her|our|their|this|that|these|those)\s+)?(?:playstation|ps)\s*\d+\b)/gi;
const LONG_HEAD_BOUNDARIES = new Set([
  "a", "an", "the", "my", "your", "his", "her", "our", "their",
  "this", "that", "these", "those", "for", "of", "on", "with",
  "to", "from", "at", "by"
]);

function clean(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeNamedModelPossessives(value) {
  return value.replace(
    /\b(?:(?:[a-z][a-z0-9-]*'s)\s+)+(?=(?:playstation|ps)\s*\d+\b)/gi,
    "my "
  );
}

function normalizeLongPeripheralRelations(value) {
  const edits = [];
  LONG_RELATION_TO_PS.lastIndex = 0;
  let relation;
  while ((relation = LONG_RELATION_TO_PS.exec(value))) {
    const before = value.slice(0, relation.index);
    const tail = /([a-z][a-z0-9'-]*(?:\s+[a-z][a-z0-9'-]*){5,})\s*$/i.exec(before);
    if (!tail) continue;

    const phrase = tail[1];
    const words = [...phrase.matchAll(/[a-z][a-z0-9'-]*/gi)];
    let boundary = -1;
    for (let index = words.length - 2; index >= 0; index -= 1) {
      const word = words[index][0].toLowerCase();
      if (LONG_HEAD_BOUNDARIES.has(word) || word.endsWith("'s")) {
        boundary = index;
        break;
      }
    }

    const nounWords = words.slice(boundary + 1);
    if (nounWords.length <= 5) continue;
    const firstNoun = nounWords[0];
    const head = nounWords[nounWords.length - 1]?.[0] || "";
    if (!head) continue;

    edits.push({
      start: tail.index + firstNoun.index,
      end: relation.index + relation[0].length,
      replacement: `${head} for `
    });
  }

  let normalized = value;
  for (const edit of edits.reverse()) {
    normalized = normalized.slice(0, edit.start) + edit.replacement + normalized.slice(edit.end);
  }
  return normalized;
}

function normalizeReview82to87Surface(value) {
  let surface = clean(value)
    .replace(/[’]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\bplaystation\s*-\s*(\d+)\b/gi, "PlayStation $1")
    .replace(/\bps\s*-\s*(\d+)\b/gi, "PS $1")
    .replace(/\s+\b(?:while|whereas|alongside)\b\s+/gi, "; ");
  surface = normalizeNamedModelPossessives(surface);
  surface = normalizeLongPeripheralRelations(surface);
  return clean(surface);
}

function evaluateWithSurface(args, surface) {
  return evaluateReview81Voice({
    ...args,
    lines: [{ ...(args?.lines?.[0] || {}), text: surface }, ...(args?.lines || []).slice(1)]
  });
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const original = evaluateReview81Voice(args);
  if (!original?.enforced) return original;

  const surface = args?.lines?.[0]?.text || "";
  const normalized = normalizeReview82to87Surface(surface);
  if (!normalized || normalized === clean(surface)) return original;

  const normalizedEvaluation = evaluateWithSurface(args, normalized);

  if (original.ok && !normalizedEvaluation.ok && normalizedEvaluation.reason === "missing-price") {
    return {
      ...original,
      ok: false,
      reason: "missing-price",
      evidence: {
        ...(original.evidence || {}),
        review82to87NormalizedUnsafePriceBinding: normalized
      }
    };
  }

  if (!original.ok && original.reason === "missing-price" && normalizedEvaluation.ok) {
    return {
      ...original,
      ok: true,
      reason: "recognized-obligations-covered",
      evidence: {
        ...(original.evidence || {}),
        review85to87NormalizedSafePriceBinding: normalized
      }
    };
  }

  return original;
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
