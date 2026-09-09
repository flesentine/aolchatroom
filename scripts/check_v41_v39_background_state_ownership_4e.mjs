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

const srcDir = new URL("../src/", import.meta.url);
const v41Sources = fs.readdirSync(srcDir)
  .filter((name) => name.endsWith(".js") && name.includes("v41"))
  .map((name) => [`src/${name}`, read(`src/${name}`)]);

const authority = read("src/v39_background_compatibility_v41.js");
const coherence = read("src/index_v41_coherence_compat.js");
const presence = read("src/index_v41_presence_compat.js");
const quality = read("src/index_v41_quality_compat.js");
const world = read("src/world_date_guard_v41.js");
const worker = read("test/runtime_generation_contract_worker.js");
const runtime = read("scripts/check_v41_generation_contract_runtime.mjs");
const pkg = read("package.json");
const phase4a = read("scripts/check_v41_v39_shared_state_characterization_4a.mjs");
const phase4b = read("scripts/check_v41_reconnect_state_ownership_4b.mjs");
const phase4c = read("scripts/check_v41_coherence_repair_state_ownership_4c.mjs");
const phase4d = read("scripts/check_v41_world_roster_state_ownership_4d.mjs");

for (const [path, source] of v41Sources) {
  assert.equal(source.includes("this.v39Stats = {"), false, `4E retired v39Stats initializer must be absent: ${path}`);
  assert.equal(source.includes("this.v39CaptureFixStats = {"), false, `4E retired v39CaptureFixStats initializer must be absent: ${path}`);
}

assert.deepEqual(
  objectKeys(authority, "this.backgroundStats = {"),
  ["backgroundPlansFiltered", "selfDialogueLinesBlocked"],
  "4E background telemetry schema must stay exact"
);
assert.deepEqual(
  objectKeys(authority, "this.captureFixStats = {"),
  ["legacyQuickBackgroundCallsSuppressed"],
  "4E capture telemetry schema must stay exact"
);

for (const marker of [
  "filterSelfDialogueLines(lines || [])",
  "this.backgroundStats.selfDialogueLinesBlocked += filtered.blocked.length",
  "this.backgroundStats.backgroundPlansFiltered += 1",
  "this.captureFixStats.legacyQuickBackgroundCallsSuppressed += 1",
  'action: "v39-self-dialogue-lines-blocked"',
  "legacyV39Stats()",
  "legacyCaptureFixStats()",
  "stateOwnedByAuthority: true"
]) assert.ok(authority.includes(marker), `4E authority must retain marker: ${marker}`);

for (const marker of [
  'from "./v39_background_compatibility_v41.js"',
  "this.v39BackgroundCompatibilityCoordinator = new V39BackgroundCompatibilityAuthority(this)",
  "v39BackgroundCompatibilityAuthority()",
  "v39BackgroundCompatibilityCoordinator.queueScenePlan(",
  "backgroundAuthority?.legacyV39Stats",
  "stats: { ...backgroundStats, ...repairStats, ...worldDateStats, ...rosterStats, ...reconnectStats }"
]) assert.ok(coherence.includes(marker), `4E coherence bridge must retain marker: ${marker}`);

for (const marker of [
  "v39BackgroundCompatibilityAuthority().suppressLegacyQuickBackground()",
  "legacyCaptureFixStats",
  "legacyQuickBackgroundCallsSuppressed: 0"
]) assert.ok(presence.includes(marker), `4E presence bridge must retain marker: ${marker}`);

assert.equal(
  objectKeys(quality, "this.v38QualityStats = {").includes("eraLinesBlocked"),
  false,
  "4E retained proof must accept 4F retirement of hard-era telemetry from v38QualityStats"
);
assert.deepEqual(
  objectKeys(world, "this.eraStats = {"),
  ["eraLinesBlocked"],
  "4E retained proof must recognize 4F world/date hard-era telemetry ownership"
);
assert.ok(quality.includes("this.worldDateGuardAuthority?.()?.legacyV38Stats?.()"));
assert.ok(worker.includes("contractV41V39BackgroundStateOwnership()"));
assert.ok(worker.includes('"v41-v39-background-state-ownership"'));
assert.ok(runtime.includes('"v41-v39-background-state-ownership"'));
assert.ok(pkg.includes("check_v41_v39_background_state_ownership_4e.mjs"));

for (const [name, source] of [
  ["4A", phase4a],
  ["4B", phase4b],
  ["4C", phase4c],
  ["4D", phase4d]
]) {
  assert.ok(
    source.includes("after 4E background compatibility consolidation"),
    `4E retained proof handoff must be advanced through 4E for ${name}`
  );
}

console.log("v41 Phase 4E residual v39 background state ownership checks passed after 4F v38 telemetry consolidation");
