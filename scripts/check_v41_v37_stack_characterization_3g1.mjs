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
const productionTurn = read("src/index_v41_production_turn_compat.js");
const providerReadiness = read("src/index_v41_provider_readiness_compat.js");
const providerFailover = read("src/index_v41_provider_failover_compat.js");
const outputHygiene = read("src/index_v41_output_hygiene_compat.js");
const pausedShadow = read("src/index_v41_paused_shadow_compat.js");
const sharedStats = read("src/production_turn_stats_v41.js");
const legacyDiagnostics = read("src/human_only_legacy_diagnostics_v41.js");
const frozenHumanOnly = read("src/index_v37_human_only.js");
const freeProviders = read("src/index_v41_free_providers_compat.js");
const frozenFreeProviders = read("src/index_v37_free_providers.js");
const humanDirector = read("src/index_v41_human_director_compat.js");
const frozenHumanDirector = read("src/index_v37_human_director.js");
const livelyAmbient = read("src/index_v41_lively_ambient_compat.js");
const frozenLivelyAmbient = read("src/index_v37_lively_ambient.js");
const qualityCompat = read("src/index_v41_quality_compat.js");

assert.equal(
  fs.existsSync(new URL("../src/index_v41_human_only_compat.js", import.meta.url)),
  false,
  "3G.18 retired v41 human-only residual source must be deleted"
);

assert.ok(qualityCompat.includes('from "./index_v41_lively_ambient_compat.js"'));
assert.ok(livelyAmbient.includes('from "./index_v41_human_director_compat.js"'));
assert.ok(frozenLivelyAmbient.includes('from "./index_v37_human_director.js"'));
assert.ok(humanDirector.includes('from "./index_v41_free_providers_compat.js"'));
assert.ok(frozenHumanDirector.includes('from "./index_v37_free_providers.js"'));
assert.ok(freeProviders.includes('from "./index_v41_production_turn_compat.js"'));
assert.ok(freeProviders.includes('from "./human_only_legacy_diagnostics_v41.js"'));
assert.ok(!freeProviders.includes('from "./index_v41_human_only_compat.js"'));
assert.ok(frozenFreeProviders.includes('from "./index_v37_human_only.js"'));
assert.ok(productionTurn.includes('from "./index_v41_provider_readiness_compat.js"'));
assert.ok(providerReadiness.includes('from "./index_v41_provider_failover_compat.js"'));
assert.ok(providerFailover.includes('from "./index_v41_output_hygiene_compat.js"'));
assert.ok(outputHygiene.includes('from "./index_v41_paused_shadow_compat.js"'));
assert.ok(pausedShadow.includes('from "./index_v37.js"'));
assert.ok(pausedShadow.includes('from "./production_turn_stats_v41.js"'));
assert.ok(sharedStats.includes("createV37ProductionTurnStats"));
assert.ok(frozenHumanOnly.includes('from "./index_v37_hotfix.js"'));
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

for (const method of ["ambientAiPrompt", "generateAdaptiveAmbientAi", "generateBackgroundPlan"]) {
  assert.equal(ownsMethod(frozenHumanOnly, method), true, `frozen v37 human-only must retain ${method}()`);
  assert.equal(
    legacyDiagnostics.includes(`${method}(`) || legacyDiagnostics.includes(`async ${method}(`),
    false,
    `3G.18 diagnostics helper must not regain runtime method ${method}()`
  );
}

for (const marker of [
  "initializeV37HumanOnlyDiagnostics",
  "mergeV37HumanOnlyStatus",
  "mergeV37HumanOnlySnapshot",
  "room.v37LastAmbientAiAt = 0",
  "room.v37AdaptiveAmbientStats = {",
  "humanModelFallbacks: Number(room.v37HumanFallbackStats?.humanModelFallbacks || 0)"
]) {
  assert.ok(legacyDiagnostics.includes(marker), `3G.18 legacy diagnostics helper must preserve marker: ${marker}`);
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
  assert.equal(ownsMethod(freeProviders, method), true, `v41 free-provider layer must retain ${method}()`);
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
  assert.equal(ownsMethod(humanDirector, method), true, `v41 human Director must retain ${method}()`);
}

for (const method of [
  "sceneIsClosed",
  "pruneScenes",
  "sceneForMessage",
  "touchScene",
  "recentHumanInScene",
  "closeExhaustedAmbientScenes",
  "activeAmbientCharacters",
  "livelyAmbientPrompt",
  "generateLivelyAmbientAi",
  "generateBackgroundPlan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(livelyAmbient, method), true, `v41 lively ambient must retain ${method}()`);
}

assert.ok(livelyAmbient.includes("this.v37AmbientProviderCursor = 0"));
assert.ok(livelyAmbient.includes("this.v37AmbientProviderCursor % preferred.length"));
assert.equal(ownsMethod(livelyAmbient, "activeAmbientCharacters"), true);
assert.ok(
  ownsMethod(frozenHumanOnly, "generateBackgroundPlan") && ownsMethod(livelyAmbient, "generateBackgroundPlan"),
  "lively ambient must own production background generation while frozen v37 retains the older adaptive method"
);
assert.equal(ownsMethod(humanDirector, "generateHumanReplan"), true, "human Director must remain the human-turn authority");
assert.equal(ownsMethod(humanDirector, "generateDelegatedHumanReplan"), true, "3G.15 human Director must consolidate delegated fallback behavior");
assert.ok(humanDirector.includes("this.v37HumanFallbackStats = {"), "3G.16 human Director must own live fallback telemetry");
assert.ok(legacyDiagnostics.includes("humanModelFallbacks: Number(room.v37HumanFallbackStats?.humanModelFallbacks || 0)"), "3G.16/3G.18 helper must preserve the historical fallback counter surface");
assert.equal(ownsMethod(providerReadiness, "providerCapacityConstrained"), true, "3G.14 readiness owner must consolidate live capacity authority");
for (const method of ["noteProviderFailure", "v37ProviderFailoverSnapshot"]) {
  assert.equal(ownsMethod(providerFailover, method), true, `3G.9 provider-failover owner must retain ${method}()`);
}
assert.equal(ownsMethod(providerFailover, "orderedReadyProviders"), false, "3G.9 must not duplicate the higher live provider-ordering authority");
assert.equal(ownsMethod(outputHygiene, "say"), true, "3G.10 output-hygiene owner must retain say()");
assert.equal(ownsMethod(pausedShadow, "maybeRunV37Shadow"), true, "3G.11 paused-shadow owner must retain maybeRunV37Shadow()");
assert.equal(ownsMethod(freeProviders, "orderedReadyProviders"), true, "3G.4 free-provider compatibility remains the live production ordering owner");
for (const method of ["runV37BaseProductionTurn", "requestV37ProductionTurn", "tick", "alarm"]) {
  assert.equal(ownsMethod(productionTurn, method), true, `3G.7 production-turn owner must retain ${method}()`);
}

console.log("v41 Phase 3G.1 v37 wrapper-stack characterization checks passed after 3G.18 source retirement");
