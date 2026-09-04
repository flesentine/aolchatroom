import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";
import {
  scopedFallbackEraViolation,
  trustedGenerationContractScope
} from "../src/era_fallback_v41.js";

const eraDateKey = "1996-09-03";

function plan(meaning) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "phase2-review116",
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
    eraDateKey
  });
}

// Finding 114: the trusted current-turn identity must support the full incoming
// human text, not only the old 180-character diagnostic prefix.
const longPrefix = "ordinary 1996 room context ".repeat(10);
const longHuman = {
  from: "Crateman",
  target: "MetallicaFan",
  replyTo: "m-long-anchor",
  messageId: "m-long-current",
  text: `${longPrefix}I've never heard of PS5; how much did the Neo Geo cost?`
};
const longContract = {
  human: { ...longHuman },
  move: {
    subject: "Neo Geo price",
    goal: "answer how much the Neo Geo cost",
    meaning: "give the Neo Geo price",
    topic: "gaming"
  }
};
assert.ok(longHuman.text.length > 180);
assert.match(
  trustedGenerationContractScope(longContract, longHuman),
  /Neo Geo/i,
  "full current-turn identity must retain its fresh semantic scope"
);
const truncatedContract = {
  ...longContract,
  human: { ...longHuman, text: longHuman.text.slice(0, 180), messageId: "" }
};
assert.equal(
  trustedGenerationContractScope(truncatedContract, longHuman),
  "",
  "an old truncated-prefix snapshot must not authorize scope"
);

// Finding 115: conjunctions that only coordinate an adjective/predicate fragment
// are not independent clause boundaries. Otherwise the property fragment can
// be selected as superficially period-valid while still referring to the PS5.
for (const [question, surface, meaning] of [
  ["is the PS5 black and expensive?", "yeah it is expensive", "say whether it is expensive"],
  ["was the PS5 fast but quiet?", "yeah pretty quiet", "say whether it was quiet"],
  ["is the PS5 ugly although expensive?", "yeah it is expensive", "say whether it is expensive"]
]) {
  const primary = evaluate(question, surface, meaning);
  assert.equal(primary.ok, false, `elliptical future predicate must stay sealed: ${question}`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(
    scopedFallbackEraViolation(question, eraDateKey, meaning),
    "",
    `fallback must keep elliptical future predicate with its antecedent: ${question}`
  );
}

// Genuine independent clauses after conjunctions still split, including an
// ordinary discourse prefix before the second clause.
for (const question of [
  "I've never heard of PS5 and how much did the Neo Geo cost?",
  "I've never heard of PS5 and honestly, how much did the Neo Geo cost?"
]) {
  const primary = evaluate(question, "around 600 bucks", "give the Neo Geo price");
  assert.equal(primary.ok, true, `independent Neo Geo clause must remain selectable: ${question}`);
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, "give the Neo Geo price"), "");
}

console.log("v41 findings 114-115 long-scope/conjunction regressions passed");
