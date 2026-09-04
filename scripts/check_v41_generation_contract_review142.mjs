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

// Finding 142: capitalization alone is not evidence that an unknown modifier
// is a named period product. Generic heads must remain attached to the prior
// future referent regardless of arbitrary user capitalization.
for (const question of [
  "I've never heard of PS5 and is this Chrome-plated console any good?",
  "I've never heard of PS5 and is this Fancy system any good?",
  "I've never heard of PS5 and is this Custom-Built machine any good?"
]) {
  const meaning = "say whether this is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `capitalized modifier must not manufacture a named reset: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Recognized period names still override a later generic type head even when
// normal capitalization is present.
for (const question of [
  "I've never heard of PS5; is this Neo Geo console any good?",
  "I've never heard of PS5; is this Sega Saturn console any good?"
]) {
  const meaning = "say whether the period console is any good";
  const primary = evaluate(question, "yeah that console is good", meaning);
  assert.equal(primary.ok, true, `recognized named period subject must still reset: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 finding 142 capitalization-is-not-name regression passed");
