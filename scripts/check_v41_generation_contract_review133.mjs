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

// Finding 130: inspect the full modified demonstrative phrase. Unknown modifiers
// cannot hide a later generic head, while a named 1996 subject still resets.
for (const question of [
  "I've never heard of PS5 and is this sleek console any good?",
  "I've never heard of PS5 and is this pricey system any good?",
  "I've never heard of PS5 and is this chrome-plated console any good?"
]) {
  const meaning = "say whether this is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `modified generic demonstrative must remain future-anaphoric: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
for (const question of [
  "I've never heard of PS5; is this sleek Neo Geo any good?",
  "I've never heard of PS5; is this pricey Neo Geo worth buying?"
]) {
  const meaning = "say whether the Neo Geo is any good";
  const primary = evaluate(question, "yeah the Neo Geo is good", meaning);
  assert.equal(primary.ok, true, `modified named Neo Geo must reset future carry: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 131: local self-comparison only exempts that exact comparison
// occurrence; a separate bare comparison pronoun still carries the PS5.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better than it and cheaper than it used to be",
  "I've never heard of PS5 but I think the Neo Geo is cheaper than it used to be and better than it"
]) {
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, `cross-object comparison must survive local-self comparison: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo is cheaper than it used to be";
  const meaning = "say whether the Neo Geo is cheaper than it used to be";
  const primary = evaluate(question, "yeah the Neo Geo is cheaper", meaning);
  assert.equal(primary.ok, true, "pure local self-comparison must remain period-valid");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 132: common reporting/cognitive verbs and light modal/adverb prefixes
// carry an unresolved pronoun back to the future antecedent.
for (const question of [
  "is the PS5 black but I reckon it is expensive?",
  "is the PS5 black but I understand it is expensive?",
  "is the PS5 black but I realize it is expensive?",
  "is the PS5 black but I imagine it is expensive?",
  "is the PS5 black but I can imagine it is expensive?",
  "is the PS5 black but you probably understand it is expensive?"
]) {
  const meaning = "say whether it is expensive";
  const primary = evaluate(question, "yeah it is expensive", meaning);
  assert.equal(primary.ok, false, `reporting verb must preserve future anaphor: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I imagine the Neo Geo is expensive and it is hard to find";
  const meaning = "say whether the Neo Geo is hard to find";
  const primary = evaluate(question, "yeah the Neo Geo is hard to find", meaning);
  assert.equal(primary.ok, true, "expanded reporting verb must still allow explicit Neo Geo reset");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 133: longer ordinary explicit subjects inside reporting clauses reset
// local pronouns through the governing verb, but a bare cross-object comparison
// remains tied to the PS5.
{
  const question = "I've never heard of PS5 but I think the Neo Geo home video game console is better than it used to be";
  const meaning = "say whether the Neo Geo home video game console improved";
  const primary = evaluate(question, "yeah the Neo Geo home video game console improved", meaning);
  assert.equal(primary.ok, true, "long explicit Neo Geo subject must reset local self-comparison");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo home video game console is better than it";
  const meaning = "say whether the Neo Geo home video game console is better than it";
  const primary = evaluate(question, "yeah the Neo Geo home video game console is better", meaning);
  assert.equal(primary.ok, false, "long explicit subject must not erase a bare PS5 comparison pronoun");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 130-133 demonstrative/comparison/reporting/long-subject regressions passed");
