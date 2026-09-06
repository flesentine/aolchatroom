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
const humanOnlyCompat = read("src/index_v41_human_only_compat.js");
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

assert.ok(providerCompat.includes('from "./index_v41_human_only_compat.js"'));
assert.ok(!providerCompat.includes('from "./index_v37_human_only.js"'));
assert.ok(humanOnlyCompat.includes('from "./index_v37_hotfix.js"'));
assert.ok(frozenHumanOnly.includes('from "./index_v37_hotfix.js"'));
assert.ok(hotfix.includes('from "./index_v37.js"'));

for (const method of [
  "providerCapacityConstrained",
  "activeAmbientCharacters",
  "generateHumanReplan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(humanOnlyCompat, method), true, `3G.5 must preserve live residual ${method}()`);
}

for (const retiredMethod of [
  "ambientAiPrompt",
  "generateAdaptiveAmbientAi",
  "generateBackgroundPlan"
]) {
  assert.equal(
    ownsMethod(humanOnlyCompat, retiredMethod),
    false,
    `3G.5 must not copy superseded adaptive-ambient method ${retiredMethod}()`
  );
  assert.equal(
    ownsMethod(frozenHumanOnly, retiredMethod),
    true,
    `frozen v37 human-only wrapper must retain ${retiredMethod}()`
  );
}

for (const marker of [
  "this.v37AmbientProviderCursor = 0",
  "this.v37LastAmbientAiAt = 0",
  "this.v37AdaptiveAmbientStats = {",
  "if (preferred.length >= 1) return false",
  "ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)",
  "humanModelFallbacks",
  "humanModelFallbackMisses",
  "adaptiveAmbientAi: true",
  "ambientSingleProviderAttempt: true",
  "ambientSingleCallExchange: true"
]) {
  assert.ok(humanOnlyCompat.includes(marker), `3G.5 must preserve marker: ${marker}`);
}

assert.ok(
  livelyCompat.includes("this.v37AmbientProviderCursor % preferred.length"),
  "lively ambient must still consume the residual provider cursor initialized by 3G.5"
);
assert.ok(
  livelyCompat.includes("this.activeAmbientCharacters?.()"),
  "lively ambient must still consume the residual active-ambient-character helper"
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
  humanDirectorCompat,
  providerCompat,
  humanOnlyCompat
].join("\n");

assert.equal(
  v41ProductionSpine.includes('from "./index_v37_human_only.js"'),
  false,
  "3G.5 must remove the retired v37 human-only wrapper from every v41 production dependency edge"
);

for (const source of [roster, worldDate, coherence, reconnect]) {
  assert.ok(source.includes('from "./index_v37_hotfix.js"'));
  assert.ok(!source.includes('from "./index_v37_human_only.js"'));
}

console.log("v41 Phase 3G.5 v37 human-only residual wrapper retirement checks passed");
