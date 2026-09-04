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

// Finding 152: a recognized period product immediately following a generic
// head can be a compatibility/style target, not the subject's name.
for (const question of [
  "I've never heard of PS5 and is this console Neo Geo compatible?",
  "I've never heard of PS5 and is this system Saturn compatible?",
  "I've never heard of PS5 and is this console, Neo Geo compatible?"
]) {
  const meaning = "say whether this console is compatible";
  const primary = evaluate(question, "yeah it is compatible", meaning);
  assert.equal(primary.ok, false, `compatibility target must not become a named reset: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Explicit naming/apposition remains valid.
for (const question of [
  "I've never heard of PS5; is this console called Neo Geo any good?",
  "I've never heard of PS5; is this console named Sega Saturn any good?",
  "I've never heard of PS5; is this console, Neo Geo, any good?"
]) {
  const meaning = "say whether the named period console is any good";
  const primary = evaluate(question, "yeah that console is good", meaning);
  assert.equal(primary.ok, true, `real naming syntax must still reset: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 153: -ies plurals map back to generic singular heads.
{
  const question = "I've never heard of PS5 accessories and are these shiny accessories any good?";
  const meaning = "say whether these accessories are any good";
  const primary = evaluate(question, "yeah they are good", meaning);
  assert.equal(primary.ok, false, "accessories must remain generic/future-linked");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 154: by-contrast constructions are ordinary cross-object comparisons.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better by contrast with it",
  "I've never heard of PS5 but I think the Neo Geo is better by contrast to it",
  "I've never heard of PS5 but I think the Neo Geo is better by contrast against it"
]) {
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, `by-contrast pronoun must retain PS5: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 152-154 compatibility/plural/contrast regressions passed");
