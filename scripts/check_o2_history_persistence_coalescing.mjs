import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CoalescingHistoryWriter,
  V41_HISTORY_LIMIT
} from "../src/history_persistence_v41.js";

const entry = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
const base = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

assert.equal(V41_HISTORY_LIMIT, 220, "O2 must preserve the existing history cap");
assert.ok(base.includes('const MAX_HISTORY = 220;'), "base history cap must remain unchanged");
assert.ok(base.includes('this.ctx.storage.put("history", this.history)'), "frozen base storage schema must remain visible");
assert.ok(entry.includes("new CoalescingHistoryWriter({"), "v41 production must install the O2 writer");
assert.ok(entry.includes('write: (rows) => this.ctx.storage.put("history", rows)'), "O2 must preserve the history storage key and array value");
assert.ok(entry.includes("persistHistory()"), "v41 production must override dynamic history persistence");
assert.ok(entry.includes("historyPersistenceSingleFlight: true"), "O2 status must expose single-flight ownership");

let current = Array.from({ length: 220 }, (_, id) => ({ id }));
const writes = [];
let releaseFirst = null;

const writer = new CoalescingHistoryWriter({
  read: () => current,
  assign: (rows) => { current = rows; },
  write: async (rows) => {
    writes.push(rows.map((row) => ({ ...row })));
    if (writes.length === 1) {
      await new Promise((resolve) => { releaseFirst = resolve; });
    }
  }
});

const first = writer.request();
await Promise.resolve();
await Promise.resolve();
assert.equal(writes.length, 1, "first O2 write should start once");

current.push({ id: 220 });
const second = writer.request();
current.push({ id: 221 });
const third = writer.request();
current.push({ id: 222 });
const fourth = writer.request();

assert.equal(second, first, "coalesced request must share the active write promise");
assert.equal(third, first, "all overlapping requests must share the active write promise");
assert.equal(fourth, first, "burst requests must not start parallel cycles");

releaseFirst();
await first;

assert.equal(writes.length, 2, "one active burst should require only one latest-state follow-up write");
assert.equal(writes[1].length, 220, "follow-up snapshot must remain capped at 220 rows");
assert.equal(writes[1][0].id, 3, "follow-up must trim the oldest rows");
assert.equal(writes[1][219].id, 222, "follow-up must persist the latest row");

const stats = writer.snapshot();
assert.equal(stats.requests, 4);
assert.equal(stats.coalescedRequests, 3);
assert.equal(stats.writesStarted, 2);
assert.equal(stats.writesCompleted, 2);
assert.equal(stats.maxConcurrent, 1, "O2 must hard-bound storage-write concurrency to one");
assert.equal(stats.active, false);
assert.equal(stats.dirty, false);

console.log("O2 history persistence coalescing checks passed");
