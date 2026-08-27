import assert from "node:assert/strict";
import fs from "node:fs";
import {
  effectiveStructuredProviders,
  emergencyWorkersBrainEligible,
  isRequestLocalProviderFailure,
  isWorkersAiDailyQuotaExhaustion,
  nextUtcDailyQuotaResetAt
} from "../src/provider_failover_v37.js";

assert.equal(isRequestLocalProviderFailure(400), true);
assert.equal(isRequestLocalProviderFailure(413), true);
assert.equal(isRequestLocalProviderFailure(422), true);
assert.equal(isRequestLocalProviderFailure(429), false, "rate limits must remain provider-health events");
assert.equal(isRequestLocalProviderFailure(500), false);
assert.equal(isRequestLocalProviderFailure(401), false);

assert.equal(isWorkersAiDailyQuotaExhaustion(
  "workers-ai",
  "4006: you have used up your daily free allocation of 10,000 neurons, please upgrade"
), true, "Workers AI daily free-allocation exhaustion must be recognized even when surfaced as an SDK error");
assert.equal(isWorkersAiDailyQuotaExhaustion("workers-ai", "3040: out of capacity"), false);
assert.equal(isWorkersAiDailyQuotaExhaustion("gemini", "used up your daily free allocation of 10,000 neurons"), false);
assert.equal(
  nextUtcDailyQuotaResetAt(Date.UTC(2026, 7, 27, 5, 14, 44)),
  Date.UTC(2026, 7, 28, 0, 0, 0),
  "Workers AI daily quota must remain suppressed until the documented 00:00 UTC reset"
);

assert.deepEqual(effectiveStructuredProviders({
  configuredProviders: ["gemini", "groq", "workers-ai"],
  hardReadyProviders: ["gemini", "workers-ai"],
  softReadyProviders: ["gemini", "workers-ai"]
}), ["gemini"], "normal structured routing must prefer Gemini/Groq over Workers AI");

assert.deepEqual(effectiveStructuredProviders({
  configuredProviders: ["gemini", "groq", "workers-ai"],
  hardReadyProviders: ["workers-ai"],
  softReadyProviders: ["workers-ai"]
}), ["workers-ai"], "Workers AI is an effective emergency structured provider when both preferred providers cool");

assert.deepEqual(effectiveStructuredProviders({
  configuredProviders: ["gemini", "groq", "workers-ai"],
  hardReadyProviders: ["workers-ai"],
  softReadyProviders: []
}), [], "soft-suppressed Workers AI is not actually usable structured capacity");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: ["gemini"],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true,
  workersSoftReady: true
}), false, "Workers AI must not join normal structured routing");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 0,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true,
  workersSoftReady: true
}), false, "emergency fallback is structured-generation-only");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq"],
  workersHardReady: true,
  workersSoftReady: true
}), false, "Workers AI must be configured");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: false,
  workersSoftReady: true
}), false, "hard provider cooldown still wins");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true,
  workersSoftReady: false
}), false, "soft provider suppression also blocks emergency reuse");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true,
  workersSoftReady: true
}), true, "Workers AI should restore a model Brain only when preferred providers are unavailable");

const hotfix = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
const v35Followup = fs.readFileSync(new URL("../src/v35_followup.js", import.meta.url), "utf8");
assert.ok(hotfix.includes("isRequestLocalProviderFailure(status)"));
assert.ok(hotfix.includes("isWorkersAiDailyQuotaExhaustion(provider, detail)"));
assert.ok(hotfix.includes("nextUtcDailyQuotaResetAt(now)"));
assert.ok(hotfix.includes("workersDailyQuotaExhaustions"));
assert.ok(hotfix.includes("workersAiDailyQuotaResetAt"));
assert.ok(hotfix.includes("this.providerCooldownUntil.set"));
assert.ok(hotfix.includes("return super.noteProviderFailure(provider, status, response, detail)"));
assert.ok(hotfix.includes("HTTP ${Number(status)} request rejected"));
assert.ok(v35Followup.includes("this.v35StructuredGenerationDepth"), "v35 canonical structured-depth field must remain discoverable");
assert.ok(hotfix.includes("structuredBrainDepth: this.v35StructuredGenerationDepth"), "v37 must use the actual v35 structured-depth field");
assert.equal(hotfix.includes("v35StructuredBrainDepth"), false, "the stale/nonexistent depth field must never return");
assert.ok(hotfix.includes('return ["workers-ai"]'));
assert.ok(hotfix.includes("effectiveStructuredReadyProviders"));
assert.ok(hotfix.includes("rateLimitRetryAfterPreserved: true"));
assert.ok(hotfix.includes("liveAiShadowPausedForProviderStability: true"));
assert.equal(hotfix.includes("SHADOW_MIN_INTERVAL_MS = 0"), false);

console.log("v37 production provider failover regression checks passed");
