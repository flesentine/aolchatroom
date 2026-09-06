import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const scene = read("src/index_v41_scene_coordinator.js");
const compat = read("src/index_v41_ambient_continuity_compat.js");
const presenceCompat = read("src/index_v41_presence_compat.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const qualityCompat = read("src/index_v41_quality_compat.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const frozenV40 = read("src/index_v40_scene_continuity.js");
const frozenV39World = read("src/index_v39_world_gate.js");
const presence = read("src/index_v39_presence_fix.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");

assert.ok(scene.includes('from "./index_v41_ambient_continuity_compat.js"'));
assert.ok(!scene.includes('from "./index_v40_scene_continuity.js"'));
assert.ok(compat.includes('from "./index_v41_presence_compat.js"'));
assert.ok(presenceCompat.includes('from "./index_v41_coherence_compat.js"'));
assert.ok(coherenceCompat.includes('from "./index_v41_quality_compat.js"'));
assert.ok(qualityCompat.includes('from "./index_v37_lively_ambient.js"'));
assert.ok(!compat.includes('from "./index_v39_world_gate.js"'));
assert.ok(compat.includes('const PASS = "scene-continuity-v40"'));
assert.ok(compat.includes("currentAmbientMomentum(now = Date.now())"));
assert.ok(compat.includes("sceneMomentumPrompt(momentum)"));
assert.ok(compat.includes("selectCarryIndices"));
assert.ok(compat.includes("v40ObservationStats.backgroundQueueAttempts"));
assert.ok(compat.includes("v40Snapshot(now = Date.now())"));

assert.ok(frozenV40.includes('from "./index_v39_world_gate.js"'), "frozen v40 must remain byte-semantically on the old world wrapper path");
assert.ok(frozenV39World.includes('from "./index_v39_presence_fix.js"'));
assert.ok(frozenV39World.includes("futureGameProductViolation(text, now, context)"));
assert.ok(presence.includes('from "./index_v39_coherence.js"'));

assert.ok(worldDate.includes("this.v39WorldGateStats ||= {"));
assert.ok(worldDate.includes("futureGameProductLinesBlocked: 0"));
assert.ok(worldDate.includes("v39Snapshot(now = Date.now())"));
assert.ok(worldDate.includes("V41PresenceCompatChatRoom.prototype.v39Snapshot.call(this, now)"));
assert.ok(worldDate.includes("futureGameProductAuditAllRetained"));
assert.ok(worldDate.includes("worldGatePolicy"));
assert.ok(worldDate.includes("futureGameProductBoundary: true"));
assert.ok(worldDate.includes("auditedPublicClaimsBlockedPreDisplay: true"));
assert.ok(worldDate.includes("periodConsoleLabelNormalization: true"));

const v41ProductionSpine = [generationBase, roster, worldDate, coherence, reconnect, scene, compat, presenceCompat, coherenceCompat, qualityCompat].join("\n");
assert.equal(
  v41ProductionSpine.includes('from "./index_v39_world_gate.js"'),
  false,
  "v39 world must not appear anywhere in the v41 production inheritance spine after 3F.1"
);

console.log("v41 Phase 3F.1 v39 world-wrapper retirement checks passed");
