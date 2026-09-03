import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";

function plan(meaning) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review100",
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

function evaluate(question, surface, meaning = "answer the human", { eraDateKey = "", speaker = "MetallicaFan", target = "Crateman" } = {}) {
  return evaluatePrimaryHumanVoice({
    plan: plan(meaning),
    human: {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: question
    },
    lines: [{ speaker, target, text: surface, source: "gemini" }],
    eraDateKey
  });
}

// Finding 96: internal apostrophes inside a possessive name must not bypass
// peripheral-price binding. These parser-only cases intentionally omit the era.
for (const surface of [
  "A controller for O'Connor's PlayStation 5 costs $70",
  "A controller for D'Angelo's old PlayStation 5 costs $70",
  "I paid $70 for O'Connor's PlayStation 5 controller"
]) {
  const result = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price");
  assert.equal(result.ok, false, `internal-apostrophe peripheral must not satisfy console price: ${surface}`);
  assert.equal(result.reason, "missing-price");
}
let result = evaluate(
  "how much did the PlayStation 5 cost?",
  "I paid $499 for O'Connor's PlayStation 5",
  "give the PlayStation 5 price"
);
assert.equal(result.ok, true, "internal-apostrophe possessor must remain valid for the actual console price");

// Finding 97: safe hardware heads survive common compound modifiers before the
// relation verb, while otherwise-identical peripheral heads remain unsafe.
for (const surface of [
  "A fancy brand new home video game console well designed exclusively for the PlayStation 5 costs $499",
  "A fancy brand new home video game console hand built specifically for the PlayStation 5 costs $499",
  "A fancy brand new home video game console well-designed exclusively for the PlayStation 5 costs $499"
]) {
  const safe = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price");
  assert.equal(safe.ok, true, `safe hardware head must survive compound modifier: ${surface}`);
}
for (const surface of [
  "A fancy brand new wireless gaming headset well designed exclusively for the PlayStation 5 costs $70",
  "A fancy brand new wireless gaming headset hand built specifically for the PlayStation 5 costs $70"
]) {
  const unsafe = evaluate("how much did the PlayStation 5 cost?", surface, "give the PlayStation 5 price");
  assert.equal(unsafe.ok, false, `peripheral must remain unsafe across compound modifier: ${surface}`);
  assert.equal(unsafe.reason, "missing-price");
}

// Finding 98: an ignorance cue cannot bless a confident future-aware tail.
for (const [question, surface, meaning] of [
  ["how much did the PS5 cost?", "what is that? it cost $499", "give the PS5 price"],
  ["have you used an iPhone?", "never heard of that, but yeah i have", "say whether he has used an iPhone"],
  ["do you watch YouTube?", "what are you talking about? i watch it every day", "say whether he watches YouTube"]
]) {
  const rejected = evaluate(question, surface, meaning, { eraDateKey: "1996-09-03" });
  assert.equal(rejected.ok, false, `confident tail after ignorance must be rejected: ${surface}`);
  assert.equal(rejected.reason, "era-boundary-confident-answer");
}

// Finding 99: common standalone ignorance is period-correct and should not be
// discarded just because it does not use the original narrow wording.
for (const surface of [
  "I don't know",
  "i dont know",
  "no idea",
  "beats me",
  "doesn't ring a bell",
  "that doesn't ring a bell"
]) {
  const accepted = evaluate("how much did the PS5 cost?", surface, "give the PS5 price", { eraDateKey: "1996-09-03" });
  assert.equal(accepted.ok, true, `standalone ignorance must be accepted: ${surface}`);
  assert.equal(accepted.reason, "era-boundary-ignorance");
}

// Finding 100: an incidental future-world clause must not poison a separate
// period-valid obligation that the Director is actually answering.
result = evaluate(
  "I've never heard of PS5; how much did the Neo Geo cost?",
  "around 600 bucks",
  "give the Neo Geo price",
  { eraDateKey: "1996-09-03" }
);
assert.equal(result.ok, true, "future disclaimer must not poison a separate Neo Geo price answer");
assert.notEqual(result.reason, "era-boundary-confident-answer");

// The same mixed turn still invokes the boundary when the selected semantic
// scope itself is the future-world subject.
result = evaluate(
  "how much did the PS5 cost? I also like the Neo Geo",
  "$499",
  "give the PS5 price",
  { eraDateKey: "1996-09-03" }
);
assert.equal(result.ok, false);
assert.equal(result.reason, "era-boundary-confident-answer");

console.log("v41 findings 96-100 adversarial regressions passed");
