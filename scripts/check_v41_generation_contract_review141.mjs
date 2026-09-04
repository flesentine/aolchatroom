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

// Finding 138: compared-against is the same cross-object comparison family as
// compared-with/to and must retain the future antecedent.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better compared against it",
  "I've never heard of PS5 but I think the Neo Geo is better in comparison against it"
]) {
  const meaning = "say whether the Neo Geo is better compared against it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, `compared-against pronoun must retain PS5: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 139: a named period subject followed by its generic type remains an
// explicit reset; generic-only phrases remain anaphoric.
for (const question of [
  "I've never heard of PS5; is this unbelievably sleek Neo Geo console any good?",
  "I've never heard of PS5; is this old Sega Saturn console any good?",
  "I've never heard of PS5; is this saturn console any good?"
]) {
  const meaning = "say whether the period console is any good";
  const primary = evaluate(question, "yeah that console is good", meaning);
  assert.equal(primary.ok, true, `named subject plus generic type must reset PS5: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
for (const question of [
  "do you own a PS5 and is this unbelievably sleek console any good?",
  "do you own a PS5 and is this chrome-plated console any good?"
]) {
  const meaning = "say whether this console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `generic demonstrative must remain PS5-anaphoric: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 140: bounded ordinary modifiers may occur between the comparison
// pronoun and its local-self auxiliary phrase.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better than it probably was before",
  "I've never heard of PS5 but I think the Neo Geo is better than it really used to be",
  "I've never heard of PS5 but I think the Neo Geo is cheaper than it still is in stores"
]) {
  const meaning = "say whether the Neo Geo changed";
  const primary = evaluate(question, "yeah the Neo Geo changed", meaning);
  assert.equal(primary.ok, true, `modified local self-comparison must stay on Neo Geo: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo is better than it";
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "bare comparison pronoun must still retain PS5");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 141: ordinary degree/adverb chains may sit between a modal and its
// governing predicate without losing the explicit named-subject reset.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo home video game console will quite possibly be better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console will very probably be better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console can almost certainly be cheaper than it was before",
  "I've never heard of PS5 but I think the Neo Geo home video game console should rather obviously still be easier to find than it used to be"
]) {
  const meaning = "say whether the Neo Geo home video game console improved";
  const primary = evaluate(question, "yeah the Neo Geo improved", meaning);
  assert.equal(primary.ok, true, `degree-modified modal must preserve Neo Geo reset: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo home video game console will quite possibly be better than it";
  const meaning = "say whether the Neo Geo home video game console is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "degree-modified modal must not erase bare PS5 comparison");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 138-141 comparison/demonstrative/self-comparison/modal-modifier regressions passed");
