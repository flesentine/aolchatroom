import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function ownsMethod(source, name) {
  return source.split("\n").some((line) =>
    line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`)
  );
}

const hotfix = read("src/index_v37_hotfix.js");
const humanOnly = read("src/index_v37_human_only.js");
const freeProviders = read("src/index_v41_free_providers_compat.js");
const frozenFreeProviders = read("src/index_v37_free_providers.js");
const humanDirector = read("src/index_v41_human_director_compat.js");
const frozenHumanDirector = read("src/index_v37_human_director.js");
const livelyAmbient = read("src/index_v41_lively_ambient_compat.js");
const frozenLivelyAmbient = read("src/index_v37_lively_ambient.js");
const qualityCompat = read("src/index_v41_quality_compat.js");

assert.ok(qualityCompat.includes('from "./index_v41_lively_ambient_compat.js"'));
assert.ok(livelyAmbient.includes('from "./index_v41_human_director_compat.js"'));
assert.ok(frozenLivelyAmbient.includes('from "./index_v37_human_director.js"'));
assert.ok(humanDirector.includes('from "./index_v41_free_providers_compat.js"'));
assert.ok(frozenHumanDirector.includes('from "./index_v37_free_providers.js"'));
assert.ok(freeProviders.includes('from "./index_v37_human_only.js"'));
assert.ok(frozenFreeProviders.includes('from "./index_v37_human_only.js"'));
assert.ok(humanOnly.includes('from "./index_v37_hotfix.js"'));
assert.ok(hotfix.includes('from "./index_v37.js"'));

for (const method of [
  "hardReadyProviders",
  "softReadyProviders",
  "preferredStructuredReadyProviders",
  "providerCapacityConstrained",
  "effectiveStructuredReadyProviders",
  "providerPoolDegraded",
  "queueV37DegradedFallback",
  "queueV37CapacitySheddingAmbient",
  "refillSceneAi",
  "runV37BaseProductionTurn",
  "requestV37ProductionTurn",
  "tick",
  "alarm",
  "noteProviderFailure",
  "orderedReadyProviders",
  "maybeRunV37Shadow",
  "say",
  "v37ProviderFailoverSnapshot",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(hotfix, method), true, `v37 hotfix must retain ${method}()`);
}

for (const method of [
  "providerCapacityConstrained",
  "activeAmbientCharacters",
  "ambientAiPrompt",
  "generateAdaptiveAmbientAi",
  "generateBackgroundPlan",
  "generateHumanReplan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(humanOnly, method), true, `v37 human-only layer must retain ${method}()`);
}

for (const method of [
  "configuredProviders",
  "preferredStructuredReadyProviders",
  "effectiveStructuredReadyProviders",
  "providerPoolDegraded",
  "orderedReadyProviders",
  "noteExtendedProvider",
  "callOpenAiCompatible",
  "callMistralProvider",
  "callVercelAiGatewayProvider",
  "callOpenRouterProvider",
  "callHuggingFaceProvider",
  "callCerebrasProvider",
  "callCohereTrialProvider",
  "callProvider",
  "providerEvent",
  "say",
  "v37ProviderFailoverSnapshot",
  "fetch",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(freeProviders, method), true, `v37 free-provider layer must retain ${method}()`);
}

for (const method of [
  "repairedHumanTrigger",
  "humanDirectorPacket",
  "directHumanDirectorEligible",
  "callAuthoritativeHumanDirector",
  "activeForHumanMove",
  "sceneForMessage",
  "closeLegacySceneForPivot",
  "generateHumanReplan",
  "queueScenePlan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(humanDirector, method), true, `v37 human Director must retain ${method}()`);
}

for (const method of [
  "sceneIsClosed",
  "pruneScenes",
  "sceneForMessage",
  "touchScene",
  "recentHumanInScene",
  "closeExhaustedAmbientScenes",
  "livelyAmbientPrompt",
  "generateLivelyAmbientAi",
  "generateBackgroundPlan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(livelyAmbient, method), true, `v37 lively ambient must retain ${method}()`);
}

assert.ok(humanOnly.includes("this.v37AmbientProviderCursor = 0"));
assert.ok(livelyAmbient.includes("this.v37AmbientProviderCursor % preferred.length"));
assert.ok(
  ownsMethod(humanOnly, "generateBackgroundPlan") && ownsMethod(livelyAmbient, "generateBackgroundPlan"),
  "lively ambient must explicitly supersede the older adaptive ambient generation method"
);
assert.ok(
  ownsMethod(humanOnly, "generateHumanReplan") && ownsMethod(humanDirector, "generateHumanReplan"),
  "human Director must explicitly supersede the older human-only fallback wrapper"
);
assert.ok(
  ownsMethod(hotfix, "providerCapacityConstrained") && ownsMethod(humanOnly, "providerCapacityConstrained"),
  "human-only capacity policy must remain the live override above the hotfix baseline"
);

console.log("v41 Phase 3G.1 v37 wrapper-stack characterization checks passed");
