import assert from "node:assert/strict";
import fs from "node:fs";
import {
  emergencyWorkersBrainEligible,
  isRequestLocalProviderFailure
} from "../src/provider_failover_v37.js";

assert.equal(isRequestLocalProviderFailure(400), true);
assert.equal(isRequestLocalProviderFailure(413), true);
assert.equal(isRequestLocalProviderFailure(422), true);
assert.equal(isRequestLocalProviderFailure(429), false, "rate limits must remain provider-health events");
assert.equal(isRequestLocalProviderFailure(500), false);
assert.equal(isRequestLocalProviderFailure(401), false);

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: ["gemini"],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true
}), false, "Workers AI must not join normal structured routing");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 0,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true
}), false, "emergency fallback is Brain-only");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq"],
  workersHardReady: true
}), false, "Workers AI must be configured");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: false
}), false, "hard provider cooldown still wins");

assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true
}), true, "Workers AI should restore a model Brain only when preferred providers are unavailable");

const hotfix = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
assert.ok(hotfix.includes("isRequestLocalProviderFailure(status)"));
assert.ok(hotfix.includes("return super.noteProviderFailure(provider, status, response, detail)"));
assert.ok(hotfix.includes("HTTP ${Number(status)} request rejected"));
assert.ok(hotfix.includes("structuredBrainDepth: this.v35StructuredBrainDepth"));
assert.ok(hotfix.includes('return ["workers-ai"]'));
assert.ok(hotfix.includes("rateLimitRetryAfterPreserved: true"));
assert.ok(hotfix.includes("liveAiShadowPausedForProviderStability: true"));
assert.equal(hotfix.includes("SHADOW_MIN_INTERVAL_MS = 0"), false);

console.log("v37 production provider failover regression checks passed");
