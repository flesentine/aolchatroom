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
  assert.equal(primary.ok, false, `Unicode-dash relation must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

const dashCases = [
  ["hyphen", "‐"],
  ["non-breaking hyphen", "‑"],
  ["figure dash", "‒"],
  ["en dash", "–"],
  ["em dash", "—"],
  ["minus", "−"]
];

// Finding 163: Unicode dash variants in a post-name relation target must be
// equivalent to ASCII hyphen and must not create a period-name reset.
for (const [label, dash] of dashCases) {
  assertFutureLinked(`I've never heard of PS5 and is this console, Neo Geo${dash}style any good?`);
  assertFutureLinked(`I've never heard of PS5 and is this console, Neo Geo${dash}compatible?`);
  assertFutureLinked(`I've never heard of PS5 and does this console, Neo Geo${dash}design matter?`);
}

// The same normalization must apply when the period name + relation compound
// appears before the generic head ("this Neo Geo-style console").
for (const [label, dash] of dashCases) {
  const question = `I've never heard of PS5 and is this Neo Geo${dash}style console any good?`;
  const meaning = "say whether this generic console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, `${label} modifier must remain anaphoric: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// ASCII behavior stays frozen as the baseline.
for (const question of [
  "I've never heard of PS5 and is this console, Neo Geo-style any good?",
  "I've never heard of PS5 and is this Neo Geo-style console any good?",
  "I've never heard of PS5 and is this console, Neo Geo-compatible?"
]) {
  assertFutureLinked(question);
}

// Unambiguous naming/apposition remains a valid period-name reset.
for (const question of [
  "I've never heard of PS5; is this console, Neo Geo, any good?",
  "I've never heard of PS5; is this console called Neo Geo any good?"
]) {
  const meaning = "say whether the named period console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, true, `real period-name apposition must remain valid: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Spaced editorial dashes are not silently collapsed into relation compounds
// or promoted to naming syntax. Ambiguous scope remains fail-closed.
{
  const question = "I've never heard of PS5; is this console — Neo Geo — any good?";
  const meaning = "say whether this console is any good";
  const primary = evaluate(question, "yeah it is good", meaning);
  assert.equal(primary.ok, false, "spaced editorial-dash apposition must remain fail-closed");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 finding 163 Unicode-dash Neo Geo relation regressions passed");
