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
const humanOnlyCompat = read("src/index_v41_human_only_compat.js");
const turnGate = read("src/production_turn_gate.js");
const failover = read("src/provider_failover_v37.js");
const hygiene = read("src/output_hygiene_v37.js");

assert.ok(humanOnlyCompat.includes('from "./index_v37_hotfix.js"'));
assert.ok(hotfix.includes('from "./index_v37.js"'));
assert.ok(hotfix.includes('from "./production_turn_gate.js"'));
assert.ok(hotfix.includes('from "./output_hygiene_v37.js"'));
assert.ok(hotfix.includes('from "./provider_failover_v37.js"'));

const groups = {
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
  productionTurnSingleflight: [
    "runV37BaseProductionTurn",
    "requestV37ProductionTurn",
    "tick",
    "alarm"
  ],
  providerFailureAndEmergencyRouting: [
    "noteProviderFailure",
    "orderedReadyProviders"
  ],
  outputAndShadowIsolation: [
    "maybeRunV37Shadow",
    "say"
  ],
  diagnostics: [
    "v37ProviderFailoverSnapshot",
    "v37Snapshot"
  ]
};

for (const [group, methods] of Object.entries(groups)) {
  for (const method of methods) {
    assert.equal(ownsMethod(hotfix, method), true, `3G.6 ${group} must retain ${method}()`);
  }
}

for (const marker of [
  "this.v37WorkersDailyQuotaResetAt = 0",
  "this.v37ProductionTurnStats = {",
  "this.v37ProductionTurnGate = new CoalescingTurnGate({",
  "maxReplays: 2",
  "ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)",
  "ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this)",
  "isWorkersAiDailyQuotaExhaustion(provider, detail)",
  "isRequestLocalProviderFailure(status)",
  "structuredBrainDepth: this.v35StructuredGenerationDepth",
  'return ["workers-ai"]',
  "stripInternalChatMetadata(original)",
  'deferReason = "live-model-shadow-paused"',
  "productionTurnSingleFlight: true",
  "providerDegradedModeBuiltInFallback: true",
  "internalMetadataOutputHygiene: true"
]) {
  assert.ok(hotfix.includes(marker), `3G.6 must preserve marker: ${marker}`);
}

assert.ok(turnGate.includes("class CoalescingTurnGate"));
assert.ok(turnGate.includes("while (this.replayRequested && replayCount < this.maxReplays)"));
assert.ok(failover.includes("isWorkersAiDailyQuotaExhaustion"));
assert.ok(failover.includes("emergencyWorkersBrainEligible"));
assert.ok(failover.includes("degradedBuiltInFallbackEligible"));
assert.ok(hygiene.includes("stripInternalChatMetadata"));

assert.equal(
  ownsMethod(humanOnlyCompat, "tick"),
  false,
  "3G.6 singleflight remains owned below the residual human-only layer"
);
assert.equal(
  ownsMethod(humanOnlyCompat, "noteProviderFailure"),
  false,
  "3G.6 provider failure policy remains owned by the hotfix boundary"
);
assert.equal(
  ownsMethod(humanOnlyCompat, "say"),
  false,
  "3G.6 internal metadata hygiene remains owned by the hotfix boundary"
);

console.log("v41 Phase 3G.6 v37 hotfix responsibility characterization checks passed");
