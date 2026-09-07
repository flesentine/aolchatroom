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

const frozenHotfix = read("src/index_v37_hotfix.js");
const productionTurn = read("src/index_v41_production_turn_compat.js");
const providerReadiness = read("src/index_v41_provider_readiness_compat.js");
const providerFailover = read("src/index_v41_provider_failover_compat.js");
const residual = read("src/index_v41_hotfix_residual_compat.js");
const humanOnlyCompat = read("src/index_v41_human_only_compat.js");
const turnGate = read("src/production_turn_gate.js");
const failover = read("src/provider_failover_v37.js");
const hygiene = read("src/output_hygiene_v37.js");

assert.ok(humanOnlyCompat.includes('from "./index_v41_production_turn_compat.js"'));
assert.ok(productionTurn.includes('from "./index_v41_provider_readiness_compat.js"'));
assert.ok(providerReadiness.includes('from "./index_v41_provider_failover_compat.js"'));
assert.ok(providerFailover.includes('from "./index_v41_hotfix_residual_compat.js"'));
assert.ok(residual.includes('from "./index_v37.js"'));

const readinessGroups = {
  readinessAndCapacity: [
    "hardReadyProviders",
    "softReadyProviders",
    "preferredStructuredReadyProviders",
    "providerCapacityConstrained",
    "effectiveStructuredReadyProviders",
    "providerPoolDegraded"
  ],
  degradedAndCapacityFallback: [
    "queueV37DegradedFallback",
    "queueV37CapacitySheddingAmbient",
    "refillSceneAi"
  ]
};

for (const [group, methods] of Object.entries(readinessGroups)) {
  for (const method of methods) {
    assert.equal(ownsMethod(providerReadiness, method), true, `3G.8 ${group} must retain ${method}()`);
    assert.equal(ownsMethod(residual, method), false, `3G.8 residual must not retain ${method}()`);
    assert.equal(ownsMethod(frozenHotfix, method), true, `frozen v37 hotfix must retain ${method}()`);
  }
}

for (const method of ["runV37BaseProductionTurn", "requestV37ProductionTurn", "tick", "alarm"]) {
  assert.equal(ownsMethod(productionTurn, method), true, `3G.7 production-turn owner must retain ${method}()`);
  assert.equal(ownsMethod(providerReadiness, method), false, `3G.8 readiness owner must not retain ${method}()`);
  assert.equal(ownsMethod(residual, method), false, `3G.8 residual must not retain ${method}()`);
  assert.equal(ownsMethod(frozenHotfix, method), true, `frozen v37 hotfix must retain ${method}()`);
}

for (const method of ["noteProviderFailure", "orderedReadyProviders", "v37ProviderFailoverSnapshot"]) {
  assert.equal(ownsMethod(providerFailover, method), true, `3G.9 provider-failover owner must retain ${method}()`);
  assert.equal(ownsMethod(residual, method), false, `3G.9 residual must not retain ${method}()`);
  assert.equal(ownsMethod(frozenHotfix, method), true, `frozen v37 hotfix must retain ${method}()`);
}

for (const method of ["maybeRunV37Shadow", "say", "v37Snapshot"]) {
  assert.equal(ownsMethod(residual, method), true, `3G.9 final residual must retain ${method}()`);
  assert.equal(ownsMethod(frozenHotfix, method), true, `frozen v37 hotfix must retain ${method}()`);
}

for (const marker of [
  "this.v37WorkersDailyQuotaResetAt = 0",
  "isWorkersAiDailyQuotaExhaustion(provider, detail)",
  "isRequestLocalProviderFailure(status)",
  "structuredBrainDepth: this.v35StructuredGenerationDepth",
  'return ["workers-ai"]'
]) {
  assert.ok(providerFailover.includes(marker), `3G.9 failover owner must preserve marker: ${marker}`);
}
for (const marker of [
  "this.v37ProductionTurnStats = {",
  "stripInternalChatMetadata(original)",
  'deferReason = "live-model-shadow-paused"',
  "internalMetadataOutputHygiene: true"
]) {
  assert.ok(residual.includes(marker), `3G.9 final residual must preserve marker: ${marker}`);
}

for (const marker of [
  "ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)",
  "ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this)",
  "providerDegradedModeBuiltInFallback: true",
  "effectiveStructuredProviderReadiness: true",
  "humanPriorityProviderBudget: true",
  "ambientAiCapacityShedding: true"
]) {
  assert.ok(providerReadiness.includes(marker), `3G.8 readiness owner must preserve marker: ${marker}`);
}

for (const marker of [
  "this.v37ProductionTurnGate = new CoalescingTurnGate({",
  "maxReplays: 2",
  "productionTurnSingleFlight: true",
  "productionTurnReplayCoalescing: true"
]) {
  assert.ok(productionTurn.includes(marker), `3G.7 singleflight owner must preserve marker: ${marker}`);
}

assert.ok(turnGate.includes("while (this.replayRequested && replayCount < this.maxReplays)"));
assert.ok(failover.includes("isWorkersAiDailyQuotaExhaustion"));
assert.ok(failover.includes("emergencyWorkersBrainEligible"));
assert.ok(failover.includes("degradedBuiltInFallbackEligible"));
assert.ok(hygiene.includes("stripInternalChatMetadata"));

for (const method of ["tick", "noteProviderFailure", "say"]) {
  assert.equal(ownsMethod(humanOnlyCompat, method), false, `authority for ${method}() must remain below human-only`);
}

console.log("v41 Phase 3G.6 hotfix responsibility characterization checks passed after 3G.9 split");
