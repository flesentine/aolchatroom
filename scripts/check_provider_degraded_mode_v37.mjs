import assert from "node:assert/strict";
import fs from "node:fs";
import {
  degradedBuiltInFallbackEligible,
  emergencyWorkersBrainEligible,
  isRequestLocalProviderFailure
} from "../src/provider_failover_v37.js";

assert.equal(degradedBuiltInFallbackEligible({
  configuredProviders: ["gemini", "groq", "workers-ai"],
  hardReadyProviders: []
}), true);
assert.equal(degradedBuiltInFallbackEligible({
  configuredProviders: ["gemini", "groq", "workers-ai"],
  hardReadyProviders: ["gemini"]
}), false);
assert.equal(degradedBuiltInFallbackEligible({ configuredProviders: [], hardReadyProviders: [] }), false);

assert.equal(isRequestLocalProviderFailure(400), true);
assert.equal(isRequestLocalProviderFailure(413), true);
assert.equal(isRequestLocalProviderFailure(422), true);
assert.equal(isRequestLocalProviderFailure(429), false);
assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: ["gemini", "groq", "workers-ai"],
  workersHardReady: true
}), true);

const hotfix = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
const legacyProviderLayer = fs.readFileSync(new URL("../src/index_v19_2_live.js", import.meta.url), "utf8");

// The historical source of the freeze remains visible in the inherited layer:
// pending human + no ready provider => status + immediate return.
assert.ok(legacyProviderLayer.includes("AI waiting · provider retry in ~"));
assert.ok(legacyProviderLayer.includes("this.pendingHumans.length && this.configuredProviders().length && !this.hasReadyAi(now)"));

// The production boundary must pre-queue the existing period-safe built-in path
// before that inherited early return can fire.
assert.ok(hotfix.includes('ChatRoom as ContinuityFallbackChatRoom'));
assert.ok(hotfix.includes("queueV37DegradedFallback"));
assert.ok(hotfix.includes("ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)"));
assert.ok(hotfix.includes("ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this)"));
assert.ok(hotfix.includes("AI degraded · built-in fallback active · provider retry in ~"));
assert.ok(hotfix.includes("degradedHumanFallbacksQueued"));
assert.ok(hotfix.includes("degradedAmbientFallbacksQueued"));
assert.ok(hotfix.includes("providerDegradedModeBuiltInFallback: true"));
assert.ok(hotfix.includes("liveAiShadowPausedForProviderStability: true"));

console.log("v37 degraded provider-mode fallback regression checks passed");
