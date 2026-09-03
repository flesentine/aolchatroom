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

// Finding 124: ordinary reporting/cognitive verbs outside the original allowlist
// still carry a bare pronoun back to the future antecedent.
for (const question of [
  "is the PS5 black but I know it is expensive?",
  "is the PS5 black but I believe it is expensive?",
  "is the PS5 black but you know it is expensive?",
  "is the PS5 black but I suppose it is expensive?"
]) {
  const meaning = "say whether it is expensive";
  const primary = evaluate(question, "yeah it is expensive", meaning);
  assert.equal(primary.ok, false, `embedded reporting anaphor must remain sealed: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I know the Neo Geo is expensive and it is hard to find";
  const meaning = "say whether the Neo Geo is hard to find";
  const primary = evaluate(question, "yeah the Neo Geo is hard to find", meaning);
  assert.equal(primary.ok, true, "explicit Neo Geo subject must reset expanded reporting verbs");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 125: local self-comparison predicates keep the pronoun on the explicit
// new subject, while a bare comparison pronoun can still point back to PS5.
for (const question of [
  "I've never heard of PS5 but I think the Neo Geo is better than it used to be",
  "I've never heard of PS5 but I think the Neo Geo is cheaper than it was before"
]) {
  const meaning = "say whether the Neo Geo improved";
  const primary = evaluate(question, "yeah the Neo Geo improved", meaning);
  assert.equal(primary.ok, true, `local self-comparison must stay on Neo Geo: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "I've never heard of PS5 but I think the Neo Geo is better than it";
  const meaning = "say whether the Neo Geo is better than it";
  const primary = evaluate(question, "yeah the Neo Geo is better", meaning);
  assert.equal(primary.ok, false, "bare comparison pronoun must retain the PS5 antecedent");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 126: demonstrative determiners may be followed by modifiers before
// the explicit noun phrase.
for (const question of [
  "I've never heard of PS5; is this cool Neo Geo worth buying?",
  "I've never heard of PS5; was that expensive Neo Geo worth it?",
  "I've never heard of PS5; is this really cool Neo Geo worth buying?"
]) {
  const meaning = "say whether the Neo Geo is worth buying";
  const primary = evaluate(question, "yeah the Neo Geo is worth buying", meaning);
  assert.equal(primary.ok, true, `modified demonstrative Neo Geo must reset PS5: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "do you own a PS5 and is this cool?";
  const meaning = "say whether this is cool";
  const primary = evaluate(question, "yeah it is cool", meaning);
  assert.equal(primary.ok, false, "standalone demonstrative plus adjective must remain anaphoric");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

// Finding 127: noun-led 1996 clauses behind explicit discourse bridges may have
// ordinary longer noun phrases, while ordinary complements still do not split.
for (const question of [
  "I've never heard of PS5 and btw, the Neo Geo home video game console cost around $600, right?",
  "I've never heard of PS5 and by the way, the old Neo Geo home video game console cost around $600, right?"
]) {
  const meaning = "confirm the Neo Geo cost around 600";
  const primary = evaluate(question, "yeah around 600 bucks", meaning);
  assert.equal(primary.ok, true, `long noun-led Neo Geo clause must be selectable: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}
{
  const question = "The PS5 is also the old home video game console thing I want to know about";
  const meaning = "answer the old home video game console thing I want to know about";
  const primary = evaluate(question, "yeah i know about it", meaning);
  assert.equal(primary.ok, false, "long ordinary complement must not become a discourse boundary");
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(scopedFallbackEraViolation(question, eraDateKey, meaning), "");
}

console.log("v41 findings 124-127 reporting/self-comparison/demonstrative/long-noun regressions passed");
