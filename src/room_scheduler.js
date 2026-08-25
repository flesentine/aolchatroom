export const ROOM_ALARM_EPSILON_MS = 350;
export const ROOM_ALARM_MIN_DELAY_MS = 250;
export const ROOM_LIVENESS_FORCE_MS = 14000;
export const ROOM_LIVENESS_FORCE_COOLDOWN_MS = 7000;

export function desiredRoomAlarm({
  now = Date.now(),
  nextBotAt = 0,
  humanCount = 0,
  lastBotAt = 0,
  livenessMs = ROOM_LIVENESS_FORCE_MS
} = {}) {
  if (Number(humanCount || 0) <= 0) return null;
  const target = Number(nextBotAt || 0);
  let desired = !Number.isFinite(target) || target <= 0
    ? now + ROOM_ALARM_MIN_DELAY_MS
    : Math.max(now + ROOM_ALARM_MIN_DELAY_MS, target);

  const lastBot = Number(lastBotAt || 0);
  if (Number.isFinite(lastBot) && lastBot > 0) {
    const deadline = Math.max(now + ROOM_ALARM_MIN_DELAY_MS, lastBot + Math.max(1000, Number(livenessMs || ROOM_LIVENESS_FORCE_MS)));
    desired = Math.min(desired, deadline);
  }
  return desired;
}

export function shouldRescheduleAlarm(currentAlarm, desiredAlarm, epsilonMs = ROOM_ALARM_EPSILON_MS) {
  if (desiredAlarm == null) return currentAlarm != null;
  if (currentAlarm == null) return true;
  return Math.abs(Number(currentAlarm) - Number(desiredAlarm)) > epsilonMs;
}

export function staleAlarmAfterRecentTick({ now = Date.now(), nextBotAt = 0, lastTickAt = 0 } = {}) {
  if (!Number(lastTickAt || 0)) return false;
  return Number(nextBotAt || 0) > now + ROOM_ALARM_EPSILON_MS;
}

export function shouldForceLivenessTick({
  now = Date.now(),
  lastBotAt = 0,
  humanCount = 0,
  queueLength = 0,
  lastForcedAt = 0,
  livenessMs = ROOM_LIVENESS_FORCE_MS,
  cooldownMs = ROOM_LIVENESS_FORCE_COOLDOWN_MS
} = {}) {
  if (Number(humanCount || 0) <= 0) return false;
  if (Number(queueLength || 0) > 0) return false;
  const lastBot = Number(lastBotAt || 0);
  if (!Number.isFinite(lastBot) || lastBot <= 0) return true;
  if (now - lastBot < Math.max(1000, Number(livenessMs || ROOM_LIVENESS_FORCE_MS))) return false;
  const forcedAt = Number(lastForcedAt || 0);
  if (forcedAt > 0 && now - forcedAt < Math.max(1000, Number(cooldownMs || ROOM_LIVENESS_FORCE_COOLDOWN_MS))) return false;
  return true;
}
