import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateHumanReplanPrimaryResponse,
  humanReplanPrimaryObligation
} from "../src/generation_contract_v41.js";

const directHuman = {
  kind: "human",
  from: "Crateman",
  target: "MetallicaFan",
  text: "what do you think?",
  messageId: "m-human-direct",
  at: 1000
};

const directObligation = humanReplanPrimaryObligation({ human: directHuman });
assert.equal(directObligation.enforced, true);
assert.equal(directObligation.reason, "direct-human-target");
assert.equal(directObligation.speaker, "MetallicaFan");
assert.equal(directObligation.target, "Crateman");

const sideOnly = evaluateHumanReplanPrimaryResponse({
  human: directHuman,
  lines: [{ speaker: "SegaMan", target: "room", text: "saturn rules", source: "gemini" }]
});
assert.equal(sideOnly.ok, false);
assert.equal(sideOnly.reason, "required-responder-not-first");

const sideThenAnswer = evaluateHumanReplanPrimaryResponse({
  human: directHuman,
  lines: [
    { speaker: "SegaMan", target: "room", text: "saturn rules", source: "gemini" },
    { speaker: "MetallicaFan", target: "Crateman", text: "yeah its cool", source: "gemini" }
  ]
});
assert.equal(sideThenAnswer.ok, false, "a later correct answer must not rescue a batch that spends the human's first response slot on side chatter");
assert.equal(sideThenAnswer.reason, "required-responder-not-first");

const wrongTargetFirst = evaluateHumanReplanPrimaryResponse({
  human: directHuman,
  lines: [{ speaker: "MetallicaFan", target: "room", text: "yeah its cool", source: "gemini" }]
});
assert.equal(wrongTargetFirst.ok, false);
assert.equal(wrongTargetFirst.reason, "required-human-target-not-first");

const answerThenSide = evaluateHumanReplanPrimaryResponse({
  human: directHuman,
  lines: [
    { speaker: "MetallicaFan", target: "Crateman", text: "yeah its cool", source: "gemini" },
    { speaker: "SegaMan", target: "room", text: "saturn rules", source: "gemini" }
  ]
});
assert.equal(answerThenSide.ok, true, "once the required human answer owns the first slot, later room overlap may remain natural");

const anchor = {
  kind: "bot",
  from: "JennJenn",
  target: "Crateman",
  text: "night shift was brutal",
  messageId: "m-jenn",
  at: 900
};
const replyHuman = {
  kind: "human",
  from: "Crateman",
  target: "room",
  text: "why?",
  replyTo: "m-jenn",
  messageId: "m-human-reply",
  at: 1000
};
const anchoredObligation = humanReplanPrimaryObligation({ human: replyHuman, history: [anchor, replyHuman] });
assert.equal(anchoredObligation.enforced, true);
assert.equal(anchoredObligation.reason, "reply-to-bot-anchor");
assert.equal(anchoredObligation.speaker, "JennJenn");
assert.equal(anchoredObligation.target, "Crateman");
assert.equal(evaluateHumanReplanPrimaryResponse({
  human: replyHuman,
  history: [anchor, replyHuman],
  lines: [{ speaker: "JennJenn", target: "Crateman", text: "manager kept us late", source: "gemini" }]
}).ok, true);
assert.equal(evaluateHumanReplanPrimaryResponse({
  human: replyHuman,
  history: [anchor, replyHuman],
  lines: [{ speaker: "SegaMan", target: "room", text: "anyone got virtua fighter", source: "gemini" }]
}).ok, false);

const roomHuman = {
  kind: "human",
  from: "Crateman",
  target: "room",
  text: "anyone still awake?",
  messageId: "m-room",
  at: 1000
};
const roomEvaluation = evaluateHumanReplanPrimaryResponse({
  human: roomHuman,
  history: [roomHuman],
  lines: [{ speaker: "SegaMan", target: "room", text: "yeah", source: "gemini" }]
});
assert.equal(roomEvaluation.enforced, false, "ordinary room-addressed humans without a reply anchor remain outside the strict primary-slot contract");
assert.equal(roomEvaluation.ok, true);

const wrapper = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
assert.ok(wrapper.includes("async generateHumanReplan(human)"));
assert.ok(wrapper.includes("evaluateHumanReplanPrimaryResponse"));
assert.ok(wrapper.includes("this.builtInHumanReply?.(human)"));
assert.ok(wrapper.includes("missingRequiredHumanReplanResponseDropsEntireTail: true"));
assert.ok(wrapper.includes("failedHumanReplanUsesOnlyValidatedBuiltInFallback: true"));
assert.ok(!wrapper.includes("callProvider("), "Phase 2B fail-closed recovery must not add a provider call");

console.log("v41 Phase 2B human-replan primary-response fail-closed checks passed");
