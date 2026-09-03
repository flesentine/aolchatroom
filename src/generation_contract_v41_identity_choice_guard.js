import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateReview81Voice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_review81_base.js";

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
  return value.replace(
    /\b(a|an|the|my|your|his|her|our|their)\s+((?:[a-z][a-z0-9'-]*\s+){5,}[a-z][a-z0-9'-]*)\s+(?:compatible\s+with|(?:made|designed|built|intended)(?:\s+[a-z][a-z0-9'-]*){0,6}\s+(?:for|to\s+(?:work|use)\s+with)|works?(?:\s+[a-z][a-z0-9'-]*){0,6}\s+with|used(?:\s+[a-z][a-z0-9'-]*){0,6}\s+with|for|with)\s+(?=(?:(?:the|a|an|my|your|his|her|our|their)\s+)?(?:playstation|ps)\s*\d+\b)/gi,
    (_match, determiner, phrase) => {
      const words = clean(phrase).split(/\s+/);
      const head = words[words.length - 1] || phrase;
      return `${determiner} ${head} for `;
    }
  );
}

function normalizeReview82to85Surface(value) {
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
  const normalized = normalizeReview82to85Surface(surface);
  if (!normalized || normalized === clean(surface)) return original;

  const normalizedEvaluation = evaluateWithSurface(args, normalized);

  if (original.ok && !normalizedEvaluation.ok && normalizedEvaluation.reason === "missing-price") {
    return {
      ...original,
      ok: false,
      reason: "missing-price",
      evidence: {
        ...(original.evidence || {}),
        review82to84NormalizedUnsafePriceBinding: normalized
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
        review85NormalizedSafePriceBinding: normalized
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
