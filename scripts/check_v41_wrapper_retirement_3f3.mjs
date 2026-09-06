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

const presenceCompat = read("src/index_v41_presence_compat.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const qualityCompat = read("src/index_v41_quality_compat.js");
const frozenV39Coherence = read("src/index_v39_coherence.js");
const frozenV39Presence = read("src/index_v39_presence_fix.js");
const frozenV39World = read("src/index_v39_world_gate.js");
const frozenV40 = read("src/index_v40_scene_continuity.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");
const scene = read("src/index_v41_scene_coordinator.js");
const ambient = read("src/index_v41_ambient_continuity_compat.js");

assert.ok(presenceCompat.includes('from "./index_v41_coherence_compat.js"'));
assert.ok(!presenceCompat.includes('from "./index_v39_coherence.js"'));
assert.ok(coherenceCompat.includes('from "./index_v41_quality_compat.js"'));
assert.ok(qualityCompat.includes('from "./index_v37_lively_ambient.js"'));
assert.ok(!coherenceCompat.includes('from "./index_v38_quality_guard.js"'));
assert.ok(!coherenceCompat.includes('from "./index_v39_coherence.js"'));

assert.ok(coherenceCompat.includes('const PASS = "conversation-coherence-v39"'));
assert.ok(coherenceCompat.includes('url.pathname === "/api/v39-status"'));
assert.ok(coherenceCompat.includes('url.pathname === "/v39-status"'));
assert.ok(coherenceCompat.includes("this.v39RecentBotLeaves = new Map()"));
assert.ok(coherenceCompat.includes("this.v39PendingHumanDisconnects = new Map()"));
assert.ok(coherenceCompat.includes("this.v39Stats = {"));
assert.ok(coherenceCompat.includes("this.v39LastTargetRepair = null"));
assert.ok(coherenceCompat.includes("this.v39LastCoherenceLock = null"));

assert.ok(ownsMethod(coherenceCompat, "queueScenePlan"));
assert.ok(ownsMethod(coherenceCompat, "v39Snapshot"));
assert.ok(ownsMethod(coherenceCompat, "fetch"));
assert.ok(ownsMethod(coherenceCompat, "debugState"));
assert.ok(coherenceCompat.includes("filterSelfDialogueLines(lines || [])"));
assert.ok(coherenceCompat.includes('if (reason !== "background") return super.queueScenePlan'));
assert.ok(coherenceCompat.includes("this.v39Stats.selfDialogueLinesBlocked += filtered.blocked.length"));
assert.ok(coherenceCompat.includes("this.v39Stats.backgroundPlansFiltered += 1"));
assert.ok(coherenceCompat.includes('action: "v39-self-dialogue-lines-blocked"'));
assert.ok(coherenceCompat.includes("selfDialogueFilteringBackgroundOnly: true"));

for (const retiredOverride of [
  "lineViolation",
  "noteViolation",
  "resolveDirectTarget",
  "voiceBrainPlan",
  "v39ReentryRemaining",
  "desiredRoster",
  "announceBotLeave",
  "announceBotEnter",
  "system",
  "webSocketClose",
  "historicalAudit"
]) {
  assert.equal(
    ownsMethod(coherenceCompat, retiredOverride),
    false,
    `3F.3 must not copy extracted v39 override ${retiredOverride}()`
  );
}

assert.ok(frozenV39Coherence.includes('from "./index_v38_quality_guard.js"'));
assert.ok(frozenV39Coherence.includes("filterSelfDialogueLines(lines || [])"));
assert.ok(frozenV39Coherence.includes("resolveDirectTarget(text, sender ="));
assert.ok(frozenV39Coherence.includes("webSocketClose(ws"));
assert.ok(frozenV39Presence.includes('from "./index_v39_coherence.js"'));
assert.ok(frozenV39World.includes('from "./index_v39_presence_fix.js"'));
assert.ok(frozenV40.includes('from "./index_v39_world_gate.js"'));

const v41ProductionSpine = [
  generationBase,
  roster,
  worldDate,
  coherence,
  reconnect,
  scene,
  ambient,
  presenceCompat,
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

console.log("v41 Phase 3F.3 v39 coherence-wrapper retirement checks passed");
