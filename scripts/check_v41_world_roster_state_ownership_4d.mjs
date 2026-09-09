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

const world = read("src/world_date_guard_v41.js");
const worldWrapper = read("src/index_v41_world_date_guard.js");
const roster = read("src/bot_roster_reentry_v41.js");
const rosterWrapper = read("src/index_v41_bot_roster_reentry.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const presenceCompat = read("src/index_v41_presence_compat.js");
const background = read("src/v39_background_compatibility_v41.js");
const worker = read("test/runtime_generation_contract_worker.js");
const runtime = read("scripts/check_v41_generation_contract_runtime.mjs");
const phase4a = read("scripts/check_v41_v39_shared_state_characterization_4a.mjs");
const phase4b = read("scripts/check_v41_reconnect_state_ownership_4b.mjs");
const phase4c = read("scripts/check_v41_coherence_repair_state_ownership_4c.mjs");

for (const [path, source] of v41Sources) {
  for (const retiredSurface of [
    "v39WorldGateStats",
    "v39RecentBotLeaves"
  ]) {
    assert.equal(
      source.includes(retiredSurface),
      false,
      `4D retired world/roster room state must be absent from live v41 production: ${path} references ${retiredSurface}`
    );
  }

  for (const retiredWrite of [
    "v39Stats.futureEventLinesBlocked",
    "v39Stats.botReentryBlocks",
    "v39CaptureFixStats.historicalDateClaimsBlocked"
  ]) {
    assert.equal(
      source.includes(retiredWrite),
      false,
      `4D world/roster telemetry must not be written through compatibility-owned state: ${path} references ${retiredWrite}`
    );
  }
}

for (const marker of [
  "this.worldGateStats = {",
  "this.captureFixStats = {",
  "this.coherenceStats = {",
  "this.worldGateStats.futureGameProductLinesBlocked += 1",
  "this.worldGateStats.auditedPublicClaimsBlocked += 1",
  "this.worldGateStats.consoleLabelsNormalized += 1",
  "this.captureFixStats.historicalDateClaimsBlocked += 1",
  "this.coherenceStats.futureEventLinesBlocked += 1",
  "legacyWorldGateStats()",
  "legacyCaptureFixStats()",
  "legacyV39Stats()",
  "stateOwnedByAuthority: true"
]) {
  assert.ok(world.includes(marker), `4D world/date authority must own marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(world, "this.worldGateStats = {"),
  [
    "auditedPublicClaimsBlocked",
    "consoleLabelsNormalized",
    "futureGameProductLinesBlocked"
  ],
  "4D world-gate telemetry schema must stay exact"
);

assert.deepEqual(
  objectKeys(world, "this.captureFixStats = {"),
  ["historicalDateClaimsBlocked"],
  "4D historical-date telemetry schema must stay exact"
);

assert.deepEqual(
  objectKeys(world, "this.coherenceStats = {"),
  ["futureEventLinesBlocked"],
  "4D future-event telemetry schema must stay exact"
);

for (const marker of [
  "this.recentBotLeaves = new Map()",
  "this.rosterStats = {",
  "this.recentBotLeaves.get(name)",
  "this.recentBotLeaves.set(name, now)",
  "this.rosterStats.botReentryBlocks += 1",
  "legacyV39Stats()",
  "legacyRecentlyDeparted(now = Date.now())",
  "stateOwnedByAuthority: true"
]) {
  assert.ok(roster.includes(marker), `4D roster authority must own marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(roster, "this.rosterStats = {"),
  ["botReentryBlocks"],
  "4D roster telemetry schema must stay exact"
);

assert.equal(coherenceCompat.includes("this.v39Stats = {"), false, "4D retained proof must accept 4E retirement of mixed v39Stats");
assert.equal(presenceCompat.includes("this.v39CaptureFixStats = {"), false, "4D retained proof must accept 4E retirement of v39CaptureFixStats");
assert.deepEqual(
  objectKeys(background, "this.backgroundStats = {"),
  ["backgroundPlansFiltered", "selfDialogueLinesBlocked"],
  "4D retained proof must recognize 4E background telemetry ownership"
);
assert.deepEqual(
  objectKeys(background, "this.captureFixStats = {"),
  ["legacyQuickBackgroundCallsSuppressed"],
  "4D retained proof must recognize 4E quick-background telemetry ownership"
);

for (const marker of [
  "this.worldDateGuardAuthority?.() || null",
  "worldDateAuthority?.legacyV39Stats",
  "this.botRosterReentryAuthority?.() || null",
  "rosterAuthority?.legacyV39Stats",
  "rosterAuthority?.legacyRecentlyDeparted",
  "stats: { ...backgroundStats, ...repairStats, ...worldDateStats, ...rosterStats, ...reconnectStats }"
]) {
  assert.ok(coherenceCompat.includes(marker), `4D coherence compatibility must compose world/roster diagnostics: ${marker}`);
}

for (const marker of [
  "this.worldDateGuardAuthority?.()?.legacyCaptureFixStats?.()",
  "historicalDateClaimsBlocked: 0"
]) {
  assert.ok(presenceCompat.includes(marker), `4D presence compatibility must compose world/date capture telemetry: ${marker}`);
}

assert.ok(worldWrapper.includes("new WorldDateGuardAuthority(this)"));
assert.ok(worldWrapper.includes("worldDateGuardAuthority()"));
assert.ok(worldWrapper.includes("legacyWorldGateStats()"));
assert.ok(rosterWrapper.includes("new BotRosterReentryAuthority(this)"));
assert.ok(rosterWrapper.includes("botRosterReentryAuthority()"));

assert.ok(worker.includes("contractV41WorldRosterStateOwnership()"));
assert.ok(worker.includes('"v41-world-roster-state-ownership"'));
assert.ok(worker.includes('Object.hasOwn(this, "v39WorldGateStats")'));
assert.ok(worker.includes('Object.hasOwn(this, "v39RecentBotLeaves")'));
assert.ok(worker.includes("legacyV39SnapshotPreserved: true"));
assert.ok(runtime.includes('"v41-world-roster-state-ownership"'));

assert.ok(phase4a.includes("after 4D world/roster consolidation"));
assert.ok(phase4b.includes("after 4D world/roster consolidation"));
assert.ok(phase4c.includes("after 4D world/roster consolidation"));

console.log("v41 Phase 4D world/date and roster state ownership checks passed");
