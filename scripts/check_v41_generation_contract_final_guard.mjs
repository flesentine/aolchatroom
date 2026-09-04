import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";

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
  "I own a PlayStation, and yes, I have played it",
  "I own a PlayStation, but no"
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

const modelOwnership = "do you own a PlayStation 5 and have you played it?";
let result = evaluate(modelOwnership, "I own a PlayStation 4, and I have played it");
assert.equal(result.ok, false, "a shared product-family token must not erase a conflicting model identifier");
assert.equal(result.reason, "missing-polarity");
for (const wrongVariant of [
  "I own a PlayStation 5 Pro, and I have played it",
  "I own a PlayStation 5 Slim, and I have played it",
  "Yes, I own a PlayStation 4 and I have played it",
  "Yeah, I own a PlayStation 5 Pro and I have played it"
]) {
  result = evaluate(modelOwnership, wrongVariant);
  assert.equal(result.ok, false, `${wrongVariant} must not satisfy plain PlayStation 5 ownership`);
  assert.equal(result.reason, "missing-polarity");
}
assert.equal(evaluate(modelOwnership, "I own a PlayStation 5, and I have played it").ok, true,
  "the requested model must remain valid");
assert.equal(evaluate(modelOwnership, "I own a PS5, and I have played it").ok, true,
  "standard PS5 abbreviation must canonicalize to PlayStation 5");
assert.equal(evaluate("do you own a PS5 and have you played it?", "I own a PlayStation 5, and I have played it").ok, true,
  "PlayStation 5 must satisfy a PS5 ownership question");
assert.equal(evaluate(modelOwnership, "I own a Sony PlayStation 5 console, and I have played it").ok, true,
  "extra manufacturer/generic descriptor wording must not false-reject the requested model");
assert.equal(evaluate(
  "do you own a Sony PlayStation 5 console and have you played it?",
  "I own a PlayStation 5, and I have played it"
).ok, true, "question-side manufacturer/generic descriptors must not become required model identity");

const choice = "do you want tea or do you want coffee?";
result = evaluate(choice, "I don't want coffee");
assert.equal(result.ok, false, "negating one alternative must not masquerade as positively selecting it");
assert.equal(result.reason, "missing-choice-selection");
for (const invalid of [
  "please don't give me coffee",
  "not coffee, please",
  "coffee is what I want to avoid"
]) {
  result = evaluate(choice, invalid);
  assert.equal(result.ok, false, `${invalid} must remain a rejection/avoidance, not a positive selection`);
  assert.equal(result.reason, "missing-choice-selection");
}
result = evaluate(choice, "I don't want tea, coffee please");
assert.equal(result.ok, true, "negative mention of one alternative plus explicit selection of the other must pass");
assert.equal(evaluate(choice, "no coffee, tea please").ok, true,
  "a negated alternative plus a positive other selection must pass");
for (const valid of [
  "coffee, please",
  "I want coffee",
  "I would have coffee",
  "Coffee is my choice",
  "Coffee would be nice",
  "I don't want tea; coffee is what I want",
  "coffee is the one I want"
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

const versionedPriceQuestion = "how much did the PlayStation 4 cost and how much did the PlayStation 5 cost?";
const versionedPriceMeaning = "give the PlayStation 4 price and the PlayStation 5 price";
result = evaluate(
  versionedPriceQuestion,
  "The PlayStation 4 was $400 and the PlayStation 4 was $300",
  { meaning: versionedPriceMeaning }
);
assert.equal(result.ok, false, "two PlayStation 4 prices must not satisfy PlayStation 4 plus PlayStation 5");
assert.equal(result.reason, "missing-price");
result = evaluate(
  versionedPriceQuestion,
  "The PlayStation 4 was $400 and the PlayStation 4 was $300; PlayStation 5 is cool",
  { meaning: versionedPriceMeaning }
);
assert.equal(result.ok, false, "an incidental PlayStation 5 mention without its own price must not satisfy the second price obligation");
assert.equal(result.reason, "missing-price");
result = evaluate(
  versionedPriceQuestion,
  "The PlayStation 4 was $400 and games on the PlayStation 5 cost $300",
  { meaning: versionedPriceMeaning }
);
assert.equal(result.ok, false, "a game price merely mentioning PlayStation 5 must not satisfy the PlayStation 5 hardware price");
assert.equal(result.reason, "missing-price");
assert.equal(evaluate(
  versionedPriceQuestion,
  "The PlayStation 4 was $400 and the PlayStation 5 was $300",
  { meaning: versionedPriceMeaning }
).ok, true, "distinct versioned price evidence must remain valid");

const versionedQuantityQuestion = "how many PlayStation 4 systems do you own and how many PlayStation 5 systems do you own?";
const versionedQuantityMeaning = "give the PlayStation 4 count and the PlayStation 5 count";
result = evaluate(
  versionedQuantityQuestion,
  "I own 2 PlayStation 4 systems and 3 PlayStation 4 systems",
  { meaning: versionedQuantityMeaning }
);
assert.equal(result.ok, false, "two PlayStation 4 counts must not satisfy PlayStation 4 plus PlayStation 5");
assert.equal(result.reason, "missing-quantity");
result = evaluate(
  versionedQuantityQuestion,
  "I own 2 PlayStation 4 systems and 3 PlayStation 4 systems; PlayStation 5 is cool",
  { meaning: versionedQuantityMeaning }
);
assert.equal(result.ok, false, "an incidental PlayStation 5 mention without its own count must not satisfy the second quantity obligation");
assert.equal(result.reason, "missing-quantity");
result = evaluate(
  versionedQuantityQuestion,
  "I own 2 PlayStation 4 systems and I own 5 games for my PlayStation 5",
  { meaning: versionedQuantityMeaning }
);
assert.equal(result.ok, false, "games owned for PlayStation 5 must not satisfy a PlayStation 5 hardware count");
assert.equal(result.reason, "missing-quantity");
assert.equal(evaluate(
  versionedQuantityQuestion,
  "I own 2 PlayStation 4 systems and 3 PlayStation 5 systems",
  { meaning: versionedQuantityMeaning }
).ok, true, "distinct versioned count evidence must remain valid");

const variantPriceQuestion = "how much did the PlayStation 5 Pro cost and how much did the PlayStation 5 Slim cost?";
const variantPriceMeaning = "give the PlayStation 5 Pro price and the PlayStation 5 Slim price";
result = evaluate(
  variantPriceQuestion,
  "The PlayStation 5 Pro was $500 and the PlayStation 5 Pro was $400",
  { meaning: variantPriceMeaning }
);
assert.equal(result.ok, false, "two Pro prices must not satisfy Pro plus Slim");
assert.equal(result.reason, "missing-price");
assert.equal(evaluate(
  variantPriceQuestion,
  "The PlayStation 5 Pro was $500 and the PlayStation 5 Slim was $400",
  { meaning: variantPriceMeaning }
).ok, true, "variant-specific Pro and Slim prices must pass");

const variantQuantityQuestion = "how many PlayStation 5 Pro systems do you own and how many PlayStation 5 Slim systems do you own?";
const variantQuantityMeaning = "give the PlayStation 5 Pro count and the PlayStation 5 Slim count";
result = evaluate(
  variantQuantityQuestion,
  "I own 2 PlayStation 5 Pro systems and 3 PlayStation 5 Pro systems",
  { meaning: variantQuantityMeaning }
);
assert.equal(result.ok, false, "two Pro counts must not satisfy Pro plus Slim");
assert.equal(result.reason, "missing-quantity");
assert.equal(evaluate(
  variantQuantityQuestion,
  "I own 2 PlayStation 5 Pro systems and 3 PlayStation 5 Slim systems",
  { meaning: variantQuantityMeaning }
).ok, true, "variant-specific Pro and Slim counts must pass");

const conditionalExistential = "would there be a fee and do you like the plan?";
assert.equal(evaluate(
  conditionalExistential,
  "there'd be one, and yes I like it",
  { meaning: "answer both parts" }
).ok, true, "positive conditional existential contraction must normalize for evaluation");

console.log("v41 Phase 2A final guard regressions passed");