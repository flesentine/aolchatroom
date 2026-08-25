export const ROOM_ALARM_EPSILON_MS = 350;
export const ROOM_ALARM_MIN_DELAY_MS = 250;

export function desiredRoomAlarm({ now = Date.now(), nextBotAt = 0, humanCount = 0 } = {}) {
  if (Number(humanCount || 0) <= 0) return null;
  const target = Number(nextBotAt || 0);
  if (!Number.isFinite(target) || target <= 0) return now + ROOM_ALARM_MIN_DELAY_MS;
  return Math.max(now + ROOM_ALARM_MIN_DELAY_MS, target);
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
