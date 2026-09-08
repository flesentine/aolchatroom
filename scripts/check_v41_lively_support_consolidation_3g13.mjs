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
const lively = read("src/index_v41_lively_ambient_compat.js");
const readiness = read("src/index_v41_provider_readiness_compat.js");
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
const productionOwners = productionOwnerPaths.map((path) => [path, read(path)]);

assert.equal(
  fs.existsSync(new URL("../src/index_v41_human_only_compat.js", import.meta.url)),
  false,
  "3G.18 retired human-only residual source must be deleted"
);
assert.equal(
  extractMethod(lively, "activeAmbientCharacters() {"),
  extractMethod(frozenHumanOnly, "activeAmbientCharacters() {"),
  "3G.13 activeAmbientCharacters() must remain byte-for-byte equivalent to the frozen v37 helper"
);

assert.equal(ownsMethod(lively, "activeAmbientCharacters"), true, "lively ambient must own activeAmbientCharacters()");
assert.ok(lively.includes('from "./characters.js"'), "lively ambient must own character lookup");
assert.equal(
  (lively.match(/this\.v37AmbientProviderCursor\s*=\s*0/g) || []).length,
  1,
  "lively ambient must initialize its provider cursor exactly once"
);
assert.ok(lively.includes("this.v37AmbientProviderCursor % preferred.length"));
assert.ok(lively.includes("this.v37AmbientProviderCursor = (this.v37AmbientProviderCursor + 1) % 1000000"));
assert.ok(lively.includes("this.activeAmbientCharacters?.()"));

const cursorInitializers = productionOwners
  .filter(([, source]) => source.includes("this.v37AmbientProviderCursor = 0"))
  .map(([path]) => path);
assert.deepEqual(
  cursorInitializers,
  ["src/index_v41_lively_ambient_compat.js"],
  "3G.13 lively ambient must be the only v41 production owner that initializes the provider cursor"
);

const activeCharacterOwners = productionOwners
  .filter(([, source]) => ownsMethod(source, "activeAmbientCharacters"))
  .map(([path]) => path);
assert.deepEqual(
  activeCharacterOwners,
  ["src/index_v41_lively_ambient_compat.js"],
  "3G.13 lively ambient must be the only v41 production owner of activeAmbientCharacters()"
);

assert.equal(ownsMethod(humanDirector, "generateDelegatedHumanReplan"), true, "3G.15 human Director must own delegated fallback");
assert.ok(humanDirector.includes("this.v37HumanFallbackStats = {"), "3G.16 human Director must initialize live fallback telemetry");
assert.ok(legacyDiagnostics.includes("humanModelFallbacks: Number(room.v37HumanFallbackStats?.humanModelFallbacks || 0)"), "3G.16/3G.18 helper must bridge live fallback telemetry");
assert.equal(ownsMethod(readiness, "providerCapacityConstrained"), true, "3G.14 readiness owner must own providerCapacityConstrained()");
for (const marker of [
  "room.v37LastAmbientAiAt = 0",
  "room.v37AdaptiveAmbientStats = {",
  "adaptiveAmbientAi: true",
  "humanModelFailureFallsBackBuiltIn: true"
]) {
  assert.ok(legacyDiagnostics.includes(marker), `3G.17/3G.18 diagnostics helper must retain marker: ${marker}`);
}

console.log("v41 Phase 3G.13 lively-support consolidation checks passed after 3G.18 source retirement");
