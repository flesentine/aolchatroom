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
assert.ok(providerCompat.includes('from "./index_v37_human_only.js"'));
assert.ok(frozenHuman.includes('from "./index_v37_free_providers.js"'));

for (const method of [
  "repairedHumanTrigger",
  "humanDirectorPacket",
  "directHumanDirectorEligible",
  "callAuthoritativeHumanDirector",
  "activeForHumanMove",
  "sceneForMessage",
  "closeLegacySceneForPivot",
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
const compatBody = humanCompat.split("\n").slice(headerLines).join("\n")
  .replace('from "./index_v41_free_providers_compat.js"', 'from "./index_v37_free_providers.js"');
assert.equal(
  compatBody,
  frozenHuman,
  "3G.3 replacement must remain byte-for-byte behavior-equivalent to frozen v37 human Director below its compatibility header"
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
  assert.ok(source.includes('from "./index_v37_human_only.js"'));
  assert.ok(!source.includes('from "./index_v37_free_providers.js"'));
  assert.ok(!source.includes('from "./index_v37_human_director.js"'));
}

console.log("v41 Phase 3G.3 v37 human-Director wrapper retirement checks passed");
