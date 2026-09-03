import assert from "node:assert/strict";
import { evaluatePrimaryHumanVoice } from "../src/generation_contract_v41_identity_choice_guard.js";
import { scopedFallbackEraViolation } from "../src/era_fallback_v41.js";

const eraDateKey = "1996-09-03";

function evaluate({ question, surface, subject = "", goal = "", meaning = "" }) {
  return evaluatePrimaryHumanVoice({
    plan: {
      provider: "structural-fallback",
      reason: "v37-human-director",
      subject,
      goal,
      moves: [{
        speaker: "MetallicaFan",
        target: "Crateman",
        intent: "respond",
        topic: "general",
        meaning
      }]
    },
    human: { kind: "human", from: "Crateman", target: "MetallicaFan", text: question },
    lines: [{ speaker: "MetallicaFan", target: "Crateman", text: surface, source: "gemini" }],
    eraDateKey
  });
}

// Finding 122: a mixed-era turn is exempt only when Director semantics uniquely
// select the period-valid clause. Generic/empty/no-overlap/tied metadata must
// not authorize a context-only confident answer that can imply future knowledge.
for (const row of [
  {
    label: "zero-overlap structural metadata",
    question: "was the PS5 any good; I just bought a Saturn",
    subject: "current topic",
    goal: "Respond naturally to the latest message",
    meaning: "Respond naturally to the latest message"
  },
  {
    label: "empty semantic metadata",
    question: "was the PS5 any good; I just bought a Saturn",
    subject: "",
    goal: "",
    meaning: ""
  },
  {
    label: "tied semantic scope",
    question: "the PS5 seems good; the Neo Geo seems good",
    subject: "good",
    goal: "say whether it seems good",
    meaning: "say whether it seems good"
  }
]) {
  const primary = evaluate({ ...row, surface: "yeah it was great" });
  assert.equal(primary.ok, false, `${row.label} must fail closed`);
  assert.equal(primary.reason, "era-boundary-confident-answer");
  assert.notEqual(
    scopedFallbackEraViolation(row.question, eraDateKey, [row.subject, row.goal, row.meaning].filter(Boolean).join(" ")),
    "",
    `${row.label} must remain symmetric with fallback fail-safe behavior`
  );
}

// A unique period-valid semantic scope is still allowed.
{
  const question = "I've never heard of PS5; how much did the Neo Geo cost?";
  const primary = evaluate({
    question,
    surface: "around 600 bucks",
    subject: "Neo Geo price",
    goal: "give the Neo Geo price",
    meaning: "give the Neo Geo price"
  });
  assert.equal(primary.ok, true, "unique Neo Geo scope must remain exempt from the future disclaimer");
  assert.equal(scopedFallbackEraViolation(question, eraDateKey, "give the Neo Geo price"), "");
}

// A unique future scope continues to reject a context-only confident answer.
{
  const question = "how much did the PS5 cost; I like the Neo Geo";
  const primary = evaluate({
    question,
    surface: "around 500 bucks",
    subject: "PS5 price",
    goal: "give the PS5 price",
    meaning: "give the PS5 price"
  });
  assert.equal(primary.ok, false);
  assert.equal(primary.reason, "era-boundary-confident-answer");
}

console.log("v41 finding 122 unresolved mixed-era primary-scope fail-closed regressions passed");
