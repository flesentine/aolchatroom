import assert from "node:assert/strict";
import { publicWorldViolation, evaluateWorldClaim } from "../src/world_model.js";
import { auditWorldHistory } from "../src/world_audit.js";
import { moderateVoiceHabits } from "../src/voice_policy.js";

const NOW = Date.parse("2026-08-24T11:00:00-07:00");
const emptyCulture = { events: [], movies: [], tv: [], anchors: [] };
const chicago = { timezone: "CT", occupation: "office administrator" };

function violation(text, context = "", culture = emptyCulture, speaker = chicago) {
  return publicWorldViolation(text, culture, NOW, context, speaker);
}

assert.equal(
  violation("watch the friends finale tomorrow night? i heard its a classic")?.kind,
  "unsupported-relative-schedule"
);
assert.equal(
  violation("omg yeah it is literally just all reruns now")?.kind,
  "unsupported-public-claim"
);
assert.equal(
  violation("it feels like forever cause theyre on every day in syndication :)")?.kind,
  "unsupported-public-claim"
);
assert.equal(
  violation("btw you guys should check the new HTML5 tutorials")?.kind,
  "unsupported-public-claim"
);

assert.equal(violation("is friends on tomorrow?"), null);
assert.equal(violation("did u hear about the jazz festival tomorrow?")?.kind, "unsupported-relative-schedule");

assert.equal(violation("im going to a concert tomorrow"), null);
assert.equal(violation("we won our softball game 8-3"), null);
assert.equal(violation("my new haircut looks ridiculous"), null);

assert.equal(violation("the yankees won the game 8-3")?.kind, "unsupported-public-claim");
assert.equal(violation("it was Mets and Dodgers went like fifteen innings", "late game last night")?.kind, "unsupported-public-detail");
assert.equal(violation("dude i think the new music in that patch is sick", "quake got a new patch")?.kind, "unsupported-public-detail");
assert.equal(violation("did that patch fix lag?", "quake got a new patch"), null);
assert.equal(violation("i heard the new bean is like chocolate flavored, weird")?.kind, "unsupported-public-claim");

const scheduledTv = {
  events: [], movies: [], anchors: [],
  tv: [{ date: "1996-08-25", show: "Friends", episode: "The One With a Tuesday Thing", network: "NBC", airtime: "20:00" }]
};
assert.equal(
  evaluateWorldClaim("watch friends tomorrow night?", { culture: scheduledTv, now: NOW, speaker: chicago }).epistemic,
  "grounded-schedule"
);
assert.equal(
  violation("watch friends finale tomorrow night?", "", scheduledTv)?.kind,
  "unsupported-relative-schedule"
);
const scheduledFinale = {
  events: [], movies: [], anchors: [],
  tv: [{ date: "1996-08-25", show: "Friends", episode: "Season Finale", network: "NBC", airtime: "20:00" }]
};
assert.equal(
  evaluateWorldClaim("watch friends finale tomorrow night?", { culture: scheduledFinale, now: NOW, speaker: chicago }).epistemic,
  "grounded-schedule"
);

const capturedFailure = [
  { kind: "bot", from: "ChiTownAmy", text: "watch the friends finale tomorrow night? i heard its a classic", topic: "friends", at: NOW },
  { kind: "bot", from: "CaliGrrl", text: "friends? that's like a total throwback", topic: "friends", at: NOW + 1000 },
  { kind: "bot", from: "JennJenn", text: "omg yeah it is literally just all reruns now", topic: "friends", at: NOW + 2000 },
  { kind: "bot", from: "JennJenn", text: "it feels like forever cause theyre on every day in syndication :)", topic: "friends", at: NOW + 3000 },
  { kind: "bot", from: "ChiTownAmy", text: "omg the finale was epic the whole squad watched it", topic: "friends", at: NOW + 4000 },
  { kind: "bot", from: "WebMasterJ", text: "btw you guys should check the new HTML5 tutorials", topic: "web", at: NOW + 5000 }
];
const audit = auditWorldHistory(capturedFailure, emptyCulture, 0, () => chicago);
assert.ok(audit.blockers >= 4, JSON.stringify(audit));
assert.ok(audit.needsReview >= 1, JSON.stringify(audit));

const voice = moderateVoiceHabits("omg that was funny lol", {
  speaker: "JennJenn",
  configuredHabits: ["lol", "omg"],
  ownRecent: ["omg no way lol", "seriously"],
  roomRecent: ["omg no way lol", "a lol", "b lol", "plain"]
});
assert.equal(voice.changed, true);
assert.ok(voice.changes.some((change) => change.key === "lol"));
assert.ok(voice.changes.some((change) => change.key === "omg"));

console.log("v36 world-model consolidation regression checks passed");
