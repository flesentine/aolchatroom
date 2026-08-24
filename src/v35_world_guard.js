import {
  publicWorldViolation,
  relativeDateCandidates,
  speakerTemporalContext
} from "./world_model.js";
import { auditWorldHistory } from "./world_audit.js";

export { publicWorldViolation, relativeDateCandidates, speakerTemporalContext };

export function auditPublicHistory(history, culture, floor = 0, speakerResolver = null) {
  return auditWorldHistory(history || [], culture || {}, floor, speakerResolver);
}

export function v35Grade(score) {
  if (score >= 94) return "A";
  if (score >= 88) return "A-";
  if (score >= 82) return "B+";
  if (score >= 76) return "B";
  if (score >= 70) return "B-";
  if (score >= 63) return "C+";
  if (score >= 56) return "C";
  if (score >= 48) return "D";
  return "F";
}
