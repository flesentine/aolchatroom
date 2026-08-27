import assert from "node:assert/strict";
import fs from "node:fs";
import {
  degradedBuiltInFallbackEligible,
  effectiveStructuredProviders,
  emergencyWorkersBrainEligible,
  isRequestLocalProviderFailure
} from "../src/provider_failover_v37.js";

const configured = ["gemini", "groq", "workers-ai"];

const workersEmergency = effectiveStructuredProviders({
  configuredProviders: configured,
  hardReadyProviders: ["workers-ai"],
  softReadyProviders: ["workers-ai"]
});
assert.deepEqual(workersEmergency, ["workers-ai"]);
assert.equal(degradedBuiltInFallbackEligible({
  configuredProviders: configured,
  effectiveReadyProviders: workersEmergency
}), false, "healthy emergency Workers AI means the structured pool is degraded but still usable");

const nothingEffective = effectiveStructuredProviders({
  configuredProviders: configured,
  hardReadyProviders: ["workers-ai"],
  softReadyProviders: []
});
assert.deepEqual(nothingEffective, []);
assert.equal(degradedBuiltInFallbackEligible({
  configuredProviders: configured,
  effectiveReadyProviders: nothingEffective
}), true, "no actually usable structured provider must activate built-in degraded mode");

assert.equal(degradedBuiltInFallbackEligible({
  configuredProviders: configured,
  effectiveReadyProviders: ["gemini"]
}), false);
assert.equal(degradedBuiltInFallbackEligible({ configuredProviders: [], effectiveReadyProviders: [] }), false);

assert.equal(isRequestLocalProviderFailure(400), true);
assert.equal(isRequestLocalProviderFailure(413), true);
assert.equal(isRequestLocalProviderFailure(422), true);
assert.equal(isRequestLocalProviderFailure(429), false);
assert.equal(emergencyWorkersBrainEligible({
  orderedProviders: [],
  structuredBrainDepth: 1,
  configuredProviders: configured,
  workersHardReady: true,
  workersSoftReady: true
}), true);

const hotfix = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
const legacyProviderLayer = fs.readFileSync(new URL("../src/index_v19_2_live.js", import.meta.url), "utf8");

assert.ok(legacyProviderLayer.includes("AI waiting · provider retry in ~"));
assert.ok(legacyProviderLayer.includes("this.pendingHumans.length && this.configuredProviders().length && !this.hasReadyAi(now)"));

assert.ok(hotfix.includes('ChatRoom as ContinuityFallbackChatRoom'));
assert.ok(hotfix.includes("effectiveStructuredReadyProviders"));
assert.ok(hotfix.includes("providerPoolDegraded"));
assert.ok(hotfix.includes("ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)"));
assert.ok(hotfix.includes("ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this)"));
assert.ok(hotfix.includes("AI degraded · built-in fallback active · provider retry in ~"));
assert.ok(hotfix.includes("degradedHumanFallbacksQueued"));
assert.ok(hotfix.includes("degradedAmbientFallbacksQueued"));
assert.ok(hotfix.includes("providerDegradedModeBuiltInFallback: true"));
assert.ok(hotfix.includes("effectiveStructuredProviderReadiness: true"));
assert.ok(hotfix.includes("liveAiShadowPausedForProviderStability: true"));

console.log("v37 degraded provider-mode fallback regression checks passed");
