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

// Finding 155: computer/computers are generic referents just like console/system.
// They must remain attached to a future PS5 antecedent rather than creating a
// synthetic explicit subject.
for (const question of [
  "I've never heard of PS5 computers and are these shiny computers any good?",
  "I've never heard of PS5 and is this shiny computer any good?"
]) {
  const meaning = "say whether these computers are any good";
  const primary = evaluate(question, "yeah they are good", meaning);
  assert.equal(primary.ok, false, `generic computer referent must remain future-linked: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 156: contrasted-with/to/against are ordinary cross-object comparison
// constructions and preserve the future comparison object.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better when contrasted with it",
  "I've never heard of PS5 but I think the Neo Geo is better contrasted to it",
  "I've never heard of PS5 but I think the Neo Geo is better when contrasted against it"
]) {
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, `contrasted comparison must retain PS5: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 157: a comma may introduce explicit naming syntax before the period
// product name. This is a genuine named reset, unlike compatibility/style use.
for (const question of [
  "I've never heard of PS5; is this console, called Neo Geo, any good?",
  "I've never heard of PS5; is this console, named Sega Saturn, any good?",
  "I've never heard of PS5; is this console, known as the Neo Geo, any good?"
]) {
  const meaning = "say whether the named period console is any good";
  const primary = evaluate(question, "yeah that console is good", meaning);
  assert.equal(primary.ok, true, `comma-prefixed naming must reset to the period subject: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// A comma followed by a recognized product used as a relation target is still
// not naming syntax.
for (const question of [
  "I've never heard of PS5 and is this console, Neo Geo compatible?",
  "I've never heard of PS5 and is this console, Neo Geo style?"
]) {
  const meaning = "say whether this console has that relation";
  const primary = evaluate(question, "yeah it does", meaning);
  assert.equal(primary.ok, false, `relation target must not become a named reset: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 155-157 computer/contrasted/comma-naming regressions passed");
