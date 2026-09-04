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
    subject: "phase2-review113",
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

function evaluate(question, surface, meaning, era = "") {
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

// Finding 109: model possessives must expose a following peripheral head while
// preserving possessive price/cost nouns as legitimate console-price syntax.
for (const surface of [
  "The PlayStation 5's controller cost $70",
  "The PlayStation 5's headset price was $70",
  "The PlayStation 5's cable was $20"
]) {
  const result = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price");
  assert.equal(result.ok, false, `model possessive peripheral must not satisfy console price: ${surface}`);
  assert.equal(result.reason, "missing-price");
}
for (const surface of [
  "The PlayStation 5's price was $499",
  "The PlayStation 5's cost was $499"
]) {
  const result = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price");
  assert.equal(result.ok, true, `model possessive price noun must remain valid: ${surface}`);
}

// Finding 110: normalize the entire possessive chain from its first owner token
// through the model, not only the last simple possessor.
for (const surface of [
  "A controller for O'Connor's much older brother's PlayStation 5 costs $70",
  "A case for D'Angelo's best friend's old PlayStation 5 costs $20"
]) {
  const result = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price");
  assert.equal(result.ok, false, `modified nested possessive peripheral must remain unsafe: ${surface}`);
  assert.equal(result.reason, "missing-price");
}
for (const surface of [
  "I paid $499 for O'Connor's much older brother's PlayStation 5",
  "D'Angelo's best friend's old PlayStation 5 cost $499"
]) {
  const result = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price");
  assert.equal(result.ok, true, `modified nested possessive console price must remain valid: ${surface}`);
}

// Finding 111: `also`/`plus` split only genuine independent clauses, not wh
// complements such as `is also what I want to know about`.
for (const question of [
  "The PS5 is also what I want to know about",
  "The PS5 is plus what I want to ask about"
]) {
  const result = evaluate(question, "yeah i know about it", "answer what I want to know about", eraDateKey);
  assert.equal(result.ok, false, `wh complement must not be split away from future subject: ${question}`);
  assert.equal(result.reason, "era-boundary-confident-answer");
  assert.notEqual(
    scopedFallbackEraViolation(question, eraDateKey, "answer what I want to know about"),
    "",
    `fallback must not exempt wh complement: ${question}`
  );
}
for (const question of [
  "I've never heard of PS5 plus how much did the Neo Geo cost?",
  "I've never heard of PS5 also how much did the Neo Geo cost?"
]) {
  const result = evaluate(question, "around 600 bucks", "give the Neo Geo price", eraDateKey);
  assert.equal(result.ok, true, `real connective-led question must still split: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, "give the Neo Geo price"), "");
}

// Finding 112: contracted negative auxiliaries remain anaphoric to their future
// antecedent in both primary and fallback paths.
for (const [question, scope] of [
  ["do you own a PS5; wasn't it any good?", "say whether it was any good"],
  ["do you own a PS5; isn't it expensive?", "say whether it is expensive"],
  ["do you own a PS5; wouldn't it be fun?", "say whether it would be fun"],
  ["do you own a PS5; didn't you like it?", "say whether you liked it"]
]) {
  const primary = evaluate(question, "yeah", scope, eraDateKey);
  assert.equal(primary.ok, false, `contracted future anaphor must remain sealed: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, scope), "");
  const fallback = periodSafeHumanFallbackLines(
    builtIn("yeah maybe"),
    { from: "Crateman", target: "MetallicaFan", text: question },
    eraDateKey,
    scope
  );
  assert.equal(fallback[0].text, "what? never heard of that");
  assert.equal(fallback[0]._v41EraSafeFallback, true);
}

console.log("v41 findings 109-112 possessive/boundary/contracted-anaphora regressions passed");
