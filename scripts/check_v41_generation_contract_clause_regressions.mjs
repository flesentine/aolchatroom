import assert from "node:assert/strict";
import {
  buildPrimaryHumanVoiceContract,
  evaluatePrimaryHumanVoice
} from "../src/generation_contract_v41_hardened.js";

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
assert.equal(evaluate(doublePolarityQuestion, "yes, i own one").ok, false,
  "a leading standalone answer must stay assigned to the first question instead of being donated to a later clause");
assert.equal(evaluate(doublePolarityQuestion, "i like it, but i don't own one").ok, true,
  "explicit scoped answers may arrive in a different order when each maps unambiguously");

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
for (const surface of ["I have 600 bucks into them", "I have 60.0 bucks into them", "I have 1,000 bucks into them", "It was a $1,000 game console"]) {
  result = evaluate(countPriceQuestion, surface, countPriceMeaning);
  assert.equal(result.ok, false, `${surface} must not reuse a monetary value as the system count`);
  assert.equal(result.reason, "missing-quantity");
}
assert.equal(evaluate(countPriceQuestion, "I have 2 and they cost 600 bucks", countPriceMeaning).ok, true);
assert.equal(evaluate(countPriceQuestion, "I own 1,000 systems, around 600 bucks each", countPriceMeaning).ok, true,
  "possession-shaped grouped count must repair quantity without weakening price separation");

const repeatedQuantityQuestion = "how many systems do you have and how many games do you own?";
const repeatedQuantityMeaning = "give the system count and the game count";
result = evaluate(repeatedQuantityQuestion, "I have 2 systems", repeatedQuantityMeaning);
assert.equal(result.ok, false, "two independent quantity clauses must not collapse into one hard quantity requirement");
assert.equal(result.reason, "missing-quantity");
assert.equal(result.contract.repeatedHardObligations.quantity.length, 2);
assert.equal(evaluate(repeatedQuantityQuestion, "I have 2 systems, 5 games", repeatedQuantityMeaning).ok, true);
assert.equal(evaluate(repeatedQuantityQuestion, "2 and 5", repeatedQuantityMeaning).ok, true,
  "compact ordered counts may satisfy repeated quantity clauses");

const repeatedPriceQuestion = "how much did the Neo Geo cost and how much did the game cost?";
const repeatedPriceMeaning = "give the console price and the game price";
result = evaluate(repeatedPriceQuestion, "600 bucks", repeatedPriceMeaning);
assert.equal(result.ok, false, "two independent price clauses must not collapse into one hard price requirement");
assert.equal(result.reason, "missing-price");
assert.equal(result.contract.repeatedHardObligations.price.length, 2);
assert.equal(evaluate(repeatedPriceQuestion, "600 bucks, 50 bucks", repeatedPriceMeaning).ok, true);

const groupedCountQuestion = "how many systems do you have and do you like them?";
assert.equal(evaluate(groupedCountQuestion, "I have 1,000 systems, and yes I like them").ok, true,
  "an explicit grouped count above 999 must remain valid when a count noun follows it");
assert.equal(evaluate(groupedCountQuestion, "about 1,000 systems, and yes I like them").ok, true,
  "a compact approximate grouped count must remain valid");

const crossClauseHowMuch = "how much do you play it, and do you think it costs too much?";
result = evaluate(crossClauseHowMuch, "every day, yeah");
assert.equal(result.ok, true, "non-monetary how-much clause must not borrow cost wording from a later yes/no clause");
assert.deepEqual(result.contract.requirements, ["polarity"]);
assert.equal(result.contract.polarityObligations.length, 1);
assert.equal(result.contract.polarityObligations[0].scope, "opinion");

const orAlternative = "how much do you play it or do you think it costs too much?";
result = evaluate(orAlternative, "every day; no");
assert.equal(result.ok, true, "cross-type or clauses must not leak monetary context into a non-price how-much clause");
assert.deepEqual(result.contract.requirements, ["polarity"]);

assert.equal(evaluate("is it red or is it blue?", "it's red").ok, true,
  "a genuine either-or choice must not become two mandatory yes/no answers");
assert.equal(evaluate("do you want tea or do you want coffee?", "coffee").ok, true,
  "a genuine preference choice must accept a bare selected alternative");
assert.equal(evaluate("do you want tea or do you want coffee?", "I want coffee please").ok, true,
  "a selection-shaped choice answer remains valid");
assert.equal(evaluate("do you want tea or do you want coffee?", "I spilled coffee yesterday").ok, false,
  "merely mentioning a unique alternative must not repair a missing choice answer");

const reverseMultipart = "how much did it cost, and do you own one?";
result = evaluate(reverseMultipart, "600 bucks");
assert.equal(result.ok, false);
assert.equal(result.reason, "missing-polarity");
assert.equal(evaluate(reverseMultipart, "600 bucks, yep").ok, true);

const perfectTense = "have you played it and have you finished it?";
assert.equal(evaluate(perfectTense, "i haven't played it, and i haven't finished it").ok, true,
  "contracted negative perfect-tense answers must satisfy their own clauses");
assert.equal(evaluate(perfectTense, "i've played it, and i haven't finished it").ok, true,
  "contracted positive and negative perfect-tense answers must both be recognized");

const ownershipThenPerfect = "do you own it and have you played it?";
result = evaluate(ownershipThenPerfect, "I've played it, yeah");
assert.equal(result.ok, false, "perfect auxiliary have must not masquerade as ownership evidence");
assert.equal(result.reason, "missing-polarity");
result = evaluate(ownershipThenPerfect, "I've got to play it, yeah");
assert.equal(result.ok, false, "non-possessive got-to must not masquerade as ownership evidence");
assert.equal(result.reason, "missing-polarity");
result = evaluate(ownershipThenPerfect, "I have one question, I've played it");
assert.equal(result.ok, false, "non-possession have-one phrases must not masquerade as ownership evidence");
assert.equal(result.reason, "missing-polarity");
assert.equal(evaluate(ownershipThenPerfect, "I own it, and I've played it").ok, true);
assert.equal(evaluate(ownershipThenPerfect, "I've got one, and I've played it").ok, true,
  "possession-shaped have-got remains valid ownership evidence");

const reverseStandalone = "did you finish it and did you start it?";
assert.equal(evaluate(reverseStandalone, "I did start it, but no").ok, true,
  "a contrastive trailing standalone answer may cover the only earlier unsatisfied clause");
assert.equal(evaluate(reverseStandalone, "I did start it, no").ok, false,
  "a comma trailing standalone must not silently backfill an earlier clause");

const existential = "are there any games and do you like them?";
assert.equal(evaluate(existential, "there are, yes i like them").ok, true,
  "ordinary existential auxiliary answers must satisfy generic polarity obligations");
assert.equal(evaluate(existential, "there's one, yes i like them").ok, true,
  "contracted existential answers must satisfy generic polarity obligations");
const negativeExistential = "is there a cover charge and do you like the venue?";
assert.equal(evaluate(negativeExistential, "there's not one, but yes i like it").ok, true,
  "negative contracted existential answers must normalize as negative polarity evidence");
assert.equal(evaluate(negativeExistential, "there's no cover charge, but yes i like it").ok, true,
  "there's-no existential answers must also remain negative evidence");

const genericDouble = "is it red and is it big?";
assert.equal(evaluate(genericDouble, "yes it's red, no it's not big").ok, true);
assert.equal(evaluate(genericDouble, "yes it's red").ok, false,
  "generic clause evidence must not cover two separate yes/no obligations");

const perfectThenOpinion = "have you played it and do you like it?";
assert.equal(evaluate(perfectThenOpinion, "i have played it, yeah i like it").ok, true,
  "perfect-tense have must remain generic rather than being mistaken for ownership");

assert.equal(evaluate("how much do you like the Neo Geo?", "i love it", "say how much he likes the Neo Geo").ok, true);
assert.equal(evaluate("how much do you play it?", "every day", "say how much he plays it").ok, true);
assert.equal(evaluate("what is a neo geo worth?", "around 600 bucks", "answer what it is worth").ok, true);

console.log("v41 Phase 2A hardened clause-order and normalization regression checks passed");
