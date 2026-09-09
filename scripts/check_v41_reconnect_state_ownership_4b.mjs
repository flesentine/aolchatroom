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

const reconnect = read("src/human_reconnect_lifecycle_v41.js");
const reconnectWrapper = read("src/index_v41_human_reconnect.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const presenceCompat = read("src/index_v41_presence_compat.js");
const worker = read("test/runtime_generation_contract_worker.js");
const runtime = read("scripts/check_v41_generation_contract_runtime.mjs");
const phase4a = read("scripts/check_v41_v39_shared_state_characterization_4a.mjs");

for (const [path, source] of v41Sources) {
  for (const retiredSurface of [
    "v39PendingHumanDisconnects",
    "v39HumanReplacementAt",
    "v39PresenceFixStats"
  ]) {
    assert.equal(
      source.includes(retiredSurface),
      false,
      `4B retired reconnect room state must be absent from live v41 production: ${path} references ${retiredSurface}`
    );
  }

  for (const retiredCounterWrite of [
    "v39Stats.humanDisconnectsDeferred",
    "v39Stats.transientHumanReconnects",
    "v39Stats.humanDisconnectsCommitted"
  ]) {
    assert.equal(
      source.includes(retiredCounterWrite),
      false,
      `4B reconnect counters must not be written through mixed v39Stats: ${path} references ${retiredCounterWrite}`
    );
  }
}

for (const marker of [
  "this.pendingHumanDisconnects = new Map()",
  "this.humanReplacementAt = new Map()",
  "this.presenceFixStats = {",
  "this.reconnectStats = {",
  "legacyV39Stats()",
  "legacyPresenceFixStats()",
  "legacyPendingHumanDisconnects(now = Date.now())",
  "stateOwnedByAuthority: true"
]) {
  assert.ok(reconnect.includes(marker), `4B reconnect authority must own marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(reconnect, "this.reconnectStats = {"),
  [
    "humanDisconnectsCommitted",
    "humanDisconnectsDeferred",
    "transientHumanReconnects"
  ],
  "4B reconnect telemetry schema must stay exact"
);

assert.deepEqual(
  objectKeys(reconnect, "this.presenceFixStats = {"),
  [
    "duplicateEnterAnnouncementsSuppressed",
    "humanSessionReplacements",
    "pendingCloseSocketsMarked",
    "supersededCloseCallbacksIgnored"
  ],
  "4B presence-fix telemetry schema must stay exact"
);

for (const marker of [
  "this.humanReplacementAt.set(target, now)",
  "this.pendingHumanDisconnects.set(name, pending)",
  "this.reconnectStats.humanDisconnectsDeferred += 1",
  "this.reconnectStats.transientHumanReconnects += 1",
  "this.reconnectStats.humanDisconnectsCommitted += 1",
  "this.presenceFixStats.humanSessionReplacements += rows.length",
  "this.presenceFixStats.duplicateEnterAnnouncementsSuppressed += 1",
  "this.presenceFixStats.pendingCloseSocketsMarked += 1",
  "this.presenceFixStats.supersededCloseCallbacksIgnored += 1"
]) {
  assert.ok(reconnect.includes(marker), `4B reconnect authority must retain behavior/telemetry marker: ${marker}`);
}

assert.deepEqual(
  objectKeys(coherenceCompat, "this.v39Stats = {"),
  [
    "backgroundPlansFiltered",
    "selfDialogueLinesBlocked"
  ],
  "4B mixed v39Stats must contain only compatibility-shell counters after 4D"
);

assert.deepEqual(
  objectKeys(coherenceCompat, "const EMPTY_V39_RECONNECT_STATS = Object.freeze({"),
  [
    "humanDisconnectsCommitted",
    "humanDisconnectsDeferred",
    "transientHumanReconnects"
  ],
  "4B legacy reconnect snapshot fallback schema must stay exact"
);

for (const marker of [
  "this.humanReconnectLifecycleAuthority?.() || null",
  "legacyV39Stats",
  "legacyPendingHumanDisconnects",
  "stats: { ...this.v39Stats, ...repairStats, ...worldDateStats, ...rosterStats, ...reconnectStats }",
  "pendingHumanDisconnects"
]) {
  assert.ok(coherenceCompat.includes(marker), `4B coherence compatibility must compose legacy reconnect diagnostics: ${marker}`);
}

for (const marker of [
  "this.humanReconnectLifecycleAuthority?.()?.legacyPresenceFixStats?.()",
  "presenceFixStats:",
  "captureFixStats:",
  "legacyCaptureFixStats"
]) {
  assert.ok(presenceCompat.includes(marker), `4B presence compatibility must compose legacy reconnect diagnostics: ${marker}`);
}

assert.ok(reconnectWrapper.includes("new HumanReconnectLifecycleAuthority(this)"));
assert.ok(reconnectWrapper.includes("humanReconnectLifecycleAuthority()"));

assert.ok(worker.includes("contractV41ReconnectStateOwnership()"));
assert.ok(worker.includes('"v41-reconnect-state-ownership"'));
assert.ok(worker.includes('Object.hasOwn(this, "v39PendingHumanDisconnects")'));
assert.ok(worker.includes('Object.hasOwn(this, "v39HumanReplacementAt")'));
assert.ok(worker.includes('Object.hasOwn(this, "v39PresenceFixStats")'));
assert.ok(worker.includes("legacyV39SnapshotPreserved: true"));
assert.ok(runtime.includes('"v41-reconnect-state-ownership"'));

assert.ok(phase4a.includes("after 4D world/roster consolidation"));
assert.equal(phase4a.includes('"src/human_reconnect_lifecycle_v41.js",\n    "src/index_v41_coherence_compat.js"'), false);

console.log("v41 Phase 4B reconnect state ownership checks passed after 4D world/roster consolidation");
