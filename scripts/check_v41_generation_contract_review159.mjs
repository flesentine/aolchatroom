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

// Finding 158: bare comma apposition remains a relation target when ordinary
// modifiers sit between the named product and compatibility/style predicate.
for (const question of [
  "I've never heard of PS5 and is this console, Neo Geo backwards compatible?",
  "I've never heard of PS5 and is this console, Neo Geo fully backwards compatible?",
  "I've never heard of PS5 and is this console, Neo Geo retro style?"
]) {
  const meaning = "say whether this console has that relation";
  const primary = evaluate(question, "yeah it does", meaning);
  assert.equal(primary.ok, false, `modified relation target must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 159: ordinary copular alias syntax after a generic head establishes
// a real period-correct named subject for following pronouns.
for (const question of [
  "I've never heard of PS5; this console is also known as Neo Geo; is it any good?",
  "I've never heard of PS5; this console is commonly called Sega Saturn; is it any good?",
  "I've never heard of PS5; this console was better known as the Neo Geo; is it any good?"
]) {
  const meaning = "say whether the named period console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, true, `copular alias must reset to the period subject: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Negated or unsupported qualification must not masquerade as a positive alias.
for (const question of [
  "I've never heard of PS5; this console is not known as Neo Geo; is it any good?",
  "I've never heard of PS5; this console is mistakenly known as Neo Geo; is it any good?"
]) {
  const meaning = "say whether this console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `non-alias qualification must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 158-159 modified-relation/copular-alias regressions passed");
