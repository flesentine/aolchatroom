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

const qualityCompat = read("src/index_v41_quality_compat.js");
const livelyCompat = read("src/index_v41_lively_ambient_compat.js");
const frozenLively = read("src/index_v37_lively_ambient.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");
const scene = read("src/index_v41_scene_coordinator.js");
const ambient = read("src/index_v41_ambient_continuity_compat.js");
const presence = read("src/index_v41_presence_compat.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");

assert.ok(qualityCompat.includes('from "./index_v41_lively_ambient_compat.js"'));
assert.ok(!qualityCompat.includes('from "./index_v37_lively_ambient.js"'));
assert.ok(livelyCompat.includes('from "./index_v37_human_director.js"'));
assert.ok(frozenLively.includes('from "./index_v37_human_director.js"'));

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
  livelyCompat
].join("\n");
assert.equal(
  v41ProductionSpine.includes('from "./index_v37_lively_ambient.js"'),
  false,
  "3G.2 must remove the retired v37 lively wrapper from every v41 production dependency edge"
);

for (const method of [
  "sceneIsClosed",
  "pruneScenes",
  "sceneForMessage",
  "touchScene",
  "recentHumanInScene",
  "closeExhaustedAmbientScenes",
  "livelyAmbientPrompt",
  "generateLivelyAmbientAi",
  "generateBackgroundPlan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(livelyCompat, method), true, `3G.2 must preserve ${method}()`);
}

for (const marker of [
  "this.v37LastLivelyAmbientAiAt = 0",
  "this.v37LivelyAmbientStats = {",
  "authority?.closeExhaustedScenes",
  "continuationDecision",
  "livelyAmbientEligible({",
  "preferredStructuredReadyProviders?.(now)",
  "builtInFailureFallbacks",
  "ambientLivelySingleCallAuthoritative: true"
]) {
  assert.ok(livelyCompat.includes(marker), `3G.2 must preserve marker: ${marker}`);
}

const headerLines = 4;
const compatBody = livelyCompat.split("\n").slice(headerLines).join("\n");
assert.equal(
  compatBody,
  frozenLively,
  "3G.2 replacement must remain byte-for-byte behavior-equivalent to frozen v37 lively ambient below its compatibility header"
);

console.log("v41 Phase 3G.2 v37 lively-ambient wrapper retirement checks passed");
