import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_hardened.js";

function directPlan({ meaning = "answer both parts", goal = meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-latest-review",
    goal,
    moves: [{
      speaker: "MetallicaFan",
      target: "Crateman",
      intent: "answer",
      topic: "general",
      meaning
    }]
  };
}

function evaluate(question, surface, options = {}) {
  return evaluatePrimaryHumanVoice({
    plan: directPlan({ meaning: options.meaning || "answer both parts", goal: options.goal || options.meaning || "answer both parts" }),
    human: { kind: "human", from: "Crateman", target: "MetallicaFan", text: question },
    lines: [{
      speaker: options.speaker || "MetallicaFan",
      target: options.target || "Crateman",
      text: surface,
      source: "gemini"
    }]
  });
}

const groupedQuestion = "how many systems do you have and do you like them?";
let result = evaluate(groupedQuestion, "I have 1,000 systems, and yes I like them", { speaker: "WrongBot" });
assert.equal(result.ok, false, "grouped-count repair must never override a speaker-routing failure");
assert.equal(result.reason, "primary-speaker-mismatch");
result = evaluate(groupedQuestion, "I have 1,000 systems, and yes I like them", { target: "room" });
assert.equal(result.ok, false, "grouped-count repair must never override a target-routing failure");
assert.equal(result.reason, "primary-target-mismatch");
assert.equal(evaluate(groupedQuestion, "I have 1,000 systems, and yes I like them").ok, true,
  "valid grouped quantity repair must remain available for a correctly routed line");

const ownershipPerfect = "do you own it and have you played it?";
for (const surface of [
  "I have some time to play it, and I have played it",
  "I have no idea, and I have played it",
  "I have a chance, and I have played it"
]) {
  result = evaluate(ownershipPerfect, surface);
  assert.equal(result.ok, false, `${surface} must not masquerade as ownership evidence`);
  assert.equal(result.reason, "missing-polarity");
}
assert.equal(evaluate(ownershipPerfect, "I have one, and I have played it").ok, true,
  "direct possession-shaped ownership evidence must remain valid");
assert.equal(evaluate("do you own a Neo Geo and have you played it?", "I have a Neo Geo, and I have played it").ok, true,
  "named possession should be accepted when its object overlaps the ownership question");

const choice = "do you want tea or do you want coffee?";
assert.equal(evaluate(choice, "I'd like coffee").ok, true,
  "ordinary would-like selection syntax must satisfy a genuine choice");
assert.equal(evaluate(choice, "coffee sounds good").ok, true,
  "postposed sounds-good selection syntax must satisfy a genuine choice");
assert.equal(evaluate(choice, "I spilled coffee yesterday").ok, false,
  "mere mention of a choice token must remain rejected");

const existential = "are there any games and do you like them?";
assert.equal(evaluate(existential, "there're several, and yes I like them").ok, true,
  "plural contracted existential answers must normalize for evaluation");

console.log("v41 Phase 2A latest adversarial review regressions passed");
