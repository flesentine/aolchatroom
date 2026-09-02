import assert from "node:assert/strict";
import fs from "node:fs";
import {
  activeHumanConnectionCount,
  attachmentIsLogicallyActive,
  logicalHumanNames,
  markHumanDisconnectPending,
  markHumanSuperseded
} from "../src/presence_guard_v39.js";
import {
  applyErrorChallengePlan,
  historicalDateMismatch,
  isExplicitErrorChallenge
} from "../src/v39_capture_fixes.js";

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

assert.equal(isExplicitErrorChallenge("hmm how can you make such a big mistake"), true);
assert.equal(isExplicitErrorChallenge("how did you get that so wrong"), true);
assert.equal(isExplicitErrorChallenge("what movies do you like"), false);
const repaired = applyErrorChallengePlan({
  goal: "Respond to Crateman.",
  moves: [{ speaker: "VideoStoreGuy", target: "Crateman", intent: "respond", meaning: "Correct the date." }]
}, { from: "Crateman", text: "hmm how can you make such a big mistake" });
assert.match(repaired.goal, /V39 ERROR-REPAIR LOCK/);
assert.match(repaired.moves[0].meaning, /Admit or explain the mistake FIRST/i);
assert.match(repaired.moves[0].meaning, /Do not answer the challenge by merely supplying another date/i);

const NOW = Date.parse("2026-08-31T13:30:00-07:00");
const badRelease = historicalDateMismatch("independence day got released last friday <g>", NOW);
assert.equal(badRelease?.kind, "historical-date-mismatch");
assert.equal(badRelease?.actualDate, "1996-07-03");
assert.equal(historicalDateMismatch("independence day opened july 3", NOW), null);
assert.equal(historicalDateMismatch("i watched independence day last friday", NOW), null);

const runtime = fs.readFileSync(new URL("../src/index_v39_presence_fix.js", import.meta.url), "utf8");
assert.ok(runtime.includes('from "./index_v39_coherence.js"'), "presence patch must stay additive above v39 coherence");
assert.ok(runtime.includes("logicalHumanNames(this.humanSocketRows()"), "runtime humanNames must use logical identity dedupe");
assert.ok(runtime.includes("markHumanDisconnectPending"), "closing sockets must be excluded during reconnect grace");
assert.ok(runtime.includes("markHumanSuperseded"), "new same-name sessions must supersede stale sockets");
assert.ok(runtime.includes('row.ws.close(4001, "replaced by newer session")'), "newest same-name connection must replace stale active sessions");
assert.ok(runtime.includes("attachment?.v39Superseded"), "superseded close callbacks must not emit a logical departure");
assert.ok(runtime.includes("async generateGroqBatch()"), "legacy v11 qbg generation must be explicitly intercepted at the production top layer");
assert.equal(runtime.includes("return super.generateGroqBatch"), false, "legacy qbg path must never fall through to Mistral/Groq generation");
assert.ok(runtime.includes("historicalDateMismatch(text, now)"), "generated lines must validate relative public event dates");
assert.ok(runtime.includes("applyErrorChallengePlan(plan, human)"), "explicit mistake challenges must get the error-repair lock before voice generation");

const legacyQuickBackground = fs.readFileSync(new URL("../src/index_v11.js", import.meta.url), "utf8");
assert.ok(legacyQuickBackground.includes('const sceneId = `qbg${this.sceneSeq}`'), "regression must remain tied to the actual legacy qbg generator found in the production capture");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const directPresence = wrangler.includes('"main": "src/index_v39_presence_fix.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"');
const worldWrapper = fs.readFileSync(new URL("../src/index_v39_world_gate.js", import.meta.url), "utf8");
const wrappedPresence = wrangler.includes('"main": "src/index_v39_world_gate.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"')
  && worldWrapper.includes('from "./index_v39_presence_fix.js"');
const v40Wrapper = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
const wrappedByV40 = wrangler.includes('"main": "src/index_v40_scene_continuity.js"')
  && wrangler.includes('"DEPLOY_VERSION": "40"')
  && v40Wrapper.includes('from "./index_v39_world_gate.js"')
  && worldWrapper.includes('from "./index_v39_presence_fix.js"');
const v41Wrapper = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
const wrappedByV41 = wrangler.includes('"main": "src/index_v41_scene_coordinator.js"')
  && wrangler.includes('"DEPLOY_VERSION": "41"')
  && v41Wrapper.includes('from "./index_v40_scene_continuity.js"')
  && v40Wrapper.includes('from "./index_v39_world_gate.js"')
  && worldWrapper.includes('from "./index_v39_presence_fix.js"');
const v41GenerationWrapper = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
const wrappedByV41Generation = wrangler.includes('"main": "src/index_v41_generation_contract.js"')
  && wrangler.includes('"DEPLOY_VERSION": "41"')
  && v41GenerationWrapper.includes('from "./index_v41_scene_coordinator.js"')
  && v41Wrapper.includes('from "./index_v40_scene_continuity.js"')
  && v40Wrapper.includes('from "./index_v39_world_gate.js"')
  && worldWrapper.includes('from "./index_v39_presence_fix.js"');
assert.ok(directPresence || wrappedPresence || wrappedByV40 || wrappedByV41 || wrappedByV41Generation, "production must retain the v39 presence/capture wrapper directly or beneath the v39 world/v40/v41 scene wrappers");

console.log("v39 presence + capture-derived provider/coherence/history regression checks passed");
