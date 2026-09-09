import assert from "node:assert/strict";
import fs from "node:fs";
import { collectLastMatching, findLastMatching } from "../src/hotpath_collections_v41.js";

const rows = [
  { id: 1, kind: "system" },
  { id: 2, kind: "human" },
  { id: 3, kind: "bot" },
  { id: 4, kind: "human" },
  { id: 5, kind: "system" },
  { id: 6, kind: "bot" }
];

const oldLastHuman = [...rows].reverse().find((row) => row.kind === "human") || null;
assert.equal(findLastMatching(rows, (row) => row.kind === "human"), oldLastHuman);
assert.equal(findLastMatching([], () => true), null);

const oldRecent = rows.filter((row) => row.kind === "human" || row.kind === "bot").slice(-3);
const newRecent = collectLastMatching(rows, 3, (row) => row.kind === "human" || row.kind === "bot");
assert.deepEqual(newRecent, oldRecent, "bounded backward collection must preserve original order and legacy selection");

const tieScenes = [
  { id: "first", turns: 12 },
  { id: "second", turns: 12 },
  { id: "fresh", turns: 2 }
];
let selected = null;
for (const candidate of tieScenes) {
  if (Number(candidate.turns || 0) < 8) continue;
  if (!selected || Number(candidate.turns || 0) > Number(selected.turns || 0)) selected = candidate;
}
const oldSelected = [...tieScenes]
  .filter((item) => Number(item.turns || 0) >= 8)
  .sort((a, b) => Number(b.turns || 0) - Number(a.turns || 0))[0] || null;
assert.equal(selected, oldSelected, "single-pass scene selection must preserve stable tie behavior");

const lively = fs.readFileSync(new URL("../src/index_v41_lively_ambient_compat.js", import.meta.url), "utf8");
const scene = fs.readFileSync(new URL("../src/scene_coordinator_v41.js", import.meta.url), "utf8");
const ownership = fs.readFileSync(new URL("../src/scene_ownership_coordinator_v41.js", import.meta.url), "utf8");
const quality = fs.readFileSync(new URL("../src/index_v41_quality_compat.js", import.meta.url), "utf8");

assert.equal(lively.includes("[...(this.history || [])].reverse().find"), false);
assert.equal(scene.includes("[...rows].reverse().find"), false);
assert.equal(scene.includes("[...this.history()].reverse().find"), false);
assert.equal(ownership.includes("[...rows].reverse().find"), false);
assert.equal(ownership.includes("[...this.history()].reverse().find"), false);
assert.equal(scene.includes(".filter((item) => fatiguePhase(item?.turns) !== \"fresh\")"), false);
assert.equal(quality.includes("return [...this.v38TopicCooling.entries()]"), false);
assert.ok(lively.includes("collectLastMatching("));
assert.ok(lively.includes("findLastMatching("));
assert.ok(scene.includes("findLastMatching("));
assert.ok(ownership.includes("findLastMatching("));

console.log("O4 zero-copy hot-path checks passed");
