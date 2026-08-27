export const AMBIENT_AI_ONE_PRIMARY_INTERVAL_MS = 90000;
export const AMBIENT_AI_TWO_PRIMARY_INTERVAL_MS = 45000;

export function ambientAiIntervalMs(readyPreferredCount = 0) {
  const count = Number(readyPreferredCount || 0);
  if (count >= 2) return AMBIENT_AI_TWO_PRIMARY_INTERVAL_MS;
  if (count === 1) return AMBIENT_AI_ONE_PRIMARY_INTERVAL_MS;
  return Infinity;
}

export function adaptiveAmbientAiEligible({
  now = Date.now(),
  readyPreferredCount = 0,
  lastAmbientAiAt = 0,
  pendingHumanCount = 0,
  aiQueueLength = 0
} = {}) {
  if (Number(pendingHumanCount || 0) > 0) return { ok: false, reason: "human-pending" };
  if (Number(aiQueueLength || 0) > 0) return { ok: false, reason: "queue-not-empty" };
  const intervalMs = ambientAiIntervalMs(readyPreferredCount);
  if (!Number.isFinite(intervalMs)) return { ok: false, reason: "no-preferred-provider" };
  if (Number(lastAmbientAiAt || 0) && Number(now || 0) - Number(lastAmbientAiAt || 0) < intervalMs) {
    return { ok: false, reason: "ambient-rate-limit", intervalMs };
  }
  return { ok: true, reason: "ready", intervalMs };
}
