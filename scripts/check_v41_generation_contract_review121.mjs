import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";
import { scopedFallbackEraViolation } from "../src/era_fallback_v41.js";

const eraDateKey = "1996-09-03";

function plan(meaning) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review121",
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

// Finding 118: an independent-looking clause can still contain an embedded
// pronoun whose antecedent is the future-world subject.
for (const question of [
  "is the PS5 black but I think it is expensive?",
  "is the PS5 good and you said it was expensive?",
  "is the PS5 cheap but there is no way it was good?"
]) {
  const primary = evaluate(question, "yeah it was expensive", "say whether it was expensive");
  assert.equal(primary.ok, false, `embedded future anaphor must remain sealed: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, "say whether it was expensive"), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo is expensive";
  const primary = evaluate(question, "yeah the Neo Geo is expensive", "say whether the Neo Geo is expensive");
  assert.equal(primary.ok, true, "explicit Neo Geo subject inside opinion clause must reset the future referent");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, "say whether the Neo Geo is expensive"), "");
}

// Finding 119: mask only demonstratives that actually determine an explicit
// noun phrase; another standalone demonstrative in the same clause stays
// available as an anaphor to the future antecedent.
{
  const question = "I've never heard of PS5; is this Neo Geo better than that?";
  const primary = evaluate(question, "the Neo Geo was better", "say whether this Neo Geo is better than that");
  assert.equal(primary.ok, false, "comparison demonstrative must retain the PS5 antecedent");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, "say whether this Neo Geo is better than that"), "");
}
{
  const question = "I've never heard of PS5; is this Neo Geo better than the Saturn?";
  const primary = evaluate(question, "the Neo Geo was better", "say whether this Neo Geo is better than the Saturn");
  assert.equal(primary.ok, true, "two explicit 1996 subjects must not inherit the PS5 referent");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, "say whether this Neo Geo is better than the Saturn"), "");
}

// Finding 120: contracted auxiliaries can begin a genuine independent 1996
// clause. Once split, contracted pronoun clauses still rejoin the future row.
{
  const question = "I've never heard of PS5 but wasn't the Neo Geo expensive?";
  const primary = evaluate(question, "yeah, the Neo Geo was expensive", "say whether the Neo Geo was expensive");
  assert.equal(primary.ok, true, "contracted Neo Geo clause must remain selectable");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, "say whether the Neo Geo was expensive"), "");
}
{
  const question = "do you own a PS5 but wasn't it any good?";
  const primary = evaluate(question, "yeah it was good", "say whether it was any good");
  assert.equal(primary.ok, false, "contracted pronoun clause must remain tied to PS5");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, "say whether it was any good"), "");
}

// Finding 121: noun-led declarative clauses are valid after an explicit
// discourse bridge, but ordinary noun coordination remains unsplit.
for (const question of [
  "I've never heard of PS5 and btw, the Neo Geo cost around $600, right?",
  "I've never heard of PS5 and by the way, the Neo Geo cost around $600, right?",
  "I've never heard of PS5 also, the Neo Geo cost around $600, right?"
]) {
  const primary = evaluate(question, "yeah around 600 bucks", "confirm the Neo Geo cost around 600");
  assert.equal(primary.ok, true, `noun-led 1996 clause after discourse bridge must be selectable: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, "confirm the Neo Geo cost around 600"), "");
}
{
  const question = "The PS5 is also the thing I want to know about";
  const primary = evaluate(question, "yeah i know about it", "answer the thing I want to know about");
  assert.equal(primary.ok, false, "ordinary complement must not become a noun-led boundary");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, "answer the thing I want to know about"), "");
}

console.log("v41 findings 118-121 embedded-anaphor/comparison/contracted/noun-boundary regressions passed");
