import { ambientAiIntervalMs } from "./adaptive_ambient_policy_v37.js";

export const V37_HUMAN_ONLY_COMPAT_MODE = Object.freeze({
  humanOnlyModelBudget: false,
  ambientModelGenerationDisabled: false,
  adaptiveAmbientAi: true,
  ambientSingleProviderAttempt: true,
  ambientSingleCallExchange: true,
  humanModelFailureFallsBackBuiltIn: true
});

export function initializeV37HumanOnlyDiagnostics(room) {
  room.v37LastAmbientAiAt = 0;
  room.v37AdaptiveAmbientStats = {
    ambientAiAttempts: 0,
    ambientAiSuccesses: 0,
    ambientAiFailures: 0,
    ambientAiOutputRejects: 0,
    ambientAiLines: 0,
    ambientBuiltInPlansGenerated: 0,
    ambientAiRateSkips: 0,
    ambientAiHumanPrioritySkips: 0
  };
  return room.v37AdaptiveAmbientStats;
}

export function mergeV37HumanOnlyStatus(data) {
  return {
    ...data,
    v37: {
      ...(data?.v37 || {}),
      ...V37_HUMAN_ONLY_COMPAT_MODE
    }
  };
}

export function mergeV37HumanOnlySnapshot(room, base) {
  const preferred = room.preferredStructuredReadyProviders?.(Date.now()) || [];
  return {
    ...base,
    mode: {
      ...(base?.mode || {}),
      ...V37_HUMAN_ONLY_COMPAT_MODE
    },
    adaptiveAmbientAi: {
      ...(room.v37AdaptiveAmbientStats || {}),
      humanModelFallbacks: Number(room.v37HumanFallbackStats?.humanModelFallbacks || 0),
      humanModelFallbackMisses: Number(room.v37HumanFallbackStats?.humanModelFallbackMisses || 0),
      preferredReadyProviders: preferred,
      nextIntervalMs: ambientAiIntervalMs(preferred.length),
      lastAmbientAiAgoMs: room.v37LastAmbientAiAt ? Math.max(0, Date.now() - room.v37LastAmbientAiAt) : null,
      policy: "one provider attempt creates a two-line AI bot exchange; built-in chatter fills between calls; humans remain priority"
    }
  };
}
