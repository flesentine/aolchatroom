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

// Finding 160: hyphenated relation compounds after comma apposition are still
// predicates of the generic/anaphoric subject, not a period-name reset.
for (const question of [
  "I've never heard of PS5 and is this console, Neo Geo backwards-compatible?",
  "I've never heard of PS5 and is this console, Neo Geo backward-compatible?",
  "I've never heard of PS5 and is this console, Neo Geo fully-backwards-compatible?",
  "I've never heard of PS5 and is this console, Neo Geo retro-styled?"
]) {
  const meaning = "say whether this console has that relation";
  const primary = evaluate(question, "yeah it does", meaning);
  assert.equal(primary.ok, false, `hyphenated relation target must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Adjacent family: relation nouns are likewise targets, not naming syntax.
for (const question of [
  "I've never heard of PS5 and does this console, Neo Geo compatibility matter?",
  "I've never heard of PS5 and does this console, Neo Geo styling look good?"
]) {
  const meaning = "say whether this console has that relation";
  const primary = evaluate(question, "yeah it does", meaning);
  assert.equal(primary.ok, false, `relation noun target must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 161: plural copulas must permit genuine period-product aliases.
for (const question of [
  "I've never heard of PS5; these consoles are commonly called Neo Geo; are they any good?",
  "I've never heard of PS5; those systems were known as Sega Saturn; were they any good?",
  "I've never heard of PS5; these computers are also known as Neo Geo; are they any good?"
]) {
  const meaning = "say whether the named period consoles are any good";
  const primary = evaluate(question, "yeah they are good", meaning);
  assert.equal(primary.ok, true, `plural copular alias must reset to the period subject: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Adjacent family: perfect/passive aliases are also explicit naming syntax.
for (const question of [
  "I've never heard of PS5; this console has been called Neo Geo; is it any good?",
  "I've never heard of PS5; these consoles have been commonly called Neo Geo; are they any good?",
  "I've never heard of PS5; that system had formerly been known as Sega Saturn; was it any good?"
]) {
  const meaning = "say whether the named period console is any good";
  const surface = /these consoles/i.test(question) ? "yeah they are good" : "yeah it is good";
  const primary = evaluate(question, surface, meaning);
  assert.equal(primary.ok, true, `perfect/passive alias must reset to the period subject: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Negative alias claims still do not establish a positive named reset.
for (const question of [
  "I've never heard of PS5; these consoles are not called Neo Geo; are they any good?",
  "I've never heard of PS5; this console has not been called Neo Geo; is it any good?"
]) {
  const meaning = "say whether this console is any good";
  const surface = /these consoles/i.test(question) ? "yeah they are good" : "yeah it is good";
  const primary = evaluate(question, surface, meaning);
  assert.equal(primary.ok, false, `negated alias must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 160-161 plus adjacent relation-noun/perfect-alias regressions passed");
