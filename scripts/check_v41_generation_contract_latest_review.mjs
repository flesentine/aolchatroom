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
  "I have a chance, and I have played it",
  "I have one quick question, and I have played it",
  "I have a headache, and I have played it",
  "I have 2 questions, and I have played it"
]) {
  result = evaluate(ownershipPerfect, surface);
  assert.equal(result.ok, false, `${surface} must not masquerade as ownership evidence`);
  assert.equal(result.reason, "missing-polarity");
}
assert.equal(evaluate(ownershipPerfect, "I have one, and I have played it").ok, true,
  "direct possession-shaped ownership evidence must remain valid");
assert.equal(evaluate("do you own a Neo Geo and have you played it?", "I have a Neo Geo, and I have played it").ok, true,
  "named possession should be accepted when its object overlaps the ownership question");
assert.equal(evaluate("do you own Neo Geo systems and have you played one?", "I have 2 Neo Geo systems, and I have played one").ok, true,
  "numeric named possession should remain valid when its object overlaps the ownership question");

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

const repeatedQuantity = "how many systems do you have and how many games do you own?";
const repeatedQuantityMeaning = "give the system count and the game count";
result = evaluate(repeatedQuantity, "between 2 systems and 5 systems", { meaning: repeatedQuantityMeaning });
assert.equal(result.ok, false, "a numeric range about one requested subject must remain one evidence item");
assert.equal(result.reason, "missing-quantity");
assert.equal(evaluate(repeatedQuantity, "I have 2 systems, and I own 5 games", { meaning: repeatedQuantityMeaning }).ok, true,
  "subject-scoped repeated counts must remain valid");
assert.equal(evaluate(repeatedQuantity, "2 and 5", { meaning: repeatedQuantityMeaning }).ok, true,
  "compact subjectless counts may still fill distinct repeated quantity obligations in order");

const repeatedPrice = "how much did the Neo Geo cost and how much did the game cost?";
const repeatedPriceMeaning = "give the Neo Geo price and the game price";
result = evaluate(repeatedPrice, "between $600 and $700 for the console", { meaning: repeatedPriceMeaning });
assert.equal(result.ok, false, "a price range for one subject must not satisfy two distinct price obligations");
assert.equal(result.reason, "missing-price");
result = evaluate(repeatedPrice, "about 50 copies, around 20 games were made", { meaning: repeatedPriceMeaning });
assert.equal(result.ok, false, "approximate count evidence must not satisfy repeated monetary obligations");
assert.equal(result.reason, "missing-price");
assert.equal(evaluate(repeatedPrice, "$600, $50", { meaning: repeatedPriceMeaning }).ok, true,
  "compact subjectless monetary values may fill distinct repeated price obligations in order");
assert.equal(evaluate(repeatedPrice, "Neo Geo was $600, game was $50", { meaning: repeatedPriceMeaning }).ok, true,
  "subject-scoped repeated monetary answers must remain valid");

const paraphrasedPrice = "what was the price and how much did it cost?";
result = evaluate(paraphrasedPrice, "$600", { meaning: "give the price" });
assert.equal(result.ok, true, "paraphrases of one requested amount must not become duplicate hard obligations");
assert.equal(result.contract.repeatedHardObligations?.price, undefined,
  "same-subject or subjectless amount paraphrases must not create repeated price obligations");

console.log("v41 Phase 2A latest adversarial review regressions passed");
