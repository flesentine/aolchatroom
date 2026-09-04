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

// Finding 134: stacked unlisted adverb/modifier chains must still be scanned
// through to a later generic head rather than being mistaken for a named reset.
for (const question of [
  "I've never heard of PS5 and is this unbelievably remarkably sleek console any good?",
  "I've never heard of PS5 and is this surprisingly extremely pricey system any good?"
]) {
  const meaning = "say whether this is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `stacked modified generic demonstrative must remain future-anaphoric: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
for (const question of [
  "I've never heard of PS5; is this unbelievably remarkably sleek Neo Geo any good?",
  "I've never heard of PS5; was that expensive Neo Geo worth it?"
]) {
  const meaning = "say whether the Neo Geo is any good";
  const primary = evaluate(question, "yeah the Neo Geo is good", meaning);
  assert.equal(primary.ok, true, `stacked modified named Neo Geo must reset PS5: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 135: comparison wording includes compared-with/to and in-comparison
// forms, while local self-comparison remains period-valid.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better compared with it",
  "I've never heard of PS5 but I think the Neo Geo is better compared to it",
  "I've never heard of PS5 but I think the Neo Geo is better in comparison with it"
]) {
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, `cross-object compared-with/to pronoun must retain PS5: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo is better than it used to be";
  const meaning = "say whether the Neo Geo improved";
  const primary = evaluate(question, "yeah the Neo Geo improved", meaning);
  assert.equal(primary.ok, true, "local self-comparison must remain period-valid");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 136: long explicit named subjects followed by modal predicates reset
// local pronouns through the governing modal.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo home video game console will be better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console can be cheaper than it was before",
  "I've never heard of PS5 but I think the Neo Geo home video game console should be easier to find than it used to be"
]) {
  const meaning = "say whether the Neo Geo home video game console improved";
  const primary = evaluate(question, "yeah the Neo Geo improved", meaning);
  assert.equal(primary.ok, true, `modal-governed long Neo Geo subject must reset PS5: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo home video game console will be better than it";
  const meaning = "say whether the Neo Geo home video game console is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "modal-governed subject must not erase a bare PS5 comparison pronoun");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 137: bounded negation/adverb modifiers may appear between a modal
// and the governing predicate without losing the explicit 1996 subject reset.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo home video game console will probably be better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console will not be better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console can still be cheaper than it was before",
  "I've never heard of PS5 but I think the Neo Geo home video game console should really still be easier to find than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console will clearly probably still be better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo home video game console will perhaps be better than it used to be"
]) {
  const meaning = "say whether the Neo Geo home video game console improved";
  const primary = evaluate(question, "yeah the Neo Geo improved", meaning);
  assert.equal(primary.ok, true, `modal modifier must preserve local Neo Geo reset: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo home video game console will probably be better than it";
  const meaning = "say whether the Neo Geo home video game console is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "modal modifier must not erase a bare PS5 comparison pronoun");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 134-137 stacked-modifier/comparison/modal-subject regressions passed");
