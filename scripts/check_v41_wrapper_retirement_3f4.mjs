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
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const frozenV38 = read("src/index_v38_quality_guard.js");
const frozenV39Coherence = read("src/index_v39_coherence.js");
const frozenV40 = read("src/index_v40_scene_continuity.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");
const scene = read("src/index_v41_scene_coordinator.js");
const ambient = read("src/index_v41_ambient_continuity_compat.js");
const presence = read("src/index_v41_presence_compat.js");

assert.ok(coherenceCompat.includes('from "./index_v41_quality_compat.js"'));
assert.ok(!coherenceCompat.includes('from "./index_v38_quality_guard.js"'));
assert.ok(qualityCompat.includes('from "./index_v41_lively_ambient_compat.js"'));
assert.ok(!qualityCompat.includes('from "./index_v38_quality_guard.js"'));

assert.ok(qualityCompat.includes('const PASS = "quality-guard-v38"'));
assert.ok(qualityCompat.includes('url.pathname === "/api/v38-status"'));
assert.ok(qualityCompat.includes('url.pathname === "/v38-status"'));
assert.ok(qualityCompat.includes("this.v38TopicCooling = new Map()"));
assert.ok(qualityCompat.includes("this.v38QualityStats = {"));

for (const liveMethod of [
  "pruneV38TopicCooling",
  "activeV38TopicCooling",
  "detectRoomTopicFatigue",
  "applyRoomTopicFatigue",
  "livelyAmbientPrompt",
  "queueScenePlan",
  "v38Snapshot",
  "v37Snapshot",
  "fetch",
  "debugState"
]) {
  assert.equal(ownsMethod(qualityCompat, liveMethod), true, `3F.4 must preserve ${liveMethod}()`);
}

assert.ok(qualityCompat.includes("roomTopicFatigue(this.history || [], now)"));
assert.ok(qualityCompat.includes("topicFatiguePromptNote({"));
assert.ok(qualityCompat.includes("filterFatiguedBackgroundLines(lines, cooling)"));
assert.ok(qualityCompat.includes('if (reason !== "background") return super.queueScenePlan'));
assert.ok(qualityCompat.includes("authority?.closeTopicFatigueScenes"));
assert.ok(qualityCompat.includes('action: "v38-room-topic-fatigue-close"'));
assert.ok(qualityCompat.includes('action: "v38-room-topic-lines-blocked"'));
assert.ok(qualityCompat.includes("backgroundTopicCoolingOnly: true"));
assert.ok(qualityCompat.includes("directHumanPlansNeverFilteredForTopicFatigue: true"));
assert.ok(qualityCompat.includes("eraAuditAllRetained: eraAudit"));

for (const extractedOverride of ["lineViolation", "noteViolation", "historicalAudit"]) {
  assert.equal(
    ownsMethod(qualityCompat, extractedOverride),
    false,
    `3F.4 must not copy Phase 3D-owned v38 override ${extractedOverride}()`
  );
}

assert.ok(worldDate.includes("V37FreeProviderChatRoom.prototype.lineViolation.call"));
assert.ok(worldDate.includes("V37FreeProviderChatRoom.prototype.noteViolation.call"));
assert.ok(worldDate.includes("V37FreeProviderChatRoom.prototype.historicalAudit.call"));
assert.ok(worldDate.includes("legacyV38V39WorldDateOverridesBypassedInV41Production: true"));
assert.ok(worldDate.includes("legacyV38V39WorldDateCountersPreserved: true"));

assert.ok(frozenV38.includes('from "./index_v37_lively_ambient.js"'));
assert.ok(frozenV38.includes("hardEraViolation(text, now)"));
assert.ok(frozenV38.includes("historicalAudit(includeAll = false)"));
assert.ok(frozenV38.includes("filterFatiguedBackgroundLines(lines, cooling)"));
assert.ok(frozenV39Coherence.includes('from "./index_v38_quality_guard.js"'));
assert.ok(frozenV40.includes('from "./index_v39_world_gate.js"'));

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
  qualityCompat
].join("\n");
for (const retiredImport of [
  'from "./index_v39_world_gate.js"',
  'from "./index_v39_presence_fix.js"',
  'from "./index_v39_coherence.js"',
  'from "./index_v38_quality_guard.js"'
]) {
  assert.equal(
    v41ProductionSpine.includes(retiredImport),
    false,
    `v41 production spine must not retain ${retiredImport}`
  );
}

console.log("v41 Phase 3F.4 v38 quality-wrapper retirement checks passed");
