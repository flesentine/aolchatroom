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

// Finding 65: negative ownership must be bound to the requested object, not treated as a global denial.
result = evaluate(ownershipQuestion, "I don't own a PlayStation 4, and I have played it");
assert.equal(result.ok, false, "a denial of a different model must not satisfy PS5 ownership");
assert.equal(result.reason, "missing-polarity");
const twoOwnershipQuestion = "do you own a PS5 and do you own an Xbox?";
assert.equal(evaluate(twoOwnershipQuestion, "No, but I own an Xbox").ok, true,
  "a leading denial may answer the first ownership obligation while a matching explicit assertion answers the second");

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

// Findings 66-67: reverse-bound peripherals must not inherit the model price, while possessive prices are valid.
result = evaluate(
  priceQuestion,
  "$400 for the PlayStation 4 and $300 for the PlayStation 5 headset",
  { meaning: priceMeaning }
);
assert.equal(result.ok, false, "reverse-bound peripheral price must not satisfy the console price");
assert.equal(result.reason, "missing-price");
assert.equal(evaluate(
  priceQuestion,
  "PlayStation 4's price was $400 and PlayStation 5's price was $300",
  { meaning: priceMeaning }
).ok, true, "possessive hardware price syntax must remain valid");

const choiceQuestion = "do you want tea or do you want coffee?";
for (const invalid of [
  "coffee is what I want to reject",
  "I want to reject coffee",
  "coffee is what I want to decline",
  "coffee is the one I want refused",
  "coffee is the one I want declined",
  "coffee is the one I want avoided",
  "coffee is the one I want skipped",
  "coffee is the one I want excluded"
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

// Finding 69: a shared family token is not enough; model discriminators must match the selected alternative.
result = evaluate(aliasChoiceA, "I'd like a PlayStation 4");
assert.equal(result.ok, false, "PlayStation 4 must not satisfy a PS5 choice alternative");
assert.equal(result.reason, "missing-choice-selection");

console.log("v41 Phase 2A latest review guard regressions passed");
