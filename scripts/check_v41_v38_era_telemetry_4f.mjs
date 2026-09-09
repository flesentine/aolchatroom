import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function objectKeys(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing object marker: ${marker}`);
  const open = source.indexOf("{", start);
  assert.ok(open >= 0, `missing object body: ${marker}`);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  assert.ok(end > open, `unterminated object marker: ${marker}`);
  return source.slice(open + 1, end)
    .split("\n")
    .map((line) => /^\s*([A-Za-z0-9_]+)\s*:/.exec(line)?.[1] || "")
    .filter(Boolean)
    .sort();
}

const world = read("src/world_date_guard_v41.js");
const quality = read("src/index_v41_quality_compat.js");
const worker = read("test/runtime_generation_contract_worker.js");
const runtime = read("scripts/check_v41_generation_contract_runtime.mjs");
const pkg = read("package.json");
const phase3d = read("scripts/check_v41_world_date_guard_3d.mjs");
const phase3f4 = read("scripts/check_v41_wrapper_retirement_3f4.mjs");
const phase4d = read("scripts/check_v41_world_roster_state_ownership_4d.mjs");
const phase4e = read("scripts/check_v41_v39_background_state_ownership_4e.mjs");

assert.deepEqual(
  objectKeys(world, "this.eraStats = {"),
  ["eraLinesBlocked"],
  "4F world/date hard-era telemetry schema must stay exact"
);
assert.deepEqual(
  objectKeys(quality, "this.v38QualityStats = {"),
  [
    "backgroundPlansFiltered",
    "fatiguedBackgroundLinesBlocked",
    "topicFatigueActivations",
    "topicFatigueSceneCloses"
  ],
  "4F quality compatibility telemetry must retain only topic-fatigue counters"
);

for (const marker of [
  "this.eraStats.eraLinesBlocked += 1",
  "legacyV38Stats()",
  "eraStats: this.legacyV38Stats()"
]) {
  assert.ok(world.includes(marker), `4F world/date authority must retain marker: ${marker}`);
}
assert.equal(world.includes("this.room.v38QualityStats"), false, "4F world/date authority must not write quality compatibility state");

for (const marker of [
  "this.worldDateGuardAuthority?.()?.legacyV38Stats?.()",
  "stats: { ...eraStats, ...this.v38QualityStats }"
]) {
  assert.ok(quality.includes(marker), `4F v38 snapshot bridge must retain marker: ${marker}`);
}

assert.ok(worker.includes("contractV41V38EraTelemetryOwnership()"));
assert.ok(worker.includes('"v41-v38-era-telemetry-ownership"'));
assert.ok(runtime.includes('"v41-v38-era-telemetry-ownership"'));
assert.ok(pkg.includes("check_v41_v38_era_telemetry_4f.mjs"));

for (const [name, source] of [
  ["3D", phase3d],
  ["3F.4", phase3f4],
  ["4D", phase4d],
  ["4E", phase4e]
]) {
  assert.ok(
    source.includes("after 4F v38 telemetry consolidation"),
    `4F retained proof handoff must be advanced for ${name}`
  );
}

console.log("v41 Phase 4F v38 hard-era telemetry ownership checks passed");
