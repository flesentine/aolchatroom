import assert from "node:assert/strict";
import {
  evaluatePublicMediaSurface,
  publicMediaFactScope
} from "../src/public_media_fact_grounding_v41.js";

const eraDateKey = "1996-09-09";
const id4Context = [{
  kind: "bot",
  from: "MacAddict",
  target: "room",
  text: "independence day was awesome",
  messageId: "edge-id4",
  at: 1000
}];

const explicitUnknown = {
  kind: "human",
  from: "Crateman",
  target: "VideoStoreGuy",
  text: "who stars in mystery movie xyz?",
  messageId: "edge-explicit",
  at: 1010
};
const explicitScope = publicMediaFactScope({
  human: explicitUnknown,
  history: [...id4Context, explicitUnknown],
  eraDateKey
});
assert.equal(explicitScope?.title, "mystery movie xyz", "explicit new title must beat an older recent movie referent");
assert.equal(explicitScope?.trusted, false);
assert.equal(explicitScope?.source, "explicit-unverified-title");

const alternateCastWording = {
  kind: "human",
  from: "Crateman",
  target: "VideoStoreGuy",
  text: "what actors are in independence day?",
  messageId: "edge-wording",
  at: 1020
};
const alternateScope = publicMediaFactScope({ human: alternateCastWording, history: [alternateCastWording], eraDateKey });
assert.equal(alternateScope?.kind, "cast");
assert.equal(alternateScope?.title, "Independence Day");
assert.equal(alternateScope?.trusted, true);

const originalQuestion = {
  kind: "human",
  from: "Crateman",
  target: "Sk8rGuy16",
  text: "who stars in that",
  messageId: "edge-question",
  at: 1030
};
const wrongAnswer = {
  kind: "bot",
  from: "Sk8rGuy16",
  target: "Crateman",
  text: "keanu reaves and al pacino",
  messageId: "edge-wrong",
  at: 1040
};
const challenge = {
  kind: "human",
  from: "Crateman",
  target: "Sk8rGuy16",
  text: "i think that's wrong",
  messageId: "edge-challenge",
  at: 1050
};
const challengeScope = publicMediaFactScope({
  human: challenge,
  history: [...id4Context, originalQuestion, wrongAnswer, challenge],
  eraDateKey
});
assert.equal(challengeScope?.type, "fact-challenge");
assert.equal(
  evaluatePublicMediaSurface(
    challengeScope,
    "yeah you're right, will smith and jeff goldblum are in independence day, i meant devil's advocate"
  ).reason,
  "public-media-challenge-rationalization",
  "a grounded phrase must not launder an invented replacement-title excuse"
);
assert.equal(
  evaluatePublicMediaSurface(challengeScope, "my bad, not sure").ok,
  false,
  "when trusted correction facts exist, uncertainty must not replace the actual correction"
);

const unrelatedChallenge = {
  kind: "human",
  from: "Crateman",
  target: "MacAddict",
  text: "that's wrong",
  messageId: "edge-other-target",
  at: 1060
};
assert.equal(
  publicMediaFactScope({
    human: unrelatedChallenge,
    history: [...id4Context, originalQuestion, wrongAnswer, unrelatedChallenge],
    eraDateKey
  }),
  null,
  "a challenge to a different direct target must not resurrect an older movie-detail obligation"
);

const directorQuestion = {
  kind: "human",
  from: "Crateman",
  target: "VideoStoreGuy",
  text: "who directed independence day?",
  messageId: "edge-director",
  at: 1070
};
const directorScope = publicMediaFactScope({ human: directorQuestion, history: [directorQuestion], eraDateKey });
assert.equal(directorScope?.kind, "director");
assert.equal(directorScope?.trusted, true);
assert.equal(evaluatePublicMediaSurface(directorScope, "roland emmerich directed it").ok, true);
assert.equal(
  evaluatePublicMediaSurface(directorScope, "roland emmerich and steven spielberg directed it").ok,
  false,
  "a correct director name must not smuggle an invented second director through the gate"
);

const releaseQuestion = {
  kind: "human",
  from: "Crateman",
  target: "VideoStoreGuy",
  text: "when did independence day come out?",
  messageId: "edge-release",
  at: 1080
};
const releaseScope = publicMediaFactScope({ human: releaseQuestion, history: [releaseQuestion], eraDateKey });
assert.equal(releaseScope?.kind, "release");
assert.equal(releaseScope?.trusted, true);
assert.equal(evaluatePublicMediaSurface(releaseScope, "it came out july 3 1996").ok, true);
assert.equal(evaluatePublicMediaSurface(releaseScope, "it came out july 3 1995").ok, false);
assert.equal(evaluatePublicMediaSurface(releaseScope, "it came out july 4 1996").ok, false);

console.log("v41 public media fact grounding adversarial edge checks passed");
