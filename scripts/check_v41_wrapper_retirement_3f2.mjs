import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const scene = read("src/index_v41_scene_coordinator.js");
const ambient = read("src/index_v41_ambient_continuity_compat.js");
const presenceCompat = read("src/index_v41_presence_compat.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const frozenV40 = read("src/index_v40_scene_continuity.js");
const frozenV39World = read("src/index_v39_world_gate.js");
const frozenV39Presence = read("src/index_v39_presence_fix.js");
const frozenV39Coherence = read("src/index_v39_coherence.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");

assert.ok(scene.includes('from "./index_v41_ambient_continuity_compat.js"'));
assert.ok(ambient.includes('from "./index_v41_presence_compat.js"'));
assert.ok(!ambient.includes('from "./index_v39_presence_fix.js"'));
assert.ok(presenceCompat.includes('from "./index_v39_coherence.js"'));
assert.ok(!presenceCompat.includes('from "./index_v39_presence_fix.js"'));

for (const method of [
  "humanSocketRows()",
  "humanNames()",
  "activeHumanConnectionCount(name)",
  "async generateGroqBatch()",
  "v39Snapshot(now = Date.now())",
  "async fetch(request)"
]) {
  assert.ok(presenceCompat.includes(method), `presence compatibility must preserve ${method}`);
}

function ownsMethod(source, name) {
  return source.split("\n").some((line) =>
    line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`)
  );
}

for (const retiredOverride of [
  "lineViolation",
  "noteViolation",
  "voiceBrainPlan",
  "system",
  "webSocketClose",
  "historicalAudit",
  "replaceExistingHumanSessions"
]) {
  assert.equal(
    ownsMethod(presenceCompat, retiredOverride),
    false,
    `3F.2 must not copy extracted override ${retiredOverride}()`
  );
}

assert.ok(presenceCompat.includes("this.v39HumanReplacementAt = new Map()"));
assert.ok(presenceCompat.includes("this.v39PresenceFixStats = {"));
assert.ok(presenceCompat.includes("this.v39CaptureFixStats = {"));
assert.ok(presenceCompat.includes("legacyQuickBackgroundCallsSuppressed"));
assert.ok(presenceCompat.includes("logicalHumanPresenceDeduplication: true"));
assert.ok(presenceCompat.includes("this.replaceExistingHumanSessions(name, Date.now())"));

assert.ok(worldDate.includes('from "./index_v41_presence_compat.js"'));
assert.ok(worldDate.includes("V41PresenceCompatChatRoom.prototype.v39Snapshot.call(this, now)"));
assert.ok(worldDate.includes("V41PresenceCompatChatRoom.prototype.say.call(this"));

assert.ok(frozenV40.includes('from "./index_v39_world_gate.js"'));
assert.ok(frozenV39World.includes('from "./index_v39_presence_fix.js"'));
assert.ok(frozenV39Presence.includes('from "./index_v39_coherence.js"'));
assert.ok(frozenV39Presence.includes("historicalDateMismatch(text, now)"));
assert.ok(frozenV39Presence.includes("applyErrorChallengePlan(plan, human)"));
assert.ok(frozenV39Presence.includes("webSocketClose(ws"));
assert.ok(frozenV39Coherence.includes('from "./index_v38_quality_guard.js"'));

const v41ProductionSpine = [
  generationBase,
  roster,
  worldDate,
  coherence,
  reconnect,
  scene,
  ambient,
  presenceCompat
].join("\n");
assert.equal(v41ProductionSpine.includes('from "./index_v39_world_gate.js"'), false);
assert.equal(v41ProductionSpine.includes('from "./index_v39_presence_fix.js"'), false);

console.log("v41 Phase 3F.2 v39 presence-wrapper retirement checks passed");
