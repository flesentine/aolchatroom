import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const humanDirector = read("src/index_v41_human_director_compat.js");
const legacyDiagnostics = read("src/human_only_legacy_diagnostics_v41.js");

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
  "src/index_v41_production_turn_compat.js",
  "src/index_v41_provider_readiness_compat.js",
  "src/index_v41_provider_failover_compat.js",
  "src/index_v41_output_hygiene_compat.js",
  "src/index_v41_paused_shadow_compat.js"
];
const productionOwners = productionOwnerPaths.map((ownerPath) => [ownerPath, read(ownerPath)]);

assert.equal(
  legacyDiagnostics.includes("room.v37AdaptiveAmbientStats") || legacyDiagnostics.includes("room.v37LastAmbientAiAt"),
  false,
  "3G.19 historical diagnostics helper must not allocate retired ambient room state"
);

assert.equal(
  fs.existsSync(new URL("../src/index_v41_human_only_compat.js", import.meta.url)),
  false,
  "3G.18 retired human-only residual source must be deleted"
);

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
  legacyDiagnostics.includes("humanModelFallbacks: 0") || legacyDiagnostics.includes("humanModelFallbackMisses: 0"),
  false,
  "3G.16/3G.18 historical diagnostics helper must not initialize live human fallback counters"
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
  assert.ok(legacyDiagnostics.includes(marker), `3G.16/3G.18 helper must retain legacy ambient-history marker: ${marker}`);
}

for (const marker of [
  "humanModelFallbacks: Number(room.v37HumanFallbackStats?.humanModelFallbacks || 0)",
  "humanModelFallbackMisses: Number(room.v37HumanFallbackStats?.humanModelFallbackMisses || 0)"
]) {
  assert.ok(legacyDiagnostics.includes(marker), `3G.16/3G.18 historical snapshot helper must bridge live Human Director telemetry: ${marker}`);
}

console.log("v41 Phase 3G.16 human-fallback telemetry ownership checks passed after 3G.19 stateless diagnostics");
