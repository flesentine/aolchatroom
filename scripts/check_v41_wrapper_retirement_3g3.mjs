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

const livelyCompat = read("src/index_v41_lively_ambient_compat.js");
const humanCompat = read("src/index_v41_human_director_compat.js");
const providerCompat = read("src/index_v41_free_providers_compat.js");
const frozenHuman = read("src/index_v37_human_director.js");
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

assert.ok(livelyCompat.includes('from "./index_v41_human_director_compat.js"'));
assert.ok(!livelyCompat.includes('from "./index_v37_human_director.js"'));
assert.ok(humanCompat.includes('from "./index_v41_free_providers_compat.js"'));
assert.ok(providerCompat.includes('from "./index_v41_human_only_compat.js"'));
assert.ok(frozenHuman.includes('from "./index_v37_free_providers.js"'));

for (const method of [
  "repairedHumanTrigger",
  "humanDirectorPacket",
  "directHumanDirectorEligible",
  "callAuthoritativeHumanDirector",
  "activeForHumanMove",
  "sceneForMessage",
  "closeLegacySceneForPivot",
  "generateDelegatedHumanReplan",
  "generateHumanReplan",
  "queueScenePlan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(humanCompat, method), true, `3G.3 must preserve ${method}()`);
}

for (const marker of [
  "this.v37HumanDirectorStats = {",
  "this.v37LastHumanDirector = null",
  "contextualHumanMoveType(packet)",
  "structuralShadowMove(packet)",
  "authority?.closeHumanPivotScene",
  "legacyBrainBypasses",
  "_v37ForceNewScene",
  "directHumanDirectorAuthoritative: true",
  "legacyBrainGetsSecondVoteOnDirectHuman: false"
]) {
  assert.ok(humanCompat.includes(marker), `3G.3 must preserve marker: ${marker}`);
}

const headerLines = 4;
const delegatedFallback = extractMethod(humanCompat, "async generateDelegatedHumanReplan(human) {");
const telemetryInitializer = `    this.v37HumanFallbackStats = {
      humanModelFallbacks: 0,
      humanModelFallbackMisses: 0
    };
`;
const compatBody = humanCompat.split("\n").slice(headerLines).join("\n")
  .replace('from "./index_v41_free_providers_compat.js"', 'from "./index_v37_free_providers.js"')
  .replace(telemetryInitializer, "")
  .replace(`${delegatedFallback}\n\n`, "")
  .replace(
    "if (!this.directHumanDirectorEligible(packet)) return this.generateDelegatedHumanReplan(human);",
    "if (!this.directHumanDirectorEligible(packet)) return super.generateHumanReplan(human);"
  );
assert.equal(
  compatBody,
  frozenHuman,
  "3G.3 original Director behavior must remain byte-for-byte equivalent after subtracting only the explicit 3G.15 delegated fallback and 3G.16 telemetry initializer"
);

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
  humanCompat,
  providerCompat
].join("\n");
assert.equal(
  v41ProductionSpine.includes('from "./index_v37_human_director.js"'),
  false,
  "3G.3 must remove the retired v37 human Director wrapper from every v41 production dependency edge"
);

for (const source of [roster, worldDate, coherence, reconnect]) {
  assert.ok(source.includes('from "./index_v37.js"'));
  assert.ok(!source.includes('from "./index_v37_free_providers.js"'));
  assert.ok(!source.includes('from "./index_v37_human_director.js"'));
}

console.log("v41 Phase 3G.3 v37 human-Director wrapper retirement checks passed");
