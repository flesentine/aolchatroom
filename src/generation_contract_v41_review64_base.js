import {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice as evaluateIdentityBaseVoice,
  humanReplanPrimaryObligation
} from "./generation_contract_v41_identity_choice_guard_base.js";
import { evaluatePrimaryHumanVoice as evaluateReviewVoice } from "./generation_contract_v41_review_guard_base.js";

const LEADING_OWNERSHIP_DENIAL = /^\s*(?:no|nah|nope|not really|never)\s*$/i;
const EMPHATIC_OWNERSHIP_VERB = /\b(i|we|he|she|they)\s+((?:(?:do|does|really|actually|definitely|absolutely|certainly|personally|still|currently)\s+){1,4})(own|owns|owned)\b/gi;
const ANY_OWNERSHIP_VERB = /\b(i|we|he|she|they)\s+((?:(?:do|does|really|actually|definitely|absolutely|certainly|personally|still|currently)\s+){0,4})(own|owns|owned)\b/gi;

function clean(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function responseClauses(value) {
  return clean(value)
    .split(/(?:[,;.!?]+|\b(?:and|but|though|tho|or|plus)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeEmphaticOwnership(surface) {
  return clean(surface).replace(EMPHATIC_OWNERSHIP_VERB, (_match, subject, _modifiers, verb) => `${subject} ${verb}`);
}

function normalizeLines(args = {}) {
  const lines = Array.isArray(args?.lines)
    ? args.lines.map((line) => ({ ...line, text: normalizeEmphaticOwnership(line?.text) }))
    : args?.lines;
  return { ...args, lines };
}

function hasLeadingOwnershipDenial(evaluation, surface) {
  if (!evaluation?.enforced || !evaluation?.ok) return false;
  const polarity = evaluation?.contract?.polarityObligations || [];
  const firstOwnership = polarity.findIndex((row) => row?.scope === "ownership");
  if (firstOwnership !== 0) return false;
  return LEADING_OWNERSHIP_DENIAL.test(responseClauses(surface)[0] || "");
}

function neutralizeExtraOwnershipAssertions(surface) {
  return clean(surface).replace(ANY_OWNERSHIP_VERB, (_match, subject, modifiers) => `${subject} ${modifiers || ""}collect`);
}

export function evaluatePrimaryHumanVoice(args = {}) {
  const originalSurface = args?.lines?.[0]?.text || "";
  const normalizedArgs = normalizeLines(args);
  const baseEvaluation = evaluateIdentityBaseVoice(normalizedArgs);
  if (!hasLeadingOwnershipDenial(baseEvaluation, originalSurface)) return evaluateReviewVoice(normalizedArgs);

  const lines = Array.isArray(normalizedArgs?.lines)
    ? normalizedArgs.lines.map((line, index) => index === 0
      ? { ...line, text: neutralizeExtraOwnershipAssertions(line?.text) }
      : line)
    : normalizedArgs?.lines;
  return evaluateReviewVoice({ ...normalizedArgs, lines });
}

export {
  buildPrimaryHumanVoiceContract,
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
};
