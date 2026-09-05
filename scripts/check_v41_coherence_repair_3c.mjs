import assert from "node:assert/strict";
import fs from "node:fs";
import { CoherenceRepairAuthority } from "../src/coherence_repair_v41.js";

function room() {
  return {
    activeBotNames: ["MoonChild", "RaveChick", "SegaMan"],
    history: [],
    pendingHumanReplyTo: new Map(),
    v39Stats: { clarificationTargetRepairs: 0, coherenceVoiceLocks: 0 },
    v39CaptureFixStats: { explicitErrorChallengesRepaired: 0 },
    v39LastTargetRepair: null,
    v39LastCoherenceLock: null,
    focuses: [],
    setFocus(human, bot, at, reason) { this.focuses.push({ human, bot, at, reason }); }
  };
}

{
  const r = room();
  const now = Date.now();
  r.history = [
    { kind: "bot", from: "MoonChild", text: "aint heard it yet, is it seriously that bad", target: "room", messageId: "m1", at: now - 18000 },
    { kind: "bot", from: "RaveChick", text: "haha yeah we had that at our hotel last week ;)", target: "room", messageId: "m2", at: now - 5000 }
  ];
  const a = new CoherenceRepairAuthority(r);
  const target = a.resolveDirectTarget("had what at your hotel?", "Crateman", () => "room");
  assert.equal(target, "RaveChick");
  assert.equal(r.pendingHumanReplyTo.get("Crateman"), "m2");
  assert.equal(r.v39Stats.clarificationTargetRepairs, 1);
  assert.equal(r.v39LastTargetRepair?.repairedTarget, "RaveChick");

  const explicit = a.resolveDirectTarget("SegaMan, had what at your hotel?", "Crateman", () => "SegaMan");
  assert.equal(explicit, "SegaMan");
  assert.equal(r.v39Stats.clarificationTargetRepairs, 1);
}

{
  const r = room();
  const now = Date.now();
  const anchor = { kind: "bot", from: "SegaMan", text: "saturn is definitely a video", target: "Crateman", messageId: "m-anchor", at: now - 1000 };
  const human = { kind: "human", from: "Crateman", text: "that makes no sense, you just said it was a video", replyTo: "m-anchor", messageId: "m-human", at: now };
  r.history = [anchor, human];
  const a = new CoherenceRepairAuthority(r);
  let delegated = null;
  const result = await a.voiceBrainPlan(
    { goal: "explain it", moves: [{ speaker: "SegaMan", target: "Crateman", intent: "clarify", meaning: "explain" }] },
    [],
    human,
    async (nextPlan) => { delegated = nextPlan; return [{ speaker: "SegaMan", target: "Crateman", text: "yeah i mixed that up" }]; }
  );
  assert.equal(result.length, 1);
  assert.match(delegated.goal, /V39 ERROR-REPAIR LOCK/);
  assert.match(delegated.goal, /V39 COHERENCE LOCK/);
  assert.equal(r.v39Stats.coherenceVoiceLocks, 1);
  assert.equal(r.v39CaptureFixStats.explicitErrorChallengesRepaired, 1);
  assert.equal(r.v39LastCoherenceLock?.mode, "challenge");
  assert.equal(r.v39LastCoherenceLock?.anchorFrom, "SegaMan");
}

{
  const r = room();
  const a = new CoherenceRepairAuthority(r);
  const plan = { goal: "ambient", moves: [{ speaker: "SegaMan", target: "room", meaning: "chat" }] };
  let delegated = null;
  await a.voiceBrainPlan(plan, [], null, async (nextPlan) => { delegated = nextPlan; return []; });
  assert.equal(delegated, plan);
  assert.equal(r.v39Stats.coherenceVoiceLocks, 0);
}

const wrapper = fs.readFileSync(new URL("../src/index_v41_coherence_repair.js", import.meta.url), "utf8");
const generationBase = fs.readFileSync(new URL("../src/index_v41_generation_contract_base.js", import.meta.url), "utf8");
const generationFinal = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
const v39Coherence = fs.readFileSync(new URL("../src/index_v39_coherence.js", import.meta.url), "utf8");
const v39Presence = fs.readFileSync(new URL("../src/index_v39_presence_fix.js", import.meta.url), "utf8");
const v39World = fs.readFileSync(new URL("../src/index_v39_world_gate.js", import.meta.url), "utf8");
const v40 = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
const v41Scene = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
const v41Reconnect = fs.readFileSync(new URL("../src/index_v41_human_reconnect.js", import.meta.url), "utf8");

function ownsMethod(source, name) {
  return new RegExp(`^  (?:async )?${name}\\(`, "m").test(source);
}

assert.ok(wrapper.includes('from "./index_v41_human_reconnect.js"'));
assert.ok(wrapper.includes('from "./index_v38_quality_guard.js"'));
assert.ok(wrapper.includes("V38ChatRoom.prototype.resolveDirectTarget.call"));
assert.ok(wrapper.includes("V38ChatRoom.prototype.voiceBrainPlan.call"));
assert.ok(generationBase.includes('from "./index_v41_coherence_repair.js"'));
assert.ok(generationFinal.includes('from "./index_v41_coherence_repair.js"'));
assert.ok(generationFinal.includes("V41CoherenceChatRoom.prototype.voiceBrainPlan.call"));
assert.ok(v39Coherence.includes("inferClarificationTarget("));
assert.ok(v39Coherence.includes("withCoherenceConstraint("));
assert.ok(v39Presence.includes("applyErrorChallengePlan("));
for (const [name, source] of [["v39 world", v39World], ["v40 continuity", v40], ["v41 scene", v41Scene], ["v41 reconnect", v41Reconnect]]) {
  assert.equal(ownsMethod(source, "resolveDirectTarget"), false, `${name} must not own resolveDirectTarget() while 3C delegates below legacy v39 repair`);
  assert.equal(ownsMethod(source, "voiceBrainPlan"), false, `${name} must not own voiceBrainPlan() while 3C delegates below legacy v39 repair`);
}

console.log("v41 Phase 3C coherence/repair authority checks passed");
