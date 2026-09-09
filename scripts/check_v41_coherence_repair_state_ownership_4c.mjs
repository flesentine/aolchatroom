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
      if (depth === 0) {
        end = i;
        break;
      }
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

const repair = read("src/coherence_repair_v41.js");
const repairWrapper = read("src/index_v41_coherence_repair.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const presenceCompat = read("src/index_v41_presence_compat.js");
const worker = read("test/runtime_generation_contract_worker.js");
const runtime = read("scripts/check_v41_generation_contract_runtime.mjs");
const phase4a = read("scripts/check_v41_v39_shared_state_characterization_4a.mjs");
const phase4b = read("scripts/check_v41_reconnect_state_ownership_4b.mjs");

for (const [path, source] of v41Sources) {
  for (const retiredSurface of [
    "v39LastTargetRepair",
    "v39LastCoherenceLock"
  ]) {
    assert.equal(
      source.includes(retiredSurface),
      false,
      `4C retired coherence room state must be absent from live v41 production: ${path} references ${retiredSurface}`
    );
  }

  for (const retiredWrite of [
    "v39Stats.clarificationTargetRepairs",
    "v39Stats.coherenceVoiceLocks",
    "v39CaptureFixStats.explicitErrorChallengesRepaired"
  ]) {
    assert.equal(
      source.includes(retiredWrite),
      false,
      `4C coherence telemetry must not be written through compatibility-owned state: ${path} references ${retiredWrite}`
    );
  }
}

for (const marker of [
  "this.lastTargetRepair = null",
  "this.lastCoherenceLock = null",
  "this.repairStats = {",
  "this.captureFixStats = {",
  "this.repairStats.clarificationTargetRepairs += 1",
  "this.lastTargetRepair = {",
  "this.repairStats.coherenceVoiceLocks += 1",
  "this.lastCoherenceLock = {",
  "this.captureFixStats.explicitErrorChallengesRepaired += 1",
  "legacyV39Stats()",
  "legacyCaptureFixStats()",
  "legacyLastTargetRepair()",
  "legacyLastCoherenceLock()",
  "stateOwnedByAuthority: true"
]) {
  assert.ok(repair.includes(marker), `4C coherence authority must own marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(repair, "this.repairStats = {"),
  [
    "clarificationTargetRepairs",
    "coherenceVoiceLocks"
  ],
  "4C coherence repair telemetry schema must stay exact"
);

assert.deepEqual(
  objectKeys(repair, "this.captureFixStats = {"),
  ["explicitErrorChallengesRepaired"],
  "4C explicit-error telemetry schema must stay exact"
);

assert.deepEqual(
  objectKeys(coherenceCompat, "this.v39Stats = {"),
  [
    "backgroundPlansFiltered",
    "selfDialogueLinesBlocked"
  ],
  "4C mixed v39Stats must contain only compatibility-shell counters after 4D"
);

assert.deepEqual(
  objectKeys(coherenceCompat, "const EMPTY_V39_REPAIR_STATS = Object.freeze({"),
  [
    "clarificationTargetRepairs",
    "coherenceVoiceLocks"
  ],
  "4C legacy repair fallback schema must stay exact"
);

assert.deepEqual(
  objectKeys(presenceCompat, "this.v39CaptureFixStats = {"),
  [
    "legacyQuickBackgroundCallsSuppressed"
  ],
  "4C presence capture stats must contain only compatibility-shell counters after 4D"
);

for (const marker of [
  "this.coherenceRepairAuthority?.() || null",
  "legacyV39Stats",
  "legacyLastTargetRepair",
  "legacyLastCoherenceLock",
  "stats: { ...this.v39Stats, ...repairStats, ...worldDateStats, ...rosterStats, ...reconnectStats }"
]) {
  assert.ok(coherenceCompat.includes(marker), `4C coherence compatibility must compose legacy repair diagnostics: ${marker}`);
}

for (const marker of [
  "this.coherenceRepairAuthority?.()?.legacyCaptureFixStats?.()",
  "explicitErrorChallengesRepaired: 0"
]) {
  assert.ok(presenceCompat.includes(marker), `4C presence compatibility must compose legacy repair telemetry: ${marker}`);
}

assert.ok(repairWrapper.includes("new CoherenceRepairAuthority(this)"));
assert.ok(repairWrapper.includes("coherenceRepairAuthority()"));

assert.ok(worker.includes("contractV41CoherenceRepairStateOwnership()"));
assert.ok(worker.includes('"v41-coherence-repair-state-ownership"'));
assert.ok(worker.includes('Object.hasOwn(this, "v39LastTargetRepair")'));
assert.ok(worker.includes('Object.hasOwn(this, "v39LastCoherenceLock")'));
assert.ok(worker.includes("legacyV39SnapshotPreserved: true"));
assert.ok(runtime.includes('"v41-coherence-repair-state-ownership"'));

assert.ok(phase4a.includes("after 4D world/roster consolidation"));
assert.ok(phase4b.includes("after 4D world/roster consolidation"));

console.log("v41 Phase 4C coherence repair state ownership checks passed after 4D world/roster consolidation");
