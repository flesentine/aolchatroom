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

// Finding 145: recognized product names used adjectivally must not manufacture
// a new named subject before a later generic head.
for (const question of [
  "I've never heard of PS5 and is this Neo Geo-style console any good?",
  "I've never heard of PS5 and is this Saturn-compatible console any good?",
  "I've never heard of PS5 and is this Genesis-inspired system any good?"
]) {
  const meaning = "say whether this generic console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `named-style modifier must remain anaphoric: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 146: plural generic heads are still generic/anaphoric.
for (const question of [
  "I've never heard of PS5 consoles and are these shiny consoles any good?",
  "I've never heard of PS5 models and are those fancy models any good?",
  "I've never heard of PS5 systems and are these old systems any good?"
]) {
  const meaning = "say whether these are any good";
  const primary = evaluate(question, "yeah they are good", meaning);
  assert.equal(primary.ok, false, `plural generic demonstrative must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 147: a generic head may be followed immediately by explicit naming
// syntax/apposition that genuinely establishes a period subject.
for (const question of [
  "I've never heard of PS5; is this console called Neo Geo any good?",
  "I've never heard of PS5; is this console named Sega Saturn any good?",
  "I've never heard of PS5; is this console known as the Neo Geo any good?",
  "I've never heard of PS5; is this console, Neo Geo, any good?"
]) {
  const meaning = "say whether the named period console is any good";
  const primary = evaluate(question, "yeah that console is good", meaning);
  assert.equal(primary.ok, true, `explicit name after generic head must reset future carry: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Naming-like syntax with an unrecognized/future-ish placeholder must not
// become an automatic reset merely because a naming verb is present.
for (const question of [
  "I've never heard of PS5 and is this console called shiny any good?",
  "I've never heard of PS5 and is this model named fancy any good?"
]) {
  const meaning = "say whether this generic item is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `unrecognized name after generic head must remain fail-closed: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 145-147 named-style/plural/appositional demonstrative regressions passed");
