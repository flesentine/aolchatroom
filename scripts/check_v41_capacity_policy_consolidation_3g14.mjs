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

const humanOnly = read("src/index_v41_human_only_compat.js");
const readiness = read("src/index_v41_provider_readiness_compat.js");
const humanDirector = read("src/index_v41_human_director_compat.js");

const productionOwnerPaths = [
  "src/index_v41_generation_contract_base.js",
  "src/index_v41_bot_roster_reentry.js",
  "src/index_v41_world_date_guard.js",
  "src/index_v41_coherence_repair.js",
  "src/index_v41_human_reconnect.js",
  "src/index_v41_scene_coordinator.js",
  "src/index_v41_ambient_continuity_compat.js",
  "src/index_v41_presence_compat.js",
  "src/index_v41_coherence_compat.js",
  "src/index_v41_quality_compat.js",
  "src/index_v41_lively_ambient_compat.js",
  "src/index_v41_human_director_compat.js",
  "src/index_v41_free_providers_compat.js",
  "src/index_v41_human_only_compat.js",
  "src/index_v41_production_turn_compat.js",
  "src/index_v41_provider_readiness_compat.js",
  "src/index_v41_provider_failover_compat.js",
  "src/index_v41_output_hygiene_compat.js",
  "src/index_v41_paused_shadow_compat.js"
];
const productionOwners = productionOwnerPaths.map((path) => [path, read(path)]);

assert.equal(ownsMethod(humanOnly, "providerCapacityConstrained"), false, "3G.14 human-only residual must release providerCapacityConstrained()");
assert.equal(ownsMethod(readiness, "providerCapacityConstrained"), true, "3G.14 readiness owner must own providerCapacityConstrained()");

const capacityOwners = productionOwners
  .filter(([, source]) => ownsMethod(source, "providerCapacityConstrained"))
  .map(([path]) => path);
assert.deepEqual(
  capacityOwners,
  ["src/index_v41_provider_readiness_compat.js"],
  "3G.14 readiness must be the only v41 production owner of providerCapacityConstrained()"
);

for (const marker of [
  "const preferred = this.preferredStructuredReadyProviders?.(now) || []",
  "if (preferred.length >= 1) return false",
  "return providerBudgetConstrained({",
  "configuredProviders: this.configuredProviders?.() || []",
  "hardReadyProviders: this.hardReadyProviders(now)",
  "softReadyProviders: this.softReadyProviders(now)",
  "minimumPreferredReady: 2"
]) {
  assert.ok(readiness.includes(marker), `3G.14 readiness owner must preserve composed capacity marker: ${marker}`);
}

assert.equal(ownsMethod(humanOnly, "v37Snapshot"), true, "3G.14/3G.15 human-only residual must retain v37Snapshot()");
assert.equal(ownsMethod(humanOnly, "generateHumanReplan"), false, "3G.15 human-only residual must release generateHumanReplan()");
assert.equal(ownsMethod(humanDirector, "generateDelegatedHumanReplan"), true, "3G.15 human Director must own delegated fallback");
assert.ok(humanDirector.includes("this.v37HumanFallbackStats = {"), "3G.16 human Director must initialize live fallback telemetry");
assert.ok(humanOnly.includes("humanModelFallbackMisses: Number(this.v37HumanFallbackStats?.humanModelFallbackMisses || 0)"), "3G.16 legacy snapshot must bridge fallback misses");
for (const marker of [
  "this.v37LastAmbientAiAt = 0",
  "this.v37AdaptiveAmbientStats = {",
  "humanModelFailureFallsBackBuiltIn: true"
]) {
  assert.ok(humanOnly.includes(marker), `3G.14 human-only residual must retain marker: ${marker}`);
}

console.log("v41 Phase 3G.14 capacity-policy consolidation checks passed");
