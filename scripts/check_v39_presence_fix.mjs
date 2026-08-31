import assert from "node:assert/strict";
import fs from "node:fs";
import {
  activeHumanConnectionCount,
  attachmentIsLogicallyActive,
  logicalHumanNames,
  markHumanDisconnectPending,
  markHumanSuperseded
} from "../src/presence_guard_v39.js";

const attachments = [
  { name: "Crateman", joinedAt: 1000 },
  { name: "Crateman", joinedAt: 2000 },
  { name: "MoonGuest", joinedAt: 1500 },
  markHumanDisconnectPending({ name: "Crateman", joinedAt: 500 }, "old-close", 3000),
  markHumanSuperseded({ name: "Ghost", joinedAt: 900 }, 3000)
];

assert.deepEqual(
  logicalHumanNames(attachments),
  ["Crateman", "MoonGuest"],
  "duplicate same-name sockets must collapse to one logical human and pending/superseded sockets must be invisible"
);
assert.equal(activeHumanConnectionCount(attachments, "Crateman"), 2, "two still-active Crateman sockets are detectable even though logical presence is one");
assert.equal(attachmentIsLogicallyActive(attachments[3]), false);
assert.equal(attachmentIsLogicallyActive(attachments[4]), false);

const closingOnly = [markHumanDisconnectPending({ name: "Crateman" }, "close", 4000)];
assert.deepEqual(logicalHumanNames(closingOnly), [], "the socket whose close callback is being deferred must not count itself as a successful reconnect");

const reconnect = [
  markHumanDisconnectPending({ name: "Crateman", joinedAt: 1000 }, "close", 4000),
  { name: "Crateman", joinedAt: 4500 }
];
assert.deepEqual(logicalHumanNames(reconnect), ["Crateman"], "a replacement socket restores exactly one logical Crateman presence");
assert.equal(activeHumanConnectionCount(reconnect, "Crateman"), 1);

const runtime = fs.readFileSync(new URL("../src/index_v39_presence_fix.js", import.meta.url), "utf8");
assert.ok(runtime.includes('from "./index_v39_coherence.js"'), "presence patch must stay additive above v39 coherence");
assert.ok(runtime.includes("logicalHumanNames(this.humanSocketRows()"), "runtime humanNames must use logical identity dedupe");
assert.ok(runtime.includes("markHumanDisconnectPending"), "closing sockets must be excluded during reconnect grace");
assert.ok(runtime.includes("markHumanSuperseded"), "new same-name sessions must supersede stale sockets");
assert.ok(runtime.includes('row.ws.close(4001, "replaced by newer session")'), "newest same-name connection must replace stale active sessions");
assert.ok(runtime.includes("attachment?.v39Superseded"), "superseded close callbacks must not emit a logical departure");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wrangler.includes('"main": "src/index_v39_presence_fix.js"'));
assert.ok(wrangler.includes('"DEPLOY_VERSION": "39"'));

console.log("v39 human-presence dedupe regression checks passed");
