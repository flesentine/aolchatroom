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

// Finding 123: an explicit new subject inside an opinion/reporting clause resets
// the prior future referent for later local pronouns.
for (const [question, surface, meaning] of [
  [
    "I've never heard of PS5 but I think the Neo Geo is great and it looks cool",
    "yeah the Neo Geo looks cool",
    "say whether the Neo Geo looks cool"
  ],
  [
    "I've never heard of PS5 but you said the Neo Geo was expensive and it was hard to find",
    "yeah the Neo Geo was hard to find",
    "say whether the Neo Geo was hard to find"
  ]
]) {
  const primary = evaluate(question, surface, meaning);
  assert.equal(primary.ok, true, `explicit embedded 1996 subject must reset prior PS5 referent: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Without a new explicit subject, the embedded pronoun still carries PS5.
{
  const question = "is the PS5 black but I think it is expensive?";
  const meaning = "say whether it is expensive";
  const primary = evaluate(question, "yeah it is expensive", meaning);
  assert.equal(primary.ok, false);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// A new explicit Neo Geo subject does not erase a separate comparison pronoun
// that still points back to the PS5.
{
  const question = "I've never heard of PS5 but I think the Neo Geo is better than it";
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "comparison pronoun must keep the future antecedent");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 finding 123 embedded explicit-subject reset regressions passed");
