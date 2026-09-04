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

function assertFutureLinked(question, meaning = "say whether this console has that relation") {
  const primary = evaluate(question, "yeah it does", meaning);
  assert.equal(primary.ok, false, `nominal relation must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 162: natural nominal forms of the already-covered relation family
// remain properties/relations of the generic console, not a period-name reset.
for (const noun of [
  "styling",
  "compatibility",
  "theme",
  "theming",
  "inspiration",
  "basis",
  "shape",
  "shaping",
  "design",
  "designing",
  "likeness"
]) {
  assertFutureLinked(`I've never heard of PS5 and does this console, Neo Geo ${noun} look good?`);
}

// The same relation-noun grammar must work without comma apposition and with
// bounded ordinary modifiers before the nominal relation.
for (const question of [
  "I've never heard of PS5 and does this console Neo Geo theming look good?",
  "I've never heard of PS5 and does this console, Neo Geo retro theming look good?",
  "I've never heard of PS5 and does this console, Neo Geo overall design look good?",
  "I've never heard of PS5 and does this console, Neo Geo close likeness matter?",
  "I've never heard of PS5 and does this console, Neo Geo industrial design matter?"
]) {
  assertFutureLinked(question);
}

// Adjectival/participial siblings stay covered by the same shared relation tail.
for (const question of [
  "I've never heard of PS5 and is this console, Neo Geo themed?",
  "I've never heard of PS5 and is this console, Neo Geo shaped?",
  "I've never heard of PS5 and is this console, Neo Geo designed?",
  "I've never heard of PS5 and is this console, Neo Geo inspired?",
  "I've never heard of PS5 and is this console, Neo Geo compatible?"
]) {
  assertFutureLinked(question);
}

// Real appositional/naming syntax must remain a safe reset.
for (const question of [
  "I've never heard of PS5; is this console, Neo Geo, any good?",
  "I've never heard of PS5; is this console called Neo Geo any good?",
  "I've never heard of PS5; is this console named Sega Saturn any good?",
  "I've never heard of PS5; is this Neo Geo home video game console any good?"
]) {
  const meaning = "say whether the named period console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, true, `real named period subject must remain valid: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Deliberately do not turn arbitrary post-name nouns into relation vocabulary.
for (const question of [
  "I've never heard of PS5; is this console, Neo Geo cartridge, any good?",
  "I've never heard of PS5; is this console, Neo Geo controller, any good?",
  "I've never heard of PS5; is this console, Neo Geo arcade, any good?"
]) {
  const meaning = "say whether the named period product is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, true, `unlisted noun must not be overclassified as a relation: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 finding 162 nominal-relation family and boundary regressions passed");
