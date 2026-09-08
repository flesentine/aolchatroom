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
    "src/bot_roster_reentry_v41.js",
    "src/coherence_repair_v41.js",
    "src/human_reconnect_lifecycle_v41.js",
    "src/index_v41_coherence_compat.js",
    "src/world_date_guard_v41.js"
  ],
  v39RecentBotLeaves: [
    "src/bot_roster_reentry_v41.js",
    "src/index_v41_coherence_compat.js"
  ],
  v39PendingHumanDisconnects: [
    "src/human_reconnect_lifecycle_v41.js",
    "src/index_v41_coherence_compat.js"
  ],
  v39LastTargetRepair: [
    "src/coherence_repair_v41.js",
    "src/index_v41_coherence_compat.js"
  ],
  v39LastCoherenceLock: [
    "src/coherence_repair_v41.js",
    "src/index_v41_coherence_compat.js"
  ],
  v39PresenceFixStats: [
    "src/human_reconnect_lifecycle_v41.js",
    "src/index_v41_presence_compat.js"
  ],
  v39CaptureFixStats: [
    "src/coherence_repair_v41.js",
    "src/index_v41_presence_compat.js",
    "src/world_date_guard_v41.js"
  ],
  v39HumanReplacementAt: [
    "src/human_reconnect_lifecycle_v41.js",
    "src/index_v41_presence_compat.js"
  ]
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
  "this.v39RecentBotLeaves = new Map();": ["src/index_v41_coherence_compat.js"],
  "this.v39PendingHumanDisconnects = new Map();": ["src/index_v41_coherence_compat.js"],
  "this.v39LastTargetRepair = null;": ["src/index_v41_coherence_compat.js"],
  "this.v39LastCoherenceLock = null;": ["src/index_v41_coherence_compat.js"],
  "this.v39PresenceFixStats = {": ["src/index_v41_presence_compat.js"],
  "this.v39CaptureFixStats = {": ["src/index_v41_presence_compat.js"],
  "this.v39HumanReplacementAt = new Map();": ["src/index_v41_presence_compat.js"]
};

for (const [marker, expected] of Object.entries(initializers)) {
  assert.deepEqual(
    filesContaining(sources, marker),
    expected,
    `4A v39 shared-state compatibility initializer marker drifted for ${marker}`
  );
}

const initializerOwners = {
  v39Stats: ["src/index_v41_coherence_compat.js"],
  v39RecentBotLeaves: ["src/index_v41_coherence_compat.js"],
  v39PendingHumanDisconnects: ["src/index_v41_coherence_compat.js"],
  v39LastTargetRepair: ["src/index_v41_coherence_compat.js"],
  v39LastCoherenceLock: ["src/index_v41_coherence_compat.js"],
  v39PresenceFixStats: ["src/index_v41_presence_compat.js"],
  v39CaptureFixStats: ["src/index_v41_presence_compat.js"],
  v39HumanReplacementAt: ["src/index_v41_presence_compat.js"]
};

for (const [surface, expected] of Object.entries(initializerOwners)) {
  assert.deepEqual(
    filesAssigningSurface(sources, surface),
    expected,
    `4A v39 shared-state assignment ownership drifted for ${surface}`
  );
}

assert.deepEqual(
  objectKeys(coherenceCompat, "this.v39Stats = {"),
  [
    "backgroundPlansFiltered",
    "botReentryBlocks",
    "clarificationTargetRepairs",
    "coherenceVoiceLocks",
    "futureEventLinesBlocked",
    "humanDisconnectsCommitted",
    "humanDisconnectsDeferred",
    "selfDialogueLinesBlocked",
    "transientHumanReconnects"
  ],
  "4A v39Stats schema must remain exact"
);

assert.deepEqual(
  objectKeys(presenceCompat, "this.v39PresenceFixStats = {"),
  [
    "duplicateEnterAnnouncementsSuppressed",
    "humanSessionReplacements",
    "pendingCloseSocketsMarked",
    "supersededCloseCallbacksIgnored"
  ],
  "4A v39PresenceFixStats schema must remain exact"
);

assert.deepEqual(
  objectKeys(presenceCompat, "this.v39CaptureFixStats = {"),
  [
    "explicitErrorChallengesRepaired",
    "historicalDateClaimsBlocked",
    "legacyQuickBackgroundCallsSuppressed"
  ],
  "4A v39CaptureFixStats schema must remain exact"
);

for (const marker of [
  "this.v39Stats.selfDialogueLinesBlocked += filtered.blocked.length",
  "this.v39Stats.backgroundPlansFiltered += 1",
  "stats: { ...this.v39Stats }",
  "...this.v39RecentBotLeaves.keys()",
  "...this.v39PendingHumanDisconnects.entries()",
  "lastTargetRepair: this.v39LastTargetRepair",
  "lastCoherenceLock: this.v39LastCoherenceLock"
]) {
  assert.ok(coherenceCompat.includes(marker), `4A coherence compatibility surface must retain marker: ${marker}`);
}

for (const marker of [
  "this.v39CaptureFixStats.legacyQuickBackgroundCallsSuppressed += 1",
  "presenceFixStats: { ...this.v39PresenceFixStats }",
  "captureFixStats: { ...this.v39CaptureFixStats }"
]) {
  assert.ok(presenceCompat.includes(marker), `4A presence compatibility surface must retain marker: ${marker}`);
}

for (const marker of [
  "this.room.v39HumanReplacementAt?.set?.(target, now)",
  "this.room.v39PresenceFixStats.humanSessionReplacements += rows.length",
  "this.room.v39PendingHumanDisconnects?.delete?.(name)",
  "this.room.v39Stats.transientHumanReconnects += 1",
  "this.room.v39PresenceFixStats.duplicateEnterAnnouncementsSuppressed += 1",
  "this.room.v39PresenceFixStats.supersededCloseCallbacksIgnored += 1",
  "this.room.v39PresenceFixStats.pendingCloseSocketsMarked += 1",
  "this.room.v39PendingHumanDisconnects?.set?.(name, pending)",
  "this.room.v39Stats.humanDisconnectsDeferred += 1",
  "this.room.v39Stats.humanDisconnectsCommitted += 1"
]) {
  assert.ok(reconnect.includes(marker), `4A reconnect authority must retain shared-state marker: ${marker}`);
}

for (const marker of [
  "this.room.v39Stats.clarificationTargetRepairs += 1",
  "this.room.v39LastTargetRepair = {",
  "this.room.v39Stats.coherenceVoiceLocks += 1",
  "this.room.v39LastCoherenceLock = {",
  "this.room.v39CaptureFixStats.explicitErrorChallengesRepaired += 1"
]) {
  assert.ok(repair.includes(marker), `4A coherence-repair authority must retain shared-state marker: ${marker}`);
}

for (const marker of [
  "this.room.v39CaptureFixStats.historicalDateClaimsBlocked += 1",
  "this.room.v39Stats.futureEventLinesBlocked += 1"
]) {
  assert.ok(worldDate.includes(marker), `4A world/date authority must retain shared-state marker: ${marker}`);
}

for (const marker of [
  "this.room.v39RecentBotLeaves?.get?.(name)",
  "this.room.v39RecentBotLeaves?.set?.(name, now)",
  "this.room.v39Stats.botReentryBlocks += 1"
]) {
  assert.ok(roster.includes(marker), `4A roster authority must retain shared-state marker: ${marker}`);
}

const counterWriters = {
  v39Stats: {
    clarificationTargetRepairs: ["src/coherence_repair_v41.js"],
    coherenceVoiceLocks: ["src/coherence_repair_v41.js"],
    futureEventLinesBlocked: ["src/world_date_guard_v41.js"],
    selfDialogueLinesBlocked: ["src/index_v41_coherence_compat.js"],
    backgroundPlansFiltered: ["src/index_v41_coherence_compat.js"],
    botReentryBlocks: ["src/bot_roster_reentry_v41.js"],
    humanDisconnectsDeferred: ["src/human_reconnect_lifecycle_v41.js"],
    transientHumanReconnects: ["src/human_reconnect_lifecycle_v41.js"],
    humanDisconnectsCommitted: ["src/human_reconnect_lifecycle_v41.js"]
  },
  v39PresenceFixStats: {
    humanSessionReplacements: ["src/human_reconnect_lifecycle_v41.js"],
    duplicateEnterAnnouncementsSuppressed: ["src/human_reconnect_lifecycle_v41.js"],
    pendingCloseSocketsMarked: ["src/human_reconnect_lifecycle_v41.js"],
    supersededCloseCallbacksIgnored: ["src/human_reconnect_lifecycle_v41.js"]
  },
  v39CaptureFixStats: {
    legacyQuickBackgroundCallsSuppressed: ["src/index_v41_presence_compat.js"],
    explicitErrorChallengesRepaired: ["src/coherence_repair_v41.js"],
    historicalDateClaimsBlocked: ["src/world_date_guard_v41.js"]
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

console.log("v41 Phase 4A v39 shared-state ownership characterization checks passed");
