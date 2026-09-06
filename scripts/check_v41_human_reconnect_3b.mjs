import assert from "node:assert/strict";
import {
  HumanReconnectLifecycleAuthority,
  V41_HUMAN_RECONNECT_GRACE_MS,
  V41_HUMAN_REPLACEMENT_WINDOW_MS
} from "../src/human_reconnect_lifecycle_v41.js";
import { logicalHumanNames } from "../src/presence_guard_v39.js";
import fs from "node:fs";

function socket(name, extra = {}) {
  let attachment = { name, joinedAt: Date.now(), ...extra };
  return {
    closed: null,
    deserializeAttachment() { return { ...attachment }; },
    serializeAttachment(next) { attachment = { ...next }; },
    close(code, reason) { this.closed = { code, reason }; }
  };
}

function fakeRoom() {
  const sockets = [];
  const tasks = [];
  const broadcasts = [];
  const room = {
    sockets,
    tasks,
    broadcasts,
    v39HumanReplacementAt: new Map(),
    v39PendingHumanDisconnects: new Map(),
    v39PresenceFixStats: {
      humanSessionReplacements: 0,
      duplicateEnterAnnouncementsSuppressed: 0,
      pendingCloseSocketsMarked: 0,
      supersededCloseCallbacksIgnored: 0
    },
    v39Stats: {
      humanDisconnectsDeferred: 0,
      transientHumanReconnects: 0,
      humanDisconnectsCommitted: 0
    },
    ctx: {
      getWebSockets: () => sockets,
      waitUntil(task) { tasks.push(task); }
    },
    humanSocketRows() {
      return sockets.map((ws) => ({ ws, attachment: ws.deserializeAttachment() }));
    },
    humanNames() {
      return logicalHumanNames(sockets.map((ws) => ws.deserializeAttachment()));
    },
    broadcast(payload) { broadcasts.push(payload); }
  };
  return room;
}

assert.equal(V41_HUMAN_RECONNECT_GRACE_MS, 5000);
assert.equal(V41_HUMAN_REPLACEMENT_WINDOW_MS, 5000);

// Quick reconnect: pending close disappears, duplicate enter is suppressed, and
// the low-level close never commits.
{
  const room = fakeRoom();
  const authority = new HumanReconnectLifecycleAuthority(room, { graceMs: 5, sleepFn: () => Promise.resolve() });
  const oldSocket = socket("Crateman");
  room.sockets.push(oldSocket);
  let commits = 0;
  authority.webSocketClose(oldSocket, 1006, "network changed", false, () => { commits += 1; });
  assert.equal(oldSocket.deserializeAttachment().v39DisconnectPending, true);
  assert.deepEqual(room.humanNames(), []);
  assert.equal(room.v39PendingHumanDisconnects.has("Crateman"), true);

  const replacement = socket("Crateman");
  room.sockets.push(replacement);
  let delegated = 0;
  const result = authority.system("Crateman has entered the room.", () => { delegated += 1; });
  assert.equal(result, false);
  assert.equal(delegated, 0);
  assert.equal(room.v39PendingHumanDisconnects.has("Crateman"), false);
  assert.equal(room.v39Stats.transientHumanReconnects, 1);
  await Promise.all(room.tasks);
  assert.equal(commits, 0);
}

// Same-name active replacement: superseded close callback is ignored and the
// second enter line is suppressed through the same authority.
{
  const room = fakeRoom();
  const authority = new HumanReconnectLifecycleAuthority(room, { graceMs: 5 });
  const oldSocket = socket("Crateman");
  room.sockets.push(oldSocket);
  assert.equal(authority.replaceExistingHumanSessions("Crateman"), 1);
  assert.equal(oldSocket.deserializeAttachment().v39Superseded, true);
  assert.equal(oldSocket.closed?.code, 4001);
  let commits = 0;
  authority.webSocketClose(oldSocket, 4001, "replaced by newer session", true, () => { commits += 1; });
  assert.equal(commits, 0);
  assert.equal(room.v39PresenceFixStats.supersededCloseCallbacksIgnored, 1);
  assert.equal(room.v39PendingHumanDisconnects.size, 0);
  assert.equal(authority.system("Crateman has entered the room.", () => true), false);
  assert.equal(room.v39PresenceFixStats.duplicateEnterAnnouncementsSuppressed, 1);
}

// No reconnect: after grace the close delegates exactly once.
{
  const room = fakeRoom();
  let release;
  const authority = new HumanReconnectLifecycleAuthority(room, {
    graceMs: 5,
    sleepFn: () => new Promise((resolve) => { release = resolve; })
  });
  const oldSocket = socket("Crateman");
  room.sockets.push(oldSocket);
  let commits = 0;
  authority.webSocketClose(oldSocket, 1006, "gone", false, () => { commits += 1; });
  assert.equal(room.v39Stats.humanDisconnectsDeferred, 1);
  release();
  await Promise.all(room.tasks);
  assert.equal(commits, 1);
  assert.equal(room.v39Stats.humanDisconnectsCommitted, 1);
  assert.equal(room.v39PendingHumanDisconnects.size, 0);
}

// A replacement connection that becomes logically active before the grace
// settles suppresses the old close even if its enter line was not observed.
{
  const room = fakeRoom();
  let release;
  const authority = new HumanReconnectLifecycleAuthority(room, {
    graceMs: 5,
    sleepFn: () => new Promise((resolve) => { release = resolve; })
  });
  const oldSocket = socket("Crateman");
  room.sockets.push(oldSocket);
  let commits = 0;
  authority.webSocketClose(oldSocket, 1006, "wifi", false, () => { commits += 1; });
  room.sockets.push(socket("Crateman"));
  release();
  await Promise.all(room.tasks);
  assert.equal(commits, 0);
  assert.equal(room.v39Stats.transientHumanReconnects, 1);
}

const reconnectWrapper = fs.readFileSync(new URL("../src/index_v41_human_reconnect.js", import.meta.url), "utf8");
const coherenceWrapper = fs.readFileSync(new URL("../src/index_v41_coherence_repair.js", import.meta.url), "utf8");
const rosterWrapper = fs.readFileSync(new URL("../src/index_v41_bot_roster_reentry.js", import.meta.url), "utf8");
const worldDateWrapper = fs.readFileSync(new URL("../src/index_v41_world_date_guard.js", import.meta.url), "utf8");
const generationBase = fs.readFileSync(new URL("../src/index_v41_generation_contract_base.js", import.meta.url), "utf8");
const legacyCoherence = fs.readFileSync(new URL("../src/index_v39_coherence.js", import.meta.url), "utf8");
const legacyPresence = fs.readFileSync(new URL("../src/index_v39_presence_fix.js", import.meta.url), "utf8");
const v39World = fs.readFileSync(new URL("../src/index_v39_world_gate.js", import.meta.url), "utf8");
const v40 = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
const v41Scene = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");

function ownsMethod(source, name) {
  return new RegExp(`^  (?:async )?${name}\\(`, "m").test(source);
}

assert.ok(reconnectWrapper.includes('from "./index_v41_scene_coordinator.js"'));
assert.ok(reconnectWrapper.includes('from "./index_v38_quality_guard.js"'));
assert.ok(reconnectWrapper.includes("V38ChatRoom.prototype.system.call"));
assert.ok(reconnectWrapper.includes("V38ChatRoom.prototype.webSocketClose.call"));
assert.ok(generationBase.includes('from "./index_v41_bot_roster_reentry.js"'));
assert.ok(rosterWrapper.includes('from "./index_v41_world_date_guard.js"'));
assert.ok(worldDateWrapper.includes('from "./index_v41_coherence_repair.js"'));
assert.ok(coherenceWrapper.includes('from "./index_v41_human_reconnect.js"'));
assert.ok(legacyCoherence.includes("V39_HUMAN_RECONNECT_GRACE_MS = 5000"));
assert.ok(legacyPresence.includes("markHumanDisconnectPending"));
assert.ok(legacyPresence.includes("replaceExistingHumanSessions(name, now = Date.now())"));
for (const [name, source] of [["v39 world", v39World], ["v40 continuity", v40], ["v41 scene", v41Scene]]) {
  assert.equal(ownsMethod(source, "system"), false, `${name} must not own system() while 3B delegates below the legacy reconnect wrappers`);
  assert.equal(ownsMethod(source, "webSocketClose"), false, `${name} must not own webSocketClose() while 3B delegates below the legacy reconnect wrappers`);
}

console.log("v41 Phase 3B human reconnect lifecycle authority checks passed");
