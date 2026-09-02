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
    lines: [{
      speaker: options.speaker || "MetallicaFan",
      target: options.target || "Crateman",
      text: surface,
      source: "gemini"
    }]
  });
}

const ownership = "do you own a Neo Geo and have you played it?";
for (const wrong of [
  "I own 2 PlayStations, and I have played it",
  "I own one PlayStation, and I have played it",
  "I own this PlayStation, and I have played it",
  "I own a PlayStation, and yes, I have played it"
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
  "a leading explicit negative ownership answer may be followed by ownership of another object");

const choice = "do you want tea or do you want coffee?";
let result = evaluate(choice, "I don't want coffee");
assert.equal(result.ok, false, "negating one alternative must not masquerade as positively selecting it");
assert.equal(result.reason, "missing-choice-selection");
result = evaluate(choice, "I don't want tea, coffee please");
assert.equal(result.ok, true, "negative mention of one alternative plus explicit selection of the other must pass");
for (const valid of [
  "coffee, please",
  "I want coffee",
  "I would have coffee",
  "Coffee is my choice",
  "Coffee would be nice"
]) {
  assert.equal(evaluate(choice, valid).ok, true, `${valid} must be recognized as a genuine declarative selection`);
}
assert.equal(evaluate(choice, "I spilled coffee yesterday").ok, false,
  "incidental alternative mention must remain rejected");

const repeatedQuantity = "how many systems do you have and how many games do you own?";
const repeatedQuantityMeaning = "give the systems count and the games count";
result = evaluate(repeatedQuantity, "I own 2 systems and 5 systems", { meaning: repeatedQuantityMeaning });
assert.equal(result.ok, false, "a second systems value must not be donated to the games obligation");
assert.equal(result.reason, "missing-quantity");
assert.equal(evaluate(repeatedQuantity, "I own two systems with five games", { meaning: repeatedQuantityMeaning }).ok, true,
  "word-form subject-specific compact counts must pass");
assert.equal(evaluate(
  "how many Neo Geo systems do you have and how many games do you own?",
  "I own 2 Neo Geo systems with 5 games",
  { meaning: repeatedQuantityMeaning }
).ok, true, "qualified numeric compact counts must pass");
result = evaluate(repeatedQuantity, "I own 2 systems with 5 games", {
  meaning: repeatedQuantityMeaning,
  speaker: "WrongBot"
});
assert.equal(result.ok, false, "compact repeated-count repair must never override a speaker-routing failure");
assert.equal(result.reason, "primary-speaker-mismatch");

const repeatedPrice = "how much did the Neo Geo cost and how much did the game cost?";
const repeatedPriceMeaning = "give the Neo Geo price and the game price";
assert.equal(evaluate(
  repeatedPrice,
  "The console was $600 versus $50 for the game",
  { meaning: repeatedPriceMeaning }
).ok, true, "generic console wording may alias the named Neo Geo when no requested clause explicitly owns console");
result = evaluate(
  "how much did the console cost and how much did the game cost?",
  "The console was $600 versus $700 for the console",
  { meaning: "give the console price and the game price" }
);
assert.equal(result.ok, false, "a second console price must not be donated to the game price obligation");
assert.equal(result.reason, "missing-price");

const conditionalExistential = "would there be a fee and do you like the plan?";
assert.equal(evaluate(
  conditionalExistential,
  "there'd be one, and yes I like it",
  { meaning: "answer both parts" }
).ok, true, "positive conditional existential contraction must normalize for evaluation");

console.log("v41 Phase 2A final guard regressions passed");
