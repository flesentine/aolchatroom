import assert from "node:assert/strict";
import fs from "node:fs";
import {
  deterministicPublicMediaLine,
  evaluatePublicMediaSurface,
  planWithPublicMediaGrounding,
  publicMediaFactScope,
  publicMediaCatalogSnapshot
} from "../src/public_media_fact_grounding_v41.js";

const eraDateKey = "1996-09-09";
const movieLine = {
  kind: "bot",
  from: "MacAddict",
  target: "Crateman",
  text: "independence day is still pulling in crowds",
  messageId: "m-movie",
  at: 1000
};
const castQuestion = {
  kind: "human",
  from: "Crateman",
  target: "Sk8rGuy16",
  text: "who stars in that",
  messageId: "m-question",
  at: 1010
};

const castScope = publicMediaFactScope({
  human: castQuestion,
  history: [movieLine, castQuestion],
  eraDateKey
});
assert.equal(castScope?.type, "detail-question");
assert.equal(castScope?.kind, "cast");
assert.equal(castScope?.title, "Independence Day");
assert.equal(castScope?.trusted, true);
assert.equal(castScope?.source, "recent-chat-title");

assert.equal(
  evaluatePublicMediaSurface(castScope, "keanu reaves and al pacino").ok,
  false,
  "wrong actor names must not pass a grounded cast question"
);
assert.equal(
  evaluatePublicMediaSurface(castScope, "will smith and al pacino").ok,
  false,
  "one correct actor must not let a mixed hallucinated cast pass"
);
assert.equal(
  evaluatePublicMediaSurface(castScope, "will smith, jeff goldblum and al pacino").ok,
  false,
  "two correct names must not smuggle an extra invented actor through the cast gate"
);
assert.equal(
  evaluatePublicMediaSurface(castScope, "will smith and jeff goldblum").ok,
  true,
  "multiple trusted principal cast names must satisfy the cast gate"
);

const directPlan = {
  provider: "gemini",
  reason: "v37-human-director",
  subject: "independence day",
  goal: "answer who stars in the movie",
  moves: [{
    speaker: "Sk8rGuy16",
    target: "Crateman",
    intent: "answer",
    topic: "movies",
    meaning: "answer the cast question"
  }]
};
const groundedPlan = planWithPublicMediaGrounding(directPlan, castScope);
assert.ok(groundedPlan.goal.includes("Will Smith, Jeff Goldblum, Bill Pullman"));
assert.ok(groundedPlan.moves[0].meaning.includes("do not add unverified names"));

const fallback = deterministicPublicMediaLine(castScope, {
  speaker: "Sk8rGuy16",
  target: "Crateman"
});
assert.equal(fallback.speaker, "Sk8rGuy16");
assert.equal(fallback.target, "Crateman");
assert.equal(evaluatePublicMediaSurface(castScope, fallback.text).ok, true);
assert.ok(fallback.text.includes("will smith"));
assert.ok(fallback.text.includes("jeff goldblum"));
assert.ok(fallback.text.includes("bill pullman"));

const wrongAnswer = {
  kind: "bot",
  from: "Sk8rGuy16",
  target: "Crateman",
  text: "keanu reaves and al pacino",
  messageId: "m-wrong",
  at: 1020
};
const challenge = {
  kind: "human",
  from: "Crateman",
  target: "Sk8rGuy16",
  text: "i think that's wrong",
  messageId: "m-challenge",
  at: 1030
};
const challengeHistory = [movieLine, castQuestion, wrongAnswer, challenge];
const challengeScope = publicMediaFactScope({ human: challenge, history: challengeHistory, eraDateKey });
assert.equal(challengeScope?.type, "fact-challenge");
assert.equal(challengeScope?.kind, "cast");
assert.equal(challengeScope?.title, "Independence Day");
assert.equal(challengeScope?.trusted, true);

const rationalized = evaluatePublicMediaSurface(challengeScope, "dude i meant devil's advocate wtf");
assert.equal(rationalized.ok, false);
assert.equal(rationalized.reason, "public-media-challenge-rationalization");
assert.equal(
  evaluatePublicMediaSurface(challengeScope, "oh right my bad i meant the movie not the holiday").ok,
  false,
  "a vague invented excuse must not count as factual repair"
);
assert.equal(
  evaluatePublicMediaSurface(challengeScope, "yeah you're right, my bad, will smith and jeff goldblum are in independence day").ok,
  true,
  "a correction grounded in multiple trusted cast facts should pass"
);

const challengeFallback = deterministicPublicMediaLine(challengeScope, {
  speaker: "Sk8rGuy16",
  target: "Crateman"
});
assert.equal(evaluatePublicMediaSurface(challengeScope, challengeFallback.text).ok, true);
assert.ok(/you(?:'re| are) right/i.test(challengeFallback.text));
assert.ok(challengeFallback.text.includes("independence day"));

const unknownQuestion = {
  kind: "human",
  from: "Crateman",
  target: "VideoStoreGuy",
  text: "who stars in mystery movie xyz?",
  messageId: "m-unknown",
  at: 1040
};
const unknownScope = publicMediaFactScope({ human: unknownQuestion, history: [unknownQuestion], eraDateKey });
assert.equal(unknownScope?.kind, "cast");
assert.equal(unknownScope?.title, "mystery movie xyz");
assert.equal(unknownScope?.trusted, false);
assert.equal(
  evaluatePublicMediaSurface(unknownScope, "tom hanks and nic cage").ok,
  false,
  "unverified movie-detail answers must fail closed"
);
assert.equal(
  evaluatePublicMediaSurface(unknownScope, "not sure, i dont wanna make that up").ok,
  true,
  "natural uncertainty must remain available when trusted facts are absent"
);

const futureQuestion = {
  kind: "human",
  from: "Crateman",
  target: "VideoStoreGuy",
  text: "who stars in space jam",
  messageId: "m-future",
  at: 1050
};
const futureScope = publicMediaFactScope({ human: futureQuestion, history: [futureQuestion], eraDateKey });
assert.equal(futureScope?.title, "Space Jam");
assert.equal(futureScope?.available, false);
assert.equal(evaluatePublicMediaSurface(futureScope, "michael jordan").ok, false);
assert.equal(evaluatePublicMediaSurface(futureScope, "not sure, never heard of it").ok, true);

const catalog = publicMediaCatalogSnapshot();
assert.equal(catalog.some((row) => row.title === "Jack"), false, "ambiguous one-word Jack alias must not enter recent-title inference");
assert.equal(catalog.some((row) => row.title === "Scream"), false, "ambiguous one-word Scream alias must not enter recent-title inference");

const production = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
assert.ok(production.includes("planWithPublicMediaGrounding(plan, mediaScope)"));
assert.ok(production.includes("evaluatePublicMediaSurface(mediaScope"));
assert.ok(production.includes("deterministicPublicMediaLine(mediaScope"));
assert.ok(production.includes("humanReplanPrimaryObligation({ human, history: this.history || [] })"));
assert.ok(production.includes("directPublicMediaFactsMustBeGrounded: true"));
assert.ok(production.includes("factualChallengeCannotInventReplacementTitle: true"));

console.log("v41 public media fact grounding checks passed");
