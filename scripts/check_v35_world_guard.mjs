import assert from "node:assert/strict";
import {
  publicWorldViolation,
  relativeDateCandidates,
  speakerTemporalContext
} from "../src/v35_world_guard.js";

// The simulation mirrors the live month/day into 1996. Use a real 2026 timestamp
// whose mirrored cutoff is August 23, 1996, matching the captured regression session.
const NOW = Date.parse("2026-08-23T12:00:00-07:00");
const culture = { events: [], movies: [], tv: [], anchors: [] };

function kind(text, context = "") {
  return publicWorldViolation(text, culture, NOW, context)?.kind || null;
}

// Unsupported public patch details must be blocked even when phrased as opinion/speculation.
assert.equal(
  kind("dude i think the new music in that patch is sick", "just heard quake got a new patch"),
  "unsupported-public-detail"
);
assert.equal(
  kind("yeah i ran it last night speed increased", "just heard quake got a new patch"),
  "unsupported-public-detail"
);
assert.equal(
  kind("yeah man, the new map is sick, think it fixes that lag", "new patches for quake"),
  "unsupported-public-detail"
);

// A question may explore an already-established patch thread without itself asserting a feature.
assert.equal(
  kind("did that patch fix lag?", "Crateman asked what the new patch does"),
  null
);

// Known future programming and unsupported public schedules must be caught.
assert.equal(
  kind("lol u gonna watch the new friends episode tomorrow?"),
  "future-public-claim"
);
assert.equal(
  kind("did u hear about the jazz festival tomorrow?"),
  "unsupported-relative-schedule"
);

// Public results/scores need grounding; private fictional-life results do not.
assert.equal(kind("the yankees won the game 8-3"), "unsupported-public-claim");
assert.equal(kind("we won our softball game 8-3"), null);

// Specific professional-game details from the v35 capture must not become shared reality
// unless the historical/culture layer actually contains support for them.
assert.equal(
  kind("it was Mets and Dodgers went like fifteen innings", "anyone catch the late game last night"),
  "unsupported-public-detail"
);
assert.equal(
  kind("bottom of the ninth was unreal", "Mets and Dodgers went like fifteen innings"),
  "unsupported-public-detail"
);
assert.equal(
  kind("nah it went fifteen innings cuz the bullpen fell apart", "Mets and Dodgers late game last night"),
  "unsupported-public-detail"
);
assert.equal(
  kind("those pitching changes alone added like half an hour", "Mets and Dodgers went fifteen innings"),
  "unsupported-public-detail"
);

// Vague sports chatter without an asserted result/detail remains allowed.
assert.equal(kind("anyone catch the late game last night"), null);
assert.equal(kind("yeah caught the end of it, unbelievable finish", "late game last night"), null);

// Generic private plans remain creative space.
assert.equal(kind("im going to a concert tomorrow"), null);

// The known contaminated coffee-product rumor is always rejected during migration/audit.
assert.equal(
  kind("i heard the new bean is like chocolate flavored, weird"),
  "unsupported-public-claim"
);

// Relative-day language uses the speaker's own timezone, not the room's PT date.
// At the same absolute instant it is 11 PM Aug 23 in California but 2 AM Aug 24 in New York.
const LATE = Date.parse("2026-08-23T23:00:00-07:00");
const newYorkNightOwl = { timezone: "ET", occupation: "delivery driver" };
const californiaOffice = { timezone: "PT", occupation: "office temp" };

assert.equal(speakerTemporalContext(newYorkNightOwl, LATE).civilDateKey, "1996-08-24");
assert.equal(speakerTemporalContext(newYorkNightOwl, LATE).socialDateKey, "1996-08-23");
assert.deepEqual(
  relativeDateCandidates("yesterday", newYorkNightOwl, LATE),
  ["1996-08-23", "1996-08-22"]
);
assert.deepEqual(
  relativeDateCandidates("yesterday", californiaOffice, LATE),
  ["1996-08-22"]
);

// A 2 AM ET speaker can still use the pre-sleep social day, so an Aug 23 fact can
// satisfy "yesterday" even though the strict civil calendar has already rolled to Aug 24.
const datedGameCulture = {
  events: [], movies: [], tv: [],
  anchors: [{ date: "1996-08-23", title: "Mets Dodgers game", detail: "Mets Dodgers went nine innings" }]
};
assert.equal(
  publicWorldViolation("Mets and Dodgers went nine innings yesterday", datedGameCulture, LATE, "", newYorkNightOwl),
  null
);
assert.equal(
  publicWorldViolation("Mets and Dodgers went nine innings yesterday", datedGameCulture, LATE, "", californiaOffice)?.kind,
  "unsupported-public-detail"
);

// The ambiguity window is schedule-sensitive rather than a universal hard 4 AM rule.
const THREE_AM_ET = Date.parse("2026-08-24T00:00:00-07:00");
assert.equal(
  speakerTemporalContext({ timezone: "ET", occupation: "office temp" }, THREE_AM_ET).lateNightAmbiguous,
  false
);
assert.equal(
  speakerTemporalContext({ timezone: "ET", occupation: "community college student" }, THREE_AM_ET).lateNightAmbiguous,
  true
);

console.log("v35 world-guard regression checks passed");
