import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function v41SourcePaths() {
  const dir = new URL("../src/", import.meta.url);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".js") && name.includes("v41"))
    .map((name) => `src/${name}`)
    .sort();
}

function filesReferencing(paths, surface) {
  return paths
    .filter((path) => read(path).includes(surface))
    .sort();
}

function filesContaining(paths, marker) {
  return paths
    .filter((path) => read(path).includes(marker))
    .sort();
}


function filesAssigningSurface(paths, surface) {
  const assignment = new RegExp(
    `(?:this|this\\.room)\\.${surface}\\s*(?:=|\\?\\?=|\\|\\|=|&&=)`
  );
  return paths.filter((path) => assignment.test(read(path))).sort();
}


function surfaceAssignmentCount(source, surface) {
  const assignment = new RegExp(
    `(?:this|this\\.room)\\.${surface}\\s*(?:=|\\?\\?=|\\|\\|=|&&=)`,
    "g"
  );
  return [...source.matchAll(assignment)].length;
}

function filesWritingCounter(paths, surface, counter) {
  const write = new RegExp(
    `(?:this|this\\.room)\\.${surface}\\??\\.${counter}\\s*(?:\\+\\+|--|\\+=|-=|\\*=|/=|=)`
  );
  return paths.filter((path) => write.test(read(path))).sort();
}

function objectKeys(source, assignmentMarker) {
  const start = source.indexOf(assignmentMarker);
  assert.ok(start >= 0, `missing object assignment: ${assignmentMarker}`);
  const open = source.indexOf("{", start);
  assert.ok(open >= 0, `missing object body: ${assignmentMarker}`);
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
  assert.ok(end > open, `unterminated object assignment: ${assignmentMarker}`);
  return source.slice(open + 1, end)
    .split("\n")
    .map((line) => /^\s*([A-Za-z0-9_]+)\s*:/.exec(line)?.[1] || "")
    .filter(Boolean)
    .sort();
}

const sources = v41SourcePaths();
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const presenceCompat = read("src/index_v41_presence_compat.js");
const reconnect = read("src/human_reconnect_lifecycle_v41.js");
const repair = read("src/coherence_repair_v41.js");
const worldDate = read("src/world_date_guard_v41.js");
const roster = read("src/bot_roster_reentry_v41.js");

const surfaces = {
  v39Stats: [
    "src/index_v41_coherence_compat.js"
  ],
  v39RecentBotLeaves: [],
  v39PendingHumanDisconnects: [],
  v39LastTargetRepair: [],
  v39LastCoherenceLock: [],
  v39PresenceFixStats: [],
  v39CaptureFixStats: [
    "src/index_v41_presence_compat.js"
  ],
  v39HumanReplacementAt: []
};

for (const [surface, expected] of Object.entries(surfaces)) {
  assert.deepEqual(
    filesReferencing(sources, surface),
    [...expected].sort(),
    `4A v39 shared-state consumer set drifted for ${surface}`
  );
}

const initializers = {
  "this.v39Stats = {": ["src/index_v41_coherence_compat.js"],
  "this.v39CaptureFixStats = {": ["src/index_v41_presence_compat.js"]
};

for (const [marker, expected] of Object.entries(initializers)) {
  assert.deepEqual(
    filesContaining(sources, marker),
    expected,
    `4A v39 shared-state compatibility initializer marker drifted for ${marker}`
  );
}

const wholeSurfaceAssignments = {
  v39Stats: {
    "src/index_v41_coherence_compat.js": 1
  },
  v39CaptureFixStats: {
    "src/index_v41_presence_compat.js": 1
  }
};

for (const [surface, expectedCounts] of Object.entries(wholeSurfaceAssignments)) {
  assert.deepEqual(
    filesAssigningSurface(sources, surface),
    Object.keys(expectedCounts).sort(),
    `4A v39 whole-surface assignment ownership drifted for ${surface}`
  );
  for (const path of Object.keys(expectedCounts)) {
    assert.equal(
      surfaceAssignmentCount(read(path), surface),
      expectedCounts[path],
      `4A v39 whole-surface assignment count drifted for ${surface} in ${path}`
    );
  }
}

assert.deepEqual(
  objectKeys(coherenceCompat, "this.v39Stats = {"),
  [
    "backgroundPlansFiltered",
    "selfDialogueLinesBlocked"
  ],
  "4A v39Stats schema must remain exact"
);

assert.deepEqual(
  objectKeys(presenceCompat, "this.v39CaptureFixStats = {"),
  [
    "legacyQuickBackgroundCallsSuppressed"
  ],
  "4A v39CaptureFixStats schema must remain exact"
);

for (const marker of [
  "this.v39Stats.selfDialogueLinesBlocked += filtered.blocked.length",
  "this.v39Stats.backgroundPlansFiltered += 1",
  "stats: { ...this.v39Stats, ...repairStats, ...worldDateStats, ...rosterStats, ...reconnectStats }",
  "legacyRecentlyDeparted",
  "legacyPendingHumanDisconnects",
  "legacyLastTargetRepair",
  "legacyLastCoherenceLock"
]) {
  assert.ok(coherenceCompat.includes(marker), `4A coherence compatibility surface must retain marker: ${marker}`);
}

for (const marker of [
  "this.v39CaptureFixStats.legacyQuickBackgroundCallsSuppressed += 1",
  "legacyPresenceFixStats",
  "legacyCaptureFixStats",
  "legacyWorldGateStats"
]) {
  assert.ok(presenceCompat.includes(marker), `4A presence compatibility surface must retain marker: ${marker}`);
}

for (const marker of [
  "this.pendingHumanDisconnects = new Map()",
  "this.humanReplacementAt = new Map()",
  "this.presenceFixStats = {",
  "this.reconnectStats = {",
  "this.humanReplacementAt.set(target, now)",
  "this.presenceFixStats.humanSessionReplacements += rows.length",
  "this.pendingHumanDisconnects.delete(name)",
  "this.reconnectStats.transientHumanReconnects += 1",
  "this.presenceFixStats.duplicateEnterAnnouncementsSuppressed += 1",
  "this.presenceFixStats.supersededCloseCallbacksIgnored += 1",
  "this.presenceFixStats.pendingCloseSocketsMarked += 1",
  "this.pendingHumanDisconnects.set(name, pending)",
  "this.reconnectStats.humanDisconnectsDeferred += 1",
  "this.reconnectStats.humanDisconnectsCommitted += 1"
]) {
  assert.ok(reconnect.includes(marker), `4A reconnect authority must retain 4B-owned state marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(reconnect, "this.reconnectStats = {"),
  [
    "humanDisconnectsCommitted",
    "humanDisconnectsDeferred",
    "transientHumanReconnects"
  ],
  "4A reconnect authority stats schema must remain exact after 4B"
);

assert.deepEqual(
  objectKeys(reconnect, "this.presenceFixStats = {"),
  [
    "duplicateEnterAnnouncementsSuppressed",
    "humanSessionReplacements",
    "pendingCloseSocketsMarked",
    "supersededCloseCallbacksIgnored"
  ],
  "4A reconnect authority presence-fix schema must remain exact after 4B"
);

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
  "legacyLastCoherenceLock()"
]) {
  assert.ok(repair.includes(marker), `4A coherence-repair authority must retain 4C-owned state marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(repair, "this.repairStats = {"),
  [
    "clarificationTargetRepairs",
    "coherenceVoiceLocks"
  ],
  "4A coherence repair stats schema must remain exact after 4C"
);

assert.deepEqual(
  objectKeys(repair, "this.captureFixStats = {"),
  [
    "explicitErrorChallengesRepaired"
  ],
  "4A coherence repair capture schema must remain exact after 4C"
);

for (const marker of [
  "this.worldGateStats = {",
  "this.captureFixStats = {",
  "this.coherenceStats = {",
  "this.worldGateStats.futureGameProductLinesBlocked += 1",
  "this.worldGateStats.auditedPublicClaimsBlocked += 1",
  "this.captureFixStats.historicalDateClaimsBlocked += 1",
  "this.coherenceStats.futureEventLinesBlocked += 1",
  "this.worldGateStats.consoleLabelsNormalized += 1",
  "legacyWorldGateStats()",
  "legacyCaptureFixStats()",
  "legacyV39Stats()"
]) {
  assert.ok(worldDate.includes(marker), `4A world/date authority must retain 4D-owned state marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(worldDate, "this.worldGateStats = {"),
  [
    "auditedPublicClaimsBlocked",
    "consoleLabelsNormalized",
    "futureGameProductLinesBlocked"
  ],
  "4A world/date world-gate schema must remain exact after 4D"
);

assert.deepEqual(
  objectKeys(worldDate, "this.captureFixStats = {"),
  ["historicalDateClaimsBlocked"],
  "4A world/date capture schema must remain exact after 4D"
);

assert.deepEqual(
  objectKeys(worldDate, "this.coherenceStats = {"),
  ["futureEventLinesBlocked"],
  "4A world/date coherence schema must remain exact after 4D"
);

for (const marker of [
  "this.recentBotLeaves = new Map()",
  "this.rosterStats = {",
  "this.recentBotLeaves.get(name)",
  "this.recentBotLeaves.set(name, now)",
  "this.rosterStats.botReentryBlocks += 1",
  "legacyV39Stats()",
  "legacyRecentlyDeparted(now = Date.now())"
]) {
  assert.ok(roster.includes(marker), `4A roster authority must retain 4D-owned state marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(roster, "this.rosterStats = {"),
  ["botReentryBlocks"],
  "4A roster stats schema must remain exact after 4D"
);

const counterWriters = {
  v39Stats: {
    selfDialogueLinesBlocked: ["src/index_v41_coherence_compat.js"],
    backgroundPlansFiltered: ["src/index_v41_coherence_compat.js"]
  },
  v39CaptureFixStats: {
    legacyQuickBackgroundCallsSuppressed: ["src/index_v41_presence_compat.js"]
  }
};

for (const [surface, counters] of Object.entries(counterWriters)) {
  for (const [counter, expected] of Object.entries(counters)) {
    assert.deepEqual(
      filesWritingCounter(sources, surface, counter),
      expected,
      `4A shared-counter writer ownership drifted for ${surface}.${counter}`
    );
  }
}

for (const source of [reconnect, repair, worldDate, roster]) {
  for (const marker of Object.keys(initializers)) {
    assert.equal(
      source.includes(marker),
      false,
      `4A named authority must consume, not initialize, compatibility-owned v39 state: ${marker}`
    );
  }
}

console.log("v41 Phase 4A v39 shared-state ownership characterization checks passed after 4D world/roster consolidation");
