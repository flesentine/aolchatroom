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
const residual = read("src/index_v41_hotfix_residual_compat.js");
const humanOnlyCompat = read("src/index_v41_human_only_compat.js");
const turnGate = read("src/production_turn_gate.js");
const failover = read("src/provider_failover_v37.js");
const hygiene = read("src/output_hygiene_v37.js");

assert.ok(humanOnlyCompat.includes('from "./index_v41_production_turn_compat.js"'));
assert.ok(productionTurn.includes('from "./index_v41_hotfix_residual_compat.js"'));
assert.ok(residual.includes('from "./index_v37.js"'));
assert.ok(productionTurn.includes('from "./production_turn_gate.js"'));
assert.ok(!residual.includes('from "./production_turn_gate.js"'));
assert.ok(residual.includes('from "./output_hygiene_v37.js"'));
assert.ok(residual.includes('from "./provider_failover_v37.js"'));

const residualGroups = {
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
  ],
  providerFailureAndEmergencyRouting: [
    "noteProviderFailure",
    "orderedReadyProviders"
  ],
  outputAndShadowIsolation: [
    "maybeRunV37Shadow",
    "say"
  ],
  residualDiagnostics: [
    "v37ProviderFailoverSnapshot",
    "v37Snapshot"
  ]
};

for (const [group, methods] of Object.entries(residualGroups)) {
  for (const method of methods) {
    assert.equal(ownsMethod(residual, method), true, `3G.6/3G.7 residual ${group} must retain ${method}()`);
    assert.equal(ownsMethod(frozenHotfix, method), true, `frozen v37 hotfix must retain ${method}()`);
  }
}

for (const method of [
  "runV37BaseProductionTurn",
  "requestV37ProductionTurn",
  "tick",
  "alarm"
]) {
  assert.equal(ownsMethod(productionTurn, method), true, `3G.7 production-turn owner must retain ${method}()`);
  assert.equal(ownsMethod(residual, method), false, `3G.7 residual owner must not retain ${method}()`);
  assert.equal(ownsMethod(frozenHotfix, method), true, `frozen v37 hotfix must retain ${method}()`);
}

for (const marker of [
  "this.v37WorkersDailyQuotaResetAt = 0",
  "this.v37ProductionTurnStats = {",
  "ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)",
  "ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this)",
  "isWorkersAiDailyQuotaExhaustion(provider, detail)",
  "isRequestLocalProviderFailure(status)",
  "structuredBrainDepth: this.v35StructuredGenerationDepth",
  'return ["workers-ai"]',
  "stripInternalChatMetadata(original)",
  'deferReason = "live-model-shadow-paused"',
  "providerDegradedModeBuiltInFallback: true",
  "internalMetadataOutputHygiene: true"
]) {
  assert.ok(residual.includes(marker), `3G.6 residual must preserve marker: ${marker}`);
}

for (const marker of [
  "this.v37ProductionTurnGate = new CoalescingTurnGate({",
  "maxReplays: 2",
  'this.requestV37ProductionTurn("tick", forceSoon)',
  'this.requestV37ProductionTurn("alarm", false)',
  "productionTurnSingleFlight: true",
  "productionTurnReplayCoalescing: true"
]) {
  assert.ok(productionTurn.includes(marker), `3G.7 singleflight owner must preserve marker: ${marker}`);
}

assert.ok(turnGate.includes("class CoalescingTurnGate"));
assert.ok(turnGate.includes("while (this.replayRequested && replayCount < this.maxReplays)"));
assert.ok(failover.includes("isWorkersAiDailyQuotaExhaustion"));
assert.ok(failover.includes("emergencyWorkersBrainEligible"));
assert.ok(failover.includes("degradedBuiltInFallbackEligible"));
assert.ok(hygiene.includes("stripInternalChatMetadata"));

for (const method of ["tick", "noteProviderFailure", "say"]) {
  assert.equal(
    ownsMethod(humanOnlyCompat, method),
    false,
    `3G.6 authority for ${method}() must remain below the residual human-only layer`
  );
}

console.log("v41 Phase 3G.6 v37 hotfix responsibility characterization checks passed after 3G.7 split");
