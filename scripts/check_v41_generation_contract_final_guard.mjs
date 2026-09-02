import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_final_guard.js";

function directPlan({ meaning = "Directly answer the human's latest message", goal = meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-final-guard",
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
    plan: directPlan({ meaning: options.meaning, goal: options.goal }),
    human: { kind: "human", from: "Crateman", target: "MetallicaFan", text: question },
    lines: [{ speaker: "MetallicaFan", target: "Crateman", text: surface, source: "gemini" }]
  });
}

const ownership = "do you own a Neo Geo and have you played it?";
for (const wrong of [
  "I own 2 PlayStations, and I have played it",
  "I own one PlayStation, and I have played it",
  "I own this PlayStation, and I have played it"
]) {
  const result = evaluate(ownership, wrong);
  assert.equal(result.ok, false, `${wrong} must not bypass named-object ownership matching`);
  assert.equal(result.reason, "missing-polarity");
}
assert.equal(evaluate(ownership, "I own 2 Neo Geos, and I have played it").ok, true,
  "counted matching named ownership must remain valid");
assert.equal(evaluate(ownership, "I own one, and I have played it").ok, true,
  "standalone direct-object ownership must remain valid");
assert.equal(evaluate(ownership, "no, I own a PlayStation, but I have played it").ok, true,
  "an explicit negative ownership answer may be followed by ownership of another object");

const choice = "do you want tea or do you want coffee?";
let result = evaluate(choice, "I don't want coffee");
assert.equal(result.ok, false, "negating one alternative must not masquerade as positively selecting it");
assert.equal(result.reason, "missing-choice-selection");
result = evaluate(choice, "I don't want tea, coffee please");
assert.equal(result.ok, true, "negative mention of one alternative plus explicit selection of the other must pass");
assert.equal(evaluate(choice, "coffee, please").ok, true,
  "comma-politeness selection must pass");
assert.equal(evaluate(choice, "I want coffee").ok, true,
  "ordinary positive want selection must remain valid");
assert.equal(evaluate(choice, "I spilled coffee yesterday").ok, false,
  "incidental alternative mention must remain rejected");

console.log("v41 Phase 2A final guard regressions passed");
