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

// Finding 148: ordinary product/category nouns are generic demonstrative heads,
// not evidence of a new named subject.
for (const question of [
  "I've never heard of PS5 and is this shiny gadget any good?",
  "I've never heard of PS5 and is this fancy platform any good?",
  "I've never heard of PS5 and is this sleek controller any good?",
  "I've never heard of PS5 and is this weird accessory any good?",
  "I've never heard of PS5 and is this tiny handheld any good?"
]) {
  const meaning = "say whether this generic item is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `generic demonstrative head must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 149: relative/contrast/relation comparison constructions preserve
// the future comparison object.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better relative to it",
  "I've never heard of PS5 but I think the Neo Geo is better in contrast to it",
  "I've never heard of PS5 but I think the Neo Geo is better in relation to it",
  "I've never heard of PS5 but I think the Neo Geo is better as opposed to it"
]) {
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, `relative/contrast comparison pronoun must retain PS5: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 150: bounded modifiers can appear inside perfect local-self forms,
// not only before the perfect auxiliary.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better than it has most likely been before",
  "I've never heard of PS5 but I think the Neo Geo is better than it has probably been before",
  "I've never heard of PS5 but I think the Neo Geo is better than it had never really been before"
]) {
  const meaning = "say whether the Neo Geo changed";
  const primary = evaluate(question, "yeah the Neo Geo changed", meaning);
  assert.equal(primary.ok, true, `modified perfect self-comparison must stay on Neo Geo: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo is better than it";
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "bare comparison must remain future-linked after perfect-form broadening");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 151: recognized period names used in unhyphenated relation/adjective
// phrases still modify the later generic head and must not reset the antecedent.
for (const question of [
  "I've never heard of PS5 and is this Neo Geo style console any good?",
  "I've never heard of PS5 and is this Saturn compatible console any good?",
  "I've never heard of PS5 and is this Genesis inspired system any good?",
  "I've never heard of PS5 and is this Neo Geo fully compatible console any good?"
]) {
  const meaning = "say whether this generic console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `named relation modifier must remain anaphoric: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// A real named period subject with intervening type words must remain valid.
{
  const question = "I've never heard of PS5; is this Neo Geo home video game console any good?";
  const meaning = "say whether the Neo Geo home video game console is any good";
  const primary = evaluate(question, "yeah the Neo Geo is good", meaning);
  assert.equal(primary.ok, true, "named Neo Geo long subject must survive relation-modifier hardening");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 148-151 generic/comparison/perfect/named-relation regressions passed");
