import assert from "node:assert/strict";
import { periodSafeHumanFallbackLines, scopedFallbackEraViolation } from "../src/era_fallback_v41.js";

const dateKey = "1996-09-03";

function builtIn(text, extra = {}) {
  return {
    speaker: "MetallicaFan",
    target: "Crateman",
    text,
    source: "built-in",
    intent: "reply",
    topic: "gaming",
    ...extra
  };
}

for (const humanText of [
  "how much did the PS5 cost?",
  "do you own a PlayStation 5?",
  "have you used an iPhone?",
  "do you watch YouTube?"
]) {
  const human = { from: "Crateman", target: "MetallicaFan", text: humanText };
  for (const unsafeFallback of [
    "yeah maybe",
    "probably",
    "psx rules lol",
    "resident evil is awesome",
    "$499",
    "what is a PS5?"
  ]) {
    const input = [builtIn(unsafeFallback, { marker: "keep-me" })];
    const result = periodSafeHumanFallbackLines(input, human, dateKey);
    assert.equal(result.length, 1);
    assert.equal(result[0].speaker, "MetallicaFan", "era fallback must preserve responder selection");
    assert.equal(result[0].target, "Crateman", "era fallback must preserve target routing");
    assert.equal(result[0].source, "built-in", "era fallback must remain provider-independent built-in output");
    assert.equal(result[0].intent, "reply", "era fallback must preserve response intent");
    assert.equal(result[0].marker, "keep-me", "era fallback must preserve unrelated metadata");
    assert.equal(result[0].text, "what? never heard of that", `${unsafeFallback} must not imply knowledge of ${humanText}`);
    assert.equal(result[0].topic, "general");
    assert.equal(result[0]._v41EraSafeFallback, true);
  }
}

const periodHuman = { from: "Crateman", target: "MetallicaFan", text: "what do you think of the Neo Geo?" };
const periodLine = builtIn("neo geo is way too expensive");
const periodResult = periodSafeHumanFallbackLines([periodLine], periodHuman, dateKey);
assert.equal(periodResult[0], periodLine, "period-valid human premises must leave the inherited fallback untouched");

const futureHuman = { from: "Crateman", target: "MetallicaFan", text: "how much did the PS5 cost?" };
const providerLine = {
  speaker: "MetallicaFan",
  target: "Crateman",
  text: "what? never heard of that",
  source: "gemini",
  intent: "answer",
  topic: "general"
};
const providerResult = periodSafeHumanFallbackLines([providerLine], futureHuman, dateKey);
assert.equal(providerResult[0], providerLine, "the fallback guard must not rewrite provider Voice; Phase 2A owns provider semantics");

// Finding 101: mixed human turns are scoped to the obligation that actually
// triggered the fallback. An incidental future disclaimer must not erase a
// period-valid Neo Geo fallback, but the same human turn remains sealed when
// the selected semantic scope is the PS5 clause.
const mixedHuman = {
  from: "Crateman",
  target: "MetallicaFan",
  text: "I've never heard of PS5; how much did the Neo Geo cost?"
};
const mixedPeriodLine = builtIn("neo geo is way too expensive", { marker: "mixed" });
let mixedResult = periodSafeHumanFallbackLines(
  [mixedPeriodLine],
  mixedHuman,
  dateKey,
  "answer the Neo Geo price"
);
assert.equal(mixedResult[0], mixedPeriodLine, "future disclaimer must not poison a separate period-valid fallback scope");
assert.equal(scopedFallbackEraViolation(mixedHuman.text, dateKey, "answer the Neo Geo price"), "");

mixedResult = periodSafeHumanFallbackLines(
  [builtIn("yeah maybe")],
  mixedHuman,
  dateKey,
  "answer the PS5 price"
);
assert.equal(mixedResult[0].text, "what? never heard of that", "future-selected fallback scope must remain sealed");
assert.equal(mixedResult[0]._v41EraSafeFallback, true);

// If the fallback path has no trustworthy semantic scope, fail safely rather
// than assuming the valid clause is the one being answered.
mixedResult = periodSafeHumanFallbackLines([builtIn("yeah maybe")], mixedHuman, dateKey);
assert.equal(mixedResult[0].text, "what? never heard of that");

assert.deepEqual(periodSafeHumanFallbackLines([], futureHuman, dateKey), []);
assert.deepEqual(periodSafeHumanFallbackLines(null, futureHuman, dateKey), []);

console.log("v41 findings 95/101 period-safe deterministic/v37 fallback regressions passed");
