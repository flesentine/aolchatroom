import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";

function plan(meaning) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review94-era",
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

function evaluate(question, surface, meaning = "answer the human") {
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
    eraDateKey: "1996-09-03"
  });
}

for (const [question, confident, meaning] of [
  ["how much did the PS5 cost?", "$499", "give the PS5 price"],
  ["do you own a PlayStation 5?", "yeah", "say whether he owns a PlayStation 5"],
  ["have you used an iPhone?", "yeah i have", "say whether he has used an iPhone"],
  ["do you watch YouTube?", "sometimes", "say whether he watches YouTube"]
]) {
  const result = evaluate(question, confident, meaning);
  assert.equal(result.ok, false, `${confident} must not confidently answer future-world question: ${question}`);
  assert.equal(result.reason, "era-boundary-confident-answer");
}

for (const [question, ignorance, meaning] of [
  ["how much did the PS5 cost?", "what? never heard of that", "give the PS5 price"],
  ["do you own a PlayStation 5?", "what is that?", "say whether he owns a PlayStation 5"],
  ["have you used an iPhone?", "i have no clue what that is", "say whether he has used an iPhone"],
  ["do you watch YouTube?", "what are you talking about?", "say whether he watches YouTube"]
]) {
  const result = evaluate(question, ignorance, meaning);
  assert.equal(result.ok, true, `${ignorance} must be accepted as period-correct ignorance: ${question}`);
  assert.equal(result.reason, "era-boundary-ignorance");
}

for (const [question, repeatedFuture, meaning] of [
  ["how much did the PS5 cost?", "what is a PS5?", "give the PS5 price"],
  ["have you used an iPhone?", "what is an iPhone?", "say whether he has used an iPhone"],
  ["do you watch YouTube?", "what is YouTube?", "say whether he watches YouTube"]
]) {
  const result = evaluate(question, repeatedFuture, meaning);
  assert.equal(result.ok, false, `bot must not repeat future-world token: ${repeatedFuture}`);
  assert.equal(result.reason, "era-boundary-future-surface");
}

// The era repair must never override a structural route failure.
let result = evaluatePrimaryHumanVoice({
  plan: plan("give the PS5 price"),
  human: { kind: "human", from: "Crateman", target: "MetallicaFan", text: "how much did the PS5 cost?" },
  lines: [{ speaker: "SegaMan", target: "Crateman", text: "what?", source: "gemini" }],
  eraDateKey: "1996-09-03"
});
assert.equal(result.ok, false);
assert.equal(result.reason, "primary-speaker-mismatch");

result = evaluate(
  "how much did the Neo Geo cost?",
  "around 600 bucks",
  "give the Neo Geo price"
);
assert.equal(result.ok, true, "1996-valid hardware questions must keep normal semantic completeness");

console.log("v41 finding 94 sealed-era semantic/world-boundary bridge regressions passed");
