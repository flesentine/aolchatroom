import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";
import { scopedFallbackEraViolation } from "../src/era_fallback_v41.js";

const eraDateKey = "1996-09-03";

function plan(meaning) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review117",
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

function evaluate(question, surface, meaning) {
  return evaluatePrimaryHumanVoice({
    plan: plan(meaning),
    human: { kind: "human", from: "Crateman", target: "MetallicaFan", text: question },
    lines: [{ speaker: "MetallicaFan", target: "Crateman", text: surface, source: "gemini" }],
    eraDateKey
  });
}

// Finding 117: common discourse bridges after coordinators must expose a real
// independent 1996 clause, including the conventional comma after "also".
for (const question of [
  "I've never heard of PS5 and then how much did the Neo Geo cost?",
  "I've never heard of PS5 also, how much did the Neo Geo cost?",
  "I've never heard of PS5 and btw, how much did the Neo Geo cost?",
  "I've never heard of PS5 and by the way, how much did the Neo Geo cost?"
]) {
  const primary = evaluate(question, "around 600 bucks", "give the Neo Geo price");
  assert.equal(primary.ok, true, `period-valid independent clause must remain selectable: ${question}`);
  assert.equal(
    scopedFallbackEraViolation(question, eraDateKey, "give the Neo Geo price"),
    "",
    `fallback must scope to the independent Neo Geo clause: ${question}`
  );
}

// A discourse bridge does not sever an anaphor from the future antecedent.
for (const question of [
  "do you own a PS5 and then was it any good?",
  "do you own a PS5 also, was it any good?",
  "do you own a PS5 and btw, was it any good?"
]) {
  const primary = evaluate(question, "yeah it was good", "say whether it was any good");
  assert.equal(primary.ok, false, `future anaphor must remain sealed: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, "say whether it was any good"), "");
}

// Punctuation after "also" must not revive the old complement false split.
for (const question of [
  "I've never heard of PS5 also, what I want to know is whether it was good",
  "I've never heard of PS5 and then expensive?"
]) {
  const primary = evaluate(question, "yeah", "say whether it was good or expensive");
  assert.equal(primary.ok, false, `non-independent complement must stay in future scope: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, "say whether it was good or expensive"), "");
}

console.log("v41 finding 117 punctuated discourse-bridge regressions passed");
