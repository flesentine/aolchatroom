import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_final.js";

function directPlan({ meaning = "Directly answer the human's latest message", goal = meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-final-review",
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

let result = evaluate(
  "do you own a Neo Geo and have you played it?",
  "I own a PlayStation, and I have played it"
);
assert.equal(result.ok, false, "explicit ownership of a different object must not satisfy Neo Geo ownership");
assert.equal(result.reason, "missing-polarity");
assert.equal(evaluate(
  "do you own a Neo Geo and have you played it?",
  "I own a Neo Geo, and I have played it"
).ok, true, "matching explicit ownership must remain valid");
assert.equal(evaluate(
  "do you own a Neo Geo and have you played it?",
  "I own one, and I have played it"
).ok, true, "direct pronominal ownership must remain valid");

const choice = "do you want tea or do you want coffee?";
result = evaluate(choice, "I spilled coffee yesterday");
assert.equal(result.ok, false, "single-obligation production choice must reject mere alternative mention");
assert.equal(result.reason, "missing-choice-selection");
assert.equal(evaluate(choice, "I'd like coffee").ok, true, "natural selection must pass under the production goal");
assert.equal(evaluate(choice, "coffee sounds good").ok, true, "postposed natural selection must pass under the production goal");
assert.equal(evaluate(choice, "neither thanks").ok, true, "explicitly declining both choices must remain a valid answer");

const repeatedQuantity = "how many systems do you have and how many games do you own?";
assert.equal(evaluate(repeatedQuantity, "I own 2 systems with 5 games", { meaning: "give both counts" }).ok, true,
  "two subject-specific counts inside one segment must satisfy both obligations");
result = evaluate(repeatedQuantity, "between 2 systems and 5 systems", { meaning: "give both counts" });
assert.equal(result.ok, false, "one systems range must not become a systems answer plus a games answer");
assert.equal(result.reason, "missing-quantity");

const repeatedPrice = "how much did the Neo Geo cost and how much did the game cost?";
assert.equal(evaluate(repeatedPrice, "The console was $600 versus $50 for the game", { meaning: "give the console price and the game price" }).ok, true,
  "two subject-specific prices inside one sentence must satisfy both obligations");
result = evaluate(repeatedPrice, "between $600 and $700 for the console", { meaning: "give the console price and the game price" });
assert.equal(result.ok, false, "one console price range must not become two price answers");
assert.equal(result.reason, "missing-price");

const futureExistential = "will there be a fee and do you like the plan?";
assert.equal(evaluate(futureExistential, "there'll be one, and yes I like it", { meaning: "answer both parts" }).ok, true,
  "positive future existential contraction must normalize for evaluation");
assert.equal(evaluate(futureExistential, "there won't be one, and yes I like it", { meaning: "answer both parts" }).ok, true,
  "negative future existential contraction must normalize for evaluation");
const perfectExistential = "has there been a fee and do you like the plan?";
assert.equal(evaluate(perfectExistential, "there's been one, and yes I like it", { meaning: "answer both parts" }).ok, true,
  "positive perfect existential contraction must normalize for evaluation");
const pluralPerfectExistential = "have there been fees and do you like the plan?";
assert.equal(evaluate(pluralPerfectExistential, "there've been several, and yes I like it", { meaning: "answer both parts" }).ok, true,
  "plural perfect existential contraction must normalize for evaluation");

console.log("v41 Phase 2A final adversarial review regressions passed");
