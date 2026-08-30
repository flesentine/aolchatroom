import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canonicalRoomTopic,
  filterFatiguedBackgroundLines,
  hardEraViolation,
  roomTopicFatigue,
  topicFatiguePromptNote
} from "../src/quality_guard_v38.js";
import { eraWorldViolation } from "../src/era_world.js";

const NOW = Date.parse("2026-08-29T09:30:00-07:00");
const DATE = "1996-08-29";

// Captured production regression: PS4 must be impossible in August 1996.
assert.equal(eraWorldViolation("ps4 already got those classics", DATE), "future-console");
assert.equal(eraWorldViolation("playstation 4 looks better", DATE), "future-console");
assert.equal(eraWorldViolation("xbox is better anyway", DATE), "future-console");
assert.equal(eraWorldViolation("dreamcast rules", DATE), "future-console");
assert.equal(eraWorldViolation("playstation rules", DATE), "");
assert.equal(eraWorldViolation("i got an n64 already", DATE), "n64-us-access-too-early");
assert.equal(eraWorldViolation("n64 is gonna be huge", DATE), "");
assert.equal(hardEraViolation("ps4 already got those classics", NOW)?.kind, "future-era-technology");

// Topic canonicalization must catch both metadata and obvious lexical fallbacks.
assert.equal(canonicalRoomTopic({ topic: "gaming", text: "whatever" }), "gaming");
assert.equal(canonicalRoomTopic({ topic: "general", text: "playstation vs n64 again" }), "gaming");
assert.equal(canonicalRoomTopic({ topic: "metal", text: "whatever" }), "metal");
assert.equal(canonicalRoomTopic({ topic: "general", text: "metallica load album again" }), "metal");
assert.equal(canonicalRoomTopic({ topic: "general", text: "just got coffee" }), "");

const history = [];
let at = NOW - 120000;
function add(topic, text, sceneId) {
  history.push({ kind: "bot", from: `Bot${history.length}`, topic, text, sceneId, at });
  at += 3500;
}

for (let i = 0; i < 8; i += 1) add("gaming", i % 2 ? "playstation rules" : "n64 graphics again", `game-${i % 3}`);
for (let i = 0; i < 6; i += 1) add("metal", i % 2 ? "metallica again" : "load album still good", `metal-${i % 2}`);
for (let i = 0; i < 10; i += 1) add(i % 2 ? "school" : "general", i % 2 ? "homework tonight" : "random room line", `other-${i}`);

const fatigue = roomTopicFatigue(history, NOW);
assert.deepEqual(fatigue.topics.map((row) => row.topic), ["gaming", "metal"]);
assert.ok(topicFatiguePromptNote(fatigue).includes("gaming, metal"));

const filtered = filterFatiguedBackgroundLines([
  { speaker: "A", topic: "gaming", text: "ps again" },
  { speaker: "B", topic: "general", text: "metallica load album" },
  { speaker: "C", topic: "school", text: "homework blows" },
  { speaker: "D", topic: "general", text: "anyone hungry" }
], fatigue.topics);
assert.equal(filtered.blocked.length, 2);
assert.equal(filtered.kept.length, 2);
assert.deepEqual(filtered.blocked.map((row) => row._v38FatiguedTopic), ["gaming", "metal"]);

// Source-level contract: only background planning is filtered. Human-directed replans stay authoritative.
const v38Source = fs.readFileSync(new URL("../src/index_v38_quality_guard.js", import.meta.url), "utf8");
assert.match(v38Source, /if \(reason !== "background"\) return super\.queueScenePlan/);
assert.match(v38Source, /hardEraViolation\(text, now\)/);
assert.match(v38Source, /v38 room-wide topic fatigue/);
assert.match(v38Source, /qualityGuardV38/);

console.log("v38 quality-guard regression checks passed");
