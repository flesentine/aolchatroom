import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function extractMethod(source, signature) {
  const start = source.indexOf(`  ${signature}`);
  assert.ok(start >= 0, `missing method ${signature}`);
  const brace = start + signature.lastIndexOf("{");
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`unterminated method ${signature}`);
}

function ownsMethod(source, name) {
  return source.split("\n").some((line) =>
    line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`)
  );
}

const frozenHumanOnly = read("src/index_v37_human_only.js");
const humanOnly = read("src/index_v41_human_only_compat.js");
const humanDirector = read("src/index_v41_human_director_compat.js");
const generationBase = read("src/index_v41_generation_contract_base.js");

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

const frozenFallback = extractMethod(frozenHumanOnly, "async generateHumanReplan(human) {");
const delegatedFallback = extractMethod(humanDirector, "async generateDelegatedHumanReplan(human) {")
  .replace("async generateDelegatedHumanReplan(human) {", "async generateHumanReplan(human) {")
  .replaceAll("v37HumanFallbackStats", "v37AdaptiveAmbientStats");
assert.equal(
  delegatedFallback,
  frozenFallback,
  "3G.15 delegated fallback must remain byte-for-byte equivalent to frozen v37 human-only generateHumanReplan() after normalizing the method name and 3G.16 telemetry owner"
);

assert.equal(ownsMethod(humanOnly, "generateHumanReplan"), false, "3G.15 human-only residual must release generateHumanReplan()");
assert.equal(humanOnly.includes('from "./index_v14.js"'), false, "3G.15 human-only residual must release the built-in fallback dependency");
assert.equal(ownsMethod(humanDirector, "generateHumanReplan"), true, "3G.15 human Director must remain the human-turn authority");
assert.equal(ownsMethod(humanDirector, "generateDelegatedHumanReplan"), true, "3G.15 human Director must own delegated fallback");

const humanReplanOwners = productionOwners
  .filter(([, source]) => ownsMethod(source, "generateHumanReplan"))
  .map(([ownerPath]) => ownerPath);
assert.deepEqual(
  humanReplanOwners,
  [
    "src/index_v41_generation_contract_base.js",
    "src/index_v41_human_director_compat.js"
  ],
  "3G.15 v41 production must retain only the generation-contract wrapper and Human Director as generateHumanReplan() owners"
);

const delegatedFallbackOwners = productionOwners
  .filter(([, source]) => ownsMethod(source, "generateDelegatedHumanReplan"))
  .map(([ownerPath]) => ownerPath);
assert.deepEqual(
  delegatedFallbackOwners,
  ["src/index_v41_human_director_compat.js"],
  "3G.15 Human Director must be the only v41 production owner of generateDelegatedHumanReplan()"
);

assert.ok(
  generationBase.includes("const lines = await super.generateHumanReplan(human);"),
  "3G.15 generation-contract wrapper must continue delegating to the Human Director chain before enforcing its semantic contract"
);
assert.ok(
  humanDirector.includes("if (!this.directHumanDirectorEligible(packet)) return this.generateDelegatedHumanReplan(human);"),
  "3G.15 Director-ineligible packets must route through the consolidated delegated fallback"
);

for (const marker of [
  "this.v37HumanFallbackStats.humanModelFallbacks += 1",
  "this.v37HumanFallbackStats.humanModelFallbackMisses += 1",
  'this.setAiStatus?.("AI human reply fallback · built-in")',
  'source: "built-in"'
]) {
  assert.ok(humanDirector.includes(marker), `3G.15 Director must preserve delegated fallback marker: ${marker}`);
}

for (const marker of [
  "this.v37LastAmbientAiAt = 0",
  "this.v37AdaptiveAmbientStats = {",
  "humanModelFallbacks",
  "humanModelFallbackMisses",
  "humanModelFailureFallsBackBuiltIn: true",
  "adaptiveAmbientAi: {"
]) {
  assert.ok(humanOnly.includes(marker), `3G.15 human-only residual must retain legacy diagnostic marker: ${marker}`);
}
assert.equal(ownsMethod(humanOnly, "v37Snapshot"), true, "3G.15 human-only residual must retain v37Snapshot()");

console.log("v41 Phase 3G.15 delegated-human-fallback consolidation checks passed");
