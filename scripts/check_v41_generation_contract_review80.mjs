import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";

function directPlan({ meaning = "Directly answer the human's latest message", goal = meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review94",
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
    }],
    eraDateKey: options.eraDateKey || ""
  });
}

const ownershipQuestion = "do you own a PlayStation 5 and have you played it?";
for (const valid of [
  "I own a PlayStation 5 at home, and I have played it",
  "I own a PlayStation 5 video game console, and I have played it",
  "I have a PlayStation 5 at home, and I have played it"
]) {
  assert.equal(evaluate(ownershipQuestion, valid).ok, true,
    `${valid} must remain valid ownership evidence despite a harmless adjunct/generic head`);
}
for (const invalid of [
  "I own a PlayStation 5 headset at home, and I have played it",
  "I own a PlayStation 5 controller at home, and I have played it",
  "I own a headset for a PlayStation 5, and I have played it"
]) {
  const result = evaluate(ownershipQuestion, invalid);
  assert.equal(result.ok, false, `${invalid} must not become ownership of the PS5 console`);
  assert.equal(result.reason, "missing-polarity");
}

const singlePriceQuestion = "how much did the PlayStation 5 cost?";
const singlePriceMeaning = "give the PlayStation 5 price";
for (const valid of [
  "The PlayStation 5 price was $499",
  "The PlayStation 5 system price was $499",
  "The PlayStation 5 launch price was $499",
  "the price for the PlayStation 5 was $499",
  "$499 for the PlayStation 5",
  "the PlayStation 5 costs $499",
  "I paid $499 for my PlayStation 5",
  "I paid $499 for John's PlayStation 5",
  "I paid $499 for Chris' PlayStation 5",
  "I paid $499 for the Joneses' PlayStation 5",
  "I paid $499 for John's old PlayStation 5",
  "I paid $499 for John's very old slightly scratched original beloved PlayStation 5",
  "John's very own PlayStation 5 costs $499",
  "The PlayStation-5 costs $499",
  "The PlayStation–5 costs $499",
  "The PlayStation−5 costs $499",
  "A fancy brand new home video game console designed exclusively to work with the PlayStation 5 costs $499",
  "A fancy brand new home video game console carefully designed exclusively to work with the PlayStation 5 costs $499",
  "A fancy brand new home video game system custom built for the PlayStation 5 costs $499",
  "A fancy brand new home video game unit purpose built for the PlayStation 5 costs $499",
  "A fancy brand new home video game console newly made for the PlayStation 5 costs $499",
  "A fancy brand new replacement video game console for the PlayStation 5 costs $499",
  "This fancy brand new home video game console designed exclusively to work with the PlayStation 5 costs $499",
  "John's fancy brand new home video game console designed exclusively to work with the PlayStation 5 costs $499",
  "fancy brand new home video game console designed exclusively to work with the PlayStation 5 costs $499",
  "I paid $499 for a fancy brand new home video game console designed exclusively to work with the PlayStation 5"
]) {
  assert.equal(evaluate(singlePriceQuestion, valid, { meaning: singlePriceMeaning }).ok, true,
    `${valid} must remain valid PS5 price evidence when the evaluator is intentionally used without an era boundary`);
}
for (const invalid of [
  "The PlayStation 5 headset price was $70",
  "The PlayStation 5 system controller costs $70",
  "a headset for the PlayStation 5 costs $70",
  "a case for the PlayStation 5 was $20",
  "I paid $70 for a headset for the PlayStation 5",
  "a headset compatible with the PlayStation 5 costs $70",
  "a headset compatible with my PlayStation 5 costs $70",
  "a controller designed for the PlayStation 5 costs $70",
  "a bundle with the PlayStation 5 costs $600",
  "I paid $70 for a headset for my PlayStation 5",
  "I paid $70 for a headset compatible with my PlayStation 5",
  "a PlayStation 5-compatible headset costs $70",
  "A controller for John's PlayStation 5 costs $70",
  "A controller for Chris' PlayStation 5 costs $70",
  "A controller for the Joneses' PlayStation 5 costs $70",
  "a case made for Chris's PlayStation 5 costs $20",
  "I paid $70 for John's PlayStation 5 controller",
  "I paid $70 for Chris' PlayStation 5 controller",
  "a headset for John's friend's PlayStation 5 costs $70",
  "A controller for John's old PlayStation 5 costs $70",
  "A controller for John's very old slightly scratched original beloved PlayStation 5 costs $70",
  "A headset compatible with John's very own PlayStation 5 costs $70",
  "I paid $70 for John's friend's old PlayStation 5 controller",
  "A PlayStation-5-compatible headset costs $70",
  "A PlayStation–5-compatible headset costs $70",
  "A PlayStation—5-compatible headset costs $70",
  "A PlayStation−5-compatible headset costs $70",
  "A PlayStation 5 - compatible headset costs $70",
  "A PlayStation 5 – compatible headset costs $70",
  "A PlayStation 5 — compatible headset costs $70",
  "A PlayStation 5 − compatible headset costs $70",
  "A fancy brand new wireless gaming headset designed exclusively to work with the PlayStation 5 costs $70",
  "A fancy brand new wireless gaming headset carefully designed exclusively to work with the PlayStation 5 costs $70",
  "A fancy brand new wireless gaming headset designed very carefully and quite deliberately exclusively to work with the PlayStation 5 costs $70",
  "This fancy brand new wireless gaming headset designed exclusively to work with the PlayStation 5 costs $70",
  "That fancy brand new wireless gaming headset designed exclusively to work with the PlayStation 5 costs $70",
  "John's fancy brand new wireless gaming headset designed exclusively to work with the PlayStation 5 costs $70",
  "fancy brand new wireless gaming stereo headset designed exclusively to work with the PlayStation 5 costs $70",
  "I paid $70 for a fancy brand new wireless gaming headset designed exclusively to work with the PlayStation 5"
]) {
  const result = evaluate(singlePriceQuestion, invalid, { meaning: singlePriceMeaning });
  assert.equal(result.ok, false, `${invalid} must not satisfy the PS5 console price`);
  assert.equal(result.reason, "missing-price");
}
for (const validWithPeripheral of [
  "The PlayStation 5 costs $499, but a headset for the PlayStation 5 costs $70",
  "The PlayStation 5 costs $499 while a headset compatible with the PlayStation 5 costs $70",
  "A headset compatible with the PlayStation 5 costs $70 while the PlayStation 5 costs $499",
  "The PlayStation 5 costs $499 alongside a headset compatible with the PlayStation 5 costs $70",
  "The PlayStation 5 costs $499 although a headset for the PlayStation 5 costs $70",
  "A headset for the PlayStation 5 costs $70 although the PlayStation 5 costs $499",
  "The PlayStation 5 costs $499 even though a headset compatible with the PlayStation 5 costs $70",
  "A headset compatible with the PlayStation 5 costs $70 even though the PlayStation 5 costs $499",
  "The PlayStation 5 costs $499 while this fancy brand new wireless gaming headset designed exclusively to work with the PlayStation 5 costs $70"
]) {
  assert.equal(evaluate(singlePriceQuestion, validWithPeripheral, { meaning: singlePriceMeaning }).ok, true,
    `${validWithPeripheral} must keep the explicit console price valid despite extra peripheral pricing`);
}

// Adjacent independent probe: a peripheral can be introduced mid-clause after an amount/preposition.
for (const invalid of [
  "I paid $70 for games for the PlayStation 5",
  "I paid $70 for my headset for the PlayStation 5"
]) {
  const result = evaluate(singlePriceQuestion, invalid, { meaning: singlePriceMeaning });
  assert.equal(result.ok, false, `${invalid} must not donate a peripheral price to the PS5 console`);
  assert.equal(result.reason, "missing-price");
}
assert.equal(evaluate(
  singlePriceQuestion,
  "I paid $499 for the console for the PlayStation 5",
  { meaning: singlePriceMeaning }
).ok, true, "a safe generic console head after the amount/preposition must remain valid");
assert.equal(evaluate(
  singlePriceQuestion,
  "I paid $499 for a video game console for the PlayStation 5",
  { meaning: singlePriceMeaning }
).ok, true, "a safe generic compound console head must remain valid");

const repeatedPriceQuestion = "how much did the PlayStation 4 cost and how much did the PlayStation 5 cost?";
const repeatedPriceMeaning = "give the PlayStation 4 price and the PlayStation 5 price";
let result = evaluate(
  repeatedPriceQuestion,
  "The PlayStation 4 was $400 and a headset for the PlayStation 5 costs $70",
  { meaning: repeatedPriceMeaning }
);
assert.equal(result.ok, false, "a leading peripheral head must not supply the missing PS5 console price in a repeated-price answer");
assert.equal(result.reason, "missing-price");
result = evaluate(
  repeatedPriceQuestion,
  "The PlayStation 4 was $400 and a headset compatible with the PlayStation 5 costs $70",
  { meaning: repeatedPriceMeaning }
);
assert.equal(result.ok, false, "a relational peripheral head must not supply the missing PS5 console price in a repeated-price answer");
assert.equal(result.reason, "missing-price");
result = evaluate(
  repeatedPriceQuestion,
  "The PlayStation 4 was $400 and a controller for Chris' PlayStation 5 costs $70",
  { meaning: repeatedPriceMeaning }
);
assert.equal(result.ok, false, "a bare-apostrophe possessive peripheral relation must not supply the missing PS5 price");
assert.equal(result.reason, "missing-price");
assert.equal(evaluate(
  repeatedPriceQuestion,
  "The PlayStation 4 was $400 and the PlayStation 5 launch price was $499",
  { meaning: repeatedPriceMeaning }
).ok, true, "a normal PS4 price plus a qualified PS5 launch price must pass without an era boundary");
assert.equal(evaluate(
  repeatedPriceQuestion,
  "The PlayStation 4 was $400 and the PlayStation 5 costs $499 while a headset compatible with the PlayStation 5 costs $70",
  { meaning: repeatedPriceMeaning }
).ok, true, "an unsafe extra PS5 binding must not erase the explicit PS5 console price in a repeated answer");

// Finding 94: production supplies a 1996 eraDateKey. Future-product questions must
// prefer period-correct ignorance over semantic completion of an impossible premise.
for (const confident of ["$499", "yeah", "nah i dont own one", "it costs 499 bucks"] ) {
  result = evaluate(singlePriceQuestion, confident, {
    meaning: singlePriceMeaning,
    eraDateKey: "1996-09-03"
  });
  assert.equal(result.ok, false, `${confident} must not confidently answer a PS5 question inside the sealed 1996 world`);
  assert.equal(result.reason, "era-boundary-confident-answer");
}
for (const periodCorrect of [
  "what?",
  "what is that?",
  "never heard of that",
  "i have no clue what that is",
  "are you kidding?",
  "you mean the PlayStation?"
]) {
  result = evaluate(singlePriceQuestion, periodCorrect, {
    meaning: singlePriceMeaning,
    eraDateKey: "1996-09-03"
  });
  assert.equal(result.ok, true, `${periodCorrect} must be accepted as period-correct ignorance for a future-product question`);
  assert.equal(result.reason, "era-boundary-ignorance");
}
result = evaluate(singlePriceQuestion, "what is a PS5?", {
  meaning: singlePriceMeaning,
  eraDateKey: "1996-09-03"
});
assert.equal(result.ok, false, "a bot may not repeat the future console token even while expressing confusion");
assert.equal(result.reason, "era-boundary-future-surface");
assert.equal(evaluate(
  "how much did the Neo Geo cost?",
  "around 600 bucks",
  { meaning: "give the Neo Geo price", eraDateKey: "1996-09-03" }
).ok, true, "the era boundary must not weaken ordinary period-valid price answers");

console.log("v41 Phase 2A review 78-94 plus adjacent price-binding and sealed-era regressions passed");
