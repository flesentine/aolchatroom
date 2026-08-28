export const LIVELY_AMBIENT_MIN_LINES = 3;
export const LIVELY_AMBIENT_MAX_LINES = 5;
export const LIVELY_AMBIENT_ONE_PROVIDER_INTERVAL_MS = 60000;
export const LIVELY_AMBIENT_TWO_PROVIDER_INTERVAL_MS = 45000;
export const LIVELY_AMBIENT_THREE_PLUS_INTERVAL_MS = 35000;

export function livelyAmbientIntervalMs(readyPreferredCount = 0) {
  const count = Number(readyPreferredCount || 0);
  if (count >= 3) return LIVELY_AMBIENT_THREE_PLUS_INTERVAL_MS;
  if (count === 2) return LIVELY_AMBIENT_TWO_PROVIDER_INTERVAL_MS;
  if (count === 1) return LIVELY_AMBIENT_ONE_PROVIDER_INTERVAL_MS;
  return Infinity;
}

export function livelyAmbientEligible({
  now = Date.now(),
  readyPreferredCount = 0,
  lastAmbientAiAt = 0,
  pendingHumanCount = 0,
  aiQueueLength = 0
} = {}) {
  if (Number(pendingHumanCount || 0) > 0) return { ok: false, reason: "human-pending" };
  if (Number(aiQueueLength || 0) > 0) return { ok: false, reason: "queue-not-empty" };
  const intervalMs = livelyAmbientIntervalMs(readyPreferredCount);
  if (!Number.isFinite(intervalMs)) return { ok: false, reason: "no-preferred-provider" };
  if (Number(lastAmbientAiAt || 0) && Number(now || 0) - Number(lastAmbientAiAt || 0) < intervalMs) {
    return { ok: false, reason: "ambient-rate-limit", intervalMs };
  }
  return { ok: true, reason: "ready", intervalMs };
}
