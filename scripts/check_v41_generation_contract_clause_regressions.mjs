import assert from "node:assert/strict";
import {
  buildPrimaryHumanVoiceContract,
  evaluatePrimaryHumanVoice
} from "../src/generation_contract_v41.js";

function directPlan({ meaning = "answer both parts", goal = meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-clause-regression",
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

function human(text) {
  return { kind: "human", from: "Crateman", target: "MetallicaFan", text };
}

function lines(text) {
  return [{ speaker: "MetallicaFan", target: "Crateman", text, source: "gemini" }];
}

function evaluate(question, surface, meaning = "answer both parts", goal = meaning) {
  return evaluatePrimaryHumanVoice({
    plan: directPlan({ meaning, goal }),
    human: human(question),
    lines: lines(surface)
  });
}

const doublePolarityQuestion = "do you own it and do you like it?";
const doublePolarityContract = buildPrimaryHumanVoiceContract({
  plan: directPlan(),
  human: human(doublePolarityQuestion)
});
assert.equal(doublePolarityContract.multiPart, true);
assert.equal(doublePolarityContract.polarityObligations.length, 2, "each yes/no clause must remain a separate obligation");
assert.deepEqual(doublePolarityContract.polarityObligations.map((row) => row.scope), ["ownership", "opinion"]);
let result = evaluate(doublePolarityQuestion, "i own one");
assert.equal(result.ok, false, "ownership evidence must not satisfy a separate opinion clause");
assert.equal(result.reason, "missing-polarity");
assert.equal(result.coverage.filter((row) => row.kind === "polarity" && row.satisfied).length, 1);
assert.equal(evaluate(doublePolarityQuestion, "i own one, yeah i like it").ok, true);
assert.equal(evaluate(doublePolarityQuestion, "yes, no").ok, true, "two standalone answers may satisfy two yes/no clauses in order");

const ownershipPriceQuestion = "do you own one and how much did it cost?";
const ownershipPriceMeaning = "say whether he owns one and how much it cost";
for (const surface of ["definitely cost 600 bucks", "sure cost me 600 bucks"]) {
  result = evaluate(ownershipPriceQuestion, surface, ownershipPriceMeaning);
  assert.equal(result.ok, false, `${surface} must not donate an affirmative price modifier to ownership`);
  assert.equal(result.reason, "missing-polarity");
}
assert.equal(evaluate(ownershipPriceQuestion, "I do, and it cost 600 bucks", ownershipPriceMeaning).ok, true,
  "standalone auxiliary answer must survive clause splitting");
assert.equal(evaluate(ownershipPriceQuestion, "nah, around 600 bucks", ownershipPriceMeaning).ok, true);
assert.equal(evaluate(ownershipPriceQuestion, "yeah 600 bucks", ownershipPriceMeaning).ok, true,
  "compact explicit yes/no plus amount remains valid");

const countPriceQuestion = "how many systems do you have and how much did they cost?";
const countPriceMeaning = "say how many systems he has and how much they cost";
for (const surface of ["I have 600 bucks into them", "I have 60.0 bucks into them"]) {
  result = evaluate(countPriceQuestion, surface, countPriceMeaning);
  assert.equal(result.ok, false, `${surface} must not reuse currency as the system count`);
  assert.equal(result.reason, "missing-quantity");
}
assert.equal(evaluate(countPriceQuestion, "I have 2 and they cost 600 bucks", countPriceMeaning).ok, true);

const crossClauseHowMuch = "how much do you play it, and do you think it costs too much?";
result = evaluate(crossClauseHowMuch, "every day, yeah");
assert.equal(result.ok, true, "non-monetary how-much clause must not borrow cost wording from a later yes/no clause");
assert.deepEqual(result.contract.requirements, ["polarity"]);
assert.equal(result.contract.polarityObligations.length, 1);
assert.equal(result.contract.polarityObligations[0].scope, "opinion");

const reverseMultipart = "how much did it cost, and do you own one?";
result = evaluate(reverseMultipart, "600 bucks");
assert.equal(result.ok, false);
assert.equal(result.reason, "missing-polarity");
assert.equal(evaluate(reverseMultipart, "600 bucks, yep").ok, true);

const genericDouble = "is it red and is it big?";
const genericContract = buildPrimaryHumanVoiceContract({ plan: directPlan(), human: human(genericDouble) });
assert.deepEqual(genericContract.polarityObligations.map((row) => row.scope), ["generic", "generic"]);
assert.equal(evaluate(genericDouble, "yes it is red, no it is not big").ok, true,
  "generic yes/no clauses must match their own clause context");
assert.equal(evaluate(genericDouble, "yes it is red").ok, false,
  "one generic clause answer must not satisfy two generic yes/no obligations");

const playedAndLiked = "have you played it and do you like it?";
const playedContract = buildPrimaryHumanVoiceContract({ plan: directPlan(), human: human(playedAndLiked) });
assert.deepEqual(playedContract.polarityObligations.map((row) => row.scope), ["generic", "opinion"],
  "auxiliary 'have' in a perfect-tense question must not be mistaken for ownership");
assert.equal(evaluate(playedAndLiked, "yeah played it, love it").ok, true);
assert.equal(evaluate(playedAndLiked, "played it, love it").ok, false,
  "the first yes/no clause still needs an explicit answer rather than topical overlap alone");

assert.equal(evaluate("how much do you like the Neo Geo?", "i love it", "say how much he likes the Neo Geo").ok, true);
assert.equal(evaluate("how much do you play it?", "every day", "say how much he plays it").ok, true);
assert.equal(evaluate("what is a neo geo worth?", "around 600 bucks", "answer what it is worth").ok, true);

console.log("v41 Phase 2A clause-level semantic regression checks passed");
