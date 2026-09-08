import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const humanOnly = read("src/index_v41_human_only_compat.js");
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
const productionOwners = productionOwnerPaths.map((ownerPath) => [ownerPath, read(ownerPath)]);

const telemetryInitializers = productionOwners
  .filter(([, source]) => source.includes("this.v37HumanFallbackStats = {"))
  .map(([ownerPath]) => ownerPath);
assert.deepEqual(
  telemetryInitializers,
  ["src/index_v41_human_director_compat.js"],
  "3G.16 Human Director must be the only v41 production initializer of v37HumanFallbackStats"
);

for (const marker of [
  "humanModelFallbacks: 0",
  "humanModelFallbackMisses: 0",
  "this.v37HumanFallbackStats.humanModelFallbacks += 1",
  "this.v37HumanFallbackStats.humanModelFallbackMisses += 1"
]) {
  assert.ok(humanDirector.includes(marker), `3G.16 Human Director must own live fallback telemetry marker: ${marker}`);
}

assert.equal(
  humanOnly.includes("humanModelFallbacks: 0") || humanOnly.includes("humanModelFallbackMisses: 0"),
  false,
  "3G.16 human-only legacy ambient state must not initialize live human fallback counters"
);

for (const marker of [
  "ambientAiAttempts: 0",
  "ambientAiSuccesses: 0",
  "ambientAiFailures: 0",
  "ambientAiOutputRejects: 0",
  "ambientAiLines: 0",
  "ambientBuiltInPlansGenerated: 0",
  "ambientAiRateSkips: 0",
  "ambientAiHumanPrioritySkips: 0"
]) {
  assert.ok(humanOnly.includes(marker), `3G.16 human-only residual must retain legacy ambient-history marker: ${marker}`);
}

for (const marker of [
  "humanModelFallbacks: Number(this.v37HumanFallbackStats?.humanModelFallbacks || 0)",
  "humanModelFallbackMisses: Number(this.v37HumanFallbackStats?.humanModelFallbackMisses || 0)"
]) {
  assert.ok(humanOnly.includes(marker), `3G.16 historical snapshot must bridge live Human Director telemetry: ${marker}`);
}

console.log("v41 Phase 3G.16 human-fallback telemetry ownership checks passed");
