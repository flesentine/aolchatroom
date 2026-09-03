import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";
import {
  periodSafeHumanFallbackLines,
  scopedFallbackEraViolation
} from "../src/era_fallback_v41.js";

const eraDateKey = "1996-09-03";

function plan(meaning) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review108",
    goal: meaning,
    moves: [{
      speaker: "MetallicaFan",
      target: "Crateman",
      intent: "answer",
      topic: "general",
      meaning
    }]
  };
}

function evaluate(question, surface, meaning, { era = eraDateKey } = {}) {
  return evaluatePrimaryHumanVoice({
    plan: plan(meaning),
    human: {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: question
    },
    lines: [{
      speaker: "MetallicaFan",
      target: "Crateman",
      text: surface,
      source: "gemini"
    }],
    eraDateKey: era
  });
}

function builtIn(text) {
  return [{
    speaker: "MetallicaFan",
    target: "Crateman",
    text,
    source: "built-in",
    intent: "reply",
    topic: "gaming"
  }];
}

// Finding 106: ordinary discourse markers do not break a future referent.
for (const prefix of ["honestly", "well", "anyway", "frankly", "actually"]) {
  const question = `do you own a PS5 and ${prefix}, was it any good?`;
  const primary = evaluate(question, "no, but yeah it was good", "say whether it was any good");
  assert.equal(primary.ok, false, `discourse-prefixed PS5 anaphor must remain sealed: ${prefix}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");

  const fallbackViolation = scopedFallbackEraViolation(question, eraDateKey, "say whether it was any good");
  assert.notEqual(fallbackViolation, "", `fallback must carry future referent across discourse prefix: ${prefix}`);
  const fallback = periodSafeHumanFallbackLines(
    builtIn("yeah it was great"),
    { from: "Crateman", target: "MetallicaFan", text: question },
    eraDateKey,
    "say whether it was any good"
  );
  assert.equal(fallback[0].text, "what? never heard of that");
  assert.equal(fallback[0]._v41EraSafeFallback, true);
}

// Finding 107: this/that can introduce a new explicit noun phrase. That new
// period-valid subject resets the prior future reference in both paths.
for (const demonstrative of ["this", "that"]) {
  const question = `I've never heard of PS5; was ${demonstrative} Neo Geo any good?`;
  const primary = evaluate(
    question,
    `yeah, ${demonstrative} Neo Geo was good`,
    `say whether ${demonstrative} Neo Geo was any good`
  );
  assert.equal(primary.ok, true, `explicit ${demonstrative} Neo Geo subject must reset future carry; reason=${primary.reason}; evidence=${JSON.stringify(primary.evidence || {})}`);
  assert.notEqual(primary.reason, "era-boundary-confident-answer");
  assert.equal(
    scopedFallbackEraViolation(question, eraDateKey, `say whether ${demonstrative} Neo Geo was any good`),
    "",
    `fallback must treat ${demonstrative} Neo Geo as a new period-valid subject`
  );
}

// But a standalone demonstrative without a following noun remains an anaphor.
for (const demonstrative of ["this", "that"]) {
  const question = `do you own a PS5 and was ${demonstrative} any good?`;
  const primary = evaluate(question, "yeah it was good", `say whether ${demonstrative} was any good`);
  assert.equal(primary.ok, false, `standalone ${demonstrative} must still refer to the PS5`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(
    scopedFallbackEraViolation(question, eraDateKey, `say whether ${demonstrative} was any good`),
    ""
  );
}

// Finding 108: preserve a safe hardware head across the stacked modifiers from
// the review finding, without promoting an equally modified peripheral to hardware.
for (const surface of [
  "A home video game console very well designed exclusively for the PlayStation 5 costs $499",
  "A home video game console carefully hand built specifically for the PlayStation 5 costs $499"
]) {
  const result = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price", { era: "" });
  assert.equal(result.ok, true, `stacked modifiers must preserve safe hardware head: ${surface}`);
}
for (const surface of [
  "A wireless gaming headset very well designed exclusively for the PlayStation 5 costs $70",
  "A wireless gaming headset carefully hand built specifically for the PlayStation 5 costs $70"
]) {
  const result = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price", { era: "" });
  assert.equal(result.ok, false, `stacked modifiers must not make a peripheral safe: ${surface}`);
  assert.equal(result.reason, "missing-price");
}

console.log("v41 findings 106-108 discourse/coreference/compound-modifier regressions passed");
