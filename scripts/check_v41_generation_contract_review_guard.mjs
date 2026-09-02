import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";

function directPlan({ meaning = "Directly answer the human's latest message", goal = meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review-guard",
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

const ownershipQuestion = "do you own a PlayStation 5 and have you played it?";
let result = evaluate(ownershipQuestion, "Yes, I do own a PlayStation 4, and I have played it");
assert.equal(result.ok, false, "auxiliary-bearing wrong-model ownership must be rejected");
assert.equal(result.reason, "missing-polarity");
assert.equal(evaluate(ownershipQuestion, "Yes, I do own a PlayStation 5, and I have played it").ok, true,
  "auxiliary-bearing matching ownership must remain valid");
assert.equal(evaluate(ownershipQuestion, "I really do own a PS5, and I have played it").ok, true,
  "adverb + auxiliary matching ownership with alias must remain valid");

const priceQuestion = "how much did the PlayStation 4 cost and how much did the PlayStation 5 cost?";
const priceMeaning = "give the PlayStation 4 price and the PlayStation 5 price";
result = evaluate(
  priceQuestion,
  "The PlayStation 4 was $400 and a PlayStation 5 headset costs $300",
  { meaning: priceMeaning }
);
assert.equal(result.ok, false, "a peripheral price must not satisfy the requested console price");
assert.equal(result.reason, "missing-price");
assert.equal(evaluate(
  priceQuestion,
  "The PlayStation 4 was $400 and the PlayStation 5 costs $300",
  { meaning: priceMeaning }
).ok, true, "hardware-subject price evidence must remain valid");
assert.equal(evaluate(
  priceQuestion,
  "$400 for the PlayStation 4 and $300 for the PlayStation 5",
  { meaning: priceMeaning }
).ok, true, "amount-before-model hardware price evidence must remain valid");

const choiceQuestion = "do you want tea or do you want coffee?";
for (const invalid of [
  "coffee is what I want to reject",
  "I want to reject coffee",
  "coffee is what I want to decline"
]) {
  result = evaluate(choiceQuestion, invalid);
  assert.equal(result.ok, false, `${invalid} must remain a rejection, not a positive selection`);
  assert.equal(result.reason, "missing-choice-selection");
}
assert.equal(evaluate(choiceQuestion, "coffee is what I want").ok, true,
  "the adjacent positive inverted selection must remain valid");

const aliasChoiceA = "do you want a PS5 or do you want an Xbox Series X?";
assert.equal(evaluate(aliasChoiceA, "I'd like a PlayStation 5").ok, true,
  "PlayStation 5 response must satisfy a PS5 choice alternative");
const aliasChoiceB = "do you want a PlayStation 5 or do you want an Xbox Series X?";
assert.equal(evaluate(aliasChoiceB, "I'd like a PS5").ok, true,
  "PS5 response must satisfy a PlayStation 5 choice alternative");
assert.equal(evaluate(aliasChoiceA, "I'd like an Xbox Series X").ok, true,
  "the non-aliased alternative must remain valid");

console.log("v41 Phase 2A latest review guard regressions passed");
