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

const providerCompat = read("src/index_v41_free_providers_compat.js");
const frozenHumanOnly = read("src/index_v37_human_only.js");
const hotfix = read("src/index_v37_hotfix.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");
const scene = read("src/index_v41_scene_coordinator.js");
const ambient = read("src/index_v41_ambient_continuity_compat.js");
const presence = read("src/index_v41_presence_compat.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const qualityCompat = read("src/index_v41_quality_compat.js");
const livelyCompat = read("src/index_v41_lively_ambient_compat.js");
const humanDirectorCompat = read("src/index_v41_human_director_compat.js");
const legacyDiagnostics = read("src/human_only_legacy_diagnostics_v41.js");

assert.equal(
  fs.existsSync(new URL("../src/index_v41_human_only_compat.js", import.meta.url)),
  false,
  "3G.18 retired v41 human-only residual source must be deleted"
);
assert.ok(providerCompat.includes('from "./index_v41_production_turn_compat.js"'));
assert.ok(providerCompat.includes('from "./human_only_legacy_diagnostics_v41.js"'));
assert.ok(!providerCompat.includes('from "./index_v41_human_only_compat.js"'));
assert.ok(!providerCompat.includes('from "./index_v37_human_only.js"'));
assert.ok(frozenHumanOnly.includes('from "./index_v37_hotfix.js"'));
assert.ok(hotfix.includes('from "./index_v37.js"'));

for (const retiredMethod of [
  "ambientAiPrompt",
  "generateAdaptiveAmbientAi",
  "generateBackgroundPlan"
]) {
  assert.equal(
    ownsMethod(frozenHumanOnly, retiredMethod),
    true,
    `frozen v37 human-only wrapper must retain ${retiredMethod}()`
  );
  assert.equal(
    legacyDiagnostics.includes(`${retiredMethod}(`) || legacyDiagnostics.includes(`async ${retiredMethod}(`),
    false,
    `3G.18 diagnostics helper must not copy superseded runtime method ${retiredMethod}()`
  );
}

for (const marker of [
  "V37_RETIRED_ADAPTIVE_AMBIENT_STATS",
  "ambientAiAttempts: 0",
  "adaptiveAmbientAi: true",
  "ambientSingleProviderAttempt: true",
  "ambientSingleCallExchange: true",
  "humanModelFailureFallsBackBuiltIn: true"
]) {
  assert.ok(legacyDiagnostics.includes(marker), `3G.5/3G.18 helper must preserve marker: ${marker}`);
}

assert.equal(ownsMethod(humanDirectorCompat, "generateDelegatedHumanReplan"), true, "3G.15 human Director must own delegated fallback");
assert.ok(humanDirectorCompat.includes("this.v37HumanFallbackStats.humanModelFallbacks += 1"), "3G.16 Director must own delegated fallback accounting");
assert.ok(humanDirectorCompat.includes("this.v37HumanFallbackStats = {"), "3G.16 Director must initialize human fallback telemetry");
assert.ok(legacyDiagnostics.includes("humanModelFallbacks: Number(room.v37HumanFallbackStats?.humanModelFallbacks || 0)"), "3G.16/3G.18 helper must bridge live fallback successes");
assert.ok(legacyDiagnostics.includes("humanModelFallbackMisses: Number(room.v37HumanFallbackStats?.humanModelFallbackMisses || 0)"), "3G.16/3G.18 helper must bridge live fallback misses");
assert.equal(ownsMethod(read("src/index_v41_provider_readiness_compat.js"), "providerCapacityConstrained"), true, "3G.14 readiness owner must own providerCapacityConstrained()");
assert.equal(ownsMethod(livelyCompat, "activeAmbientCharacters"), true, "3G.13 lively ambient must own activeAmbientCharacters()");
assert.ok(livelyCompat.includes("this.v37AmbientProviderCursor = 0"), "3G.13 lively ambient must initialize its own provider cursor");
assert.ok(livelyCompat.includes("this.v37AmbientProviderCursor % preferred.length"), "lively ambient must consume its locally owned provider cursor");
assert.ok(livelyCompat.includes("this.activeAmbientCharacters?.()"), "lively ambient must consume its locally owned active-character helper");

const v41ProductionSpine = [
  generationBase,
  roster,
  worldDate,
  coherence,
  reconnect,
  scene,
  ambient,
  presence,
  coherenceCompat,
  qualityCompat,
  livelyCompat,
  humanDirectorCompat,
  providerCompat,
  legacyDiagnostics
].join("\n");

assert.equal(
  v41ProductionSpine.includes('from "./index_v37_human_only.js"'),
  false,
  "3G.5 must remove the retired v37 human-only wrapper from every v41 production dependency edge"
);
assert.equal(
  v41ProductionSpine.includes('from "./index_v41_human_only_compat.js"'),
  false,
  "3G.17/3G.18 must keep the retired v41 human-only residual out of every production dependency edge"
);

for (const source of [roster, worldDate, coherence, reconnect]) {
  assert.ok(source.includes('from "./index_v37.js"'));
  assert.ok(!source.includes('from "./index_v37_human_only.js"'));
}

console.log("v41 Phase 3G.5 historical human-only compatibility checks passed after 3G.19 stateless diagnostics");
