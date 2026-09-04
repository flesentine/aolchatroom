import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";
import { scopedFallbackEraViolation } from "../src/era_fallback_v41.js";

const eraDateKey = "1996-09-03";

function evaluate(question, surface, meaning) {
  return evaluatePrimaryHumanVoice({
    plan: {
      provider: "gemini",
      reason: "v37-human-director",
      subject: meaning,
      goal: meaning,
      moves: [{
        speaker: "MetallicaFan",
        target: "Crateman",
        intent: "answer",
        topic: "general",
        meaning
      }]
    },
    human: { kind: "human", from: "Crateman", target: "MetallicaFan", text: question },
    lines: [{ speaker: "MetallicaFan", target: "Crateman", text: surface, source: "gemini" }],
    eraDateKey
  });
}

// Finding 143: by-comparison constructions are ordinary cross-object
// comparisons and must preserve the future antecedent.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better by comparison with it",
  "I've never heard of PS5 but I think the Neo Geo is better by comparison to it",
  "I've never heard of PS5 but I think the Neo Geo is better by comparison against it"
]) {
  const meaning = "say whether the Neo Geo is better by comparison";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, `by-comparison pronoun must retain PS5: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 144: most/more likely are common bounded modifier chains in both
// modal predicates and local self-comparisons.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo home video game console will most likely be better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console will more likely be cheaper than it was before"
]) {
  const meaning = "say whether the Neo Geo home video game console improved";
  const primary = evaluate(question, "yeah the Neo Geo improved", meaning);
  assert.equal(primary.ok, true, `most/more likely modal chain must preserve Neo Geo reset: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better than it most likely was before",
  "I've never heard of PS5 but I think the Neo Geo is cheaper than it more likely was before"
]) {
  const meaning = "say whether the Neo Geo changed";
  const primary = evaluate(question, "yeah the Neo Geo changed", meaning);
  assert.equal(primary.ok, true, `most/more likely self-comparison must remain local: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

{
  const question = "I've never heard of PS5 but I think the Neo Geo is better by comparison with it";
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "by-comparison bare pronoun must remain future-linked");
  assert.equal(primary.reason, "era-boundary-confident-answer");
}

console.log("v41 findings 143-144 by-comparison/likely-modifier regressions passed");
