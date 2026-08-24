import assert from "node:assert/strict";
import {
  publicWorldViolation,
  relativeDateCandidates,
  speakerTemporalContext
} from "../src/v35_world_guard.js";
import { getCharacter } from "../src/characters.js";
import { mirrorLocalParts } from "../src/calendar.js";
import { hasLol, moderate1996Lol } from "../src/v35_laughter.js";

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
  relativeDateCandidates("last night", newYorkNightOwl, LATE),
  ["1996-08-23", "1996-08-22"]
);
assert.deepEqual(
  relativeDateCandidates("today", newYorkNightOwl, LATE),
  ["1996-08-24", "1996-08-23"]
);
assert.deepEqual(
  relativeDateCandidates("tonight", newYorkNightOwl, LATE),
  ["1996-08-24", "1996-08-23"]
);
assert.deepEqual(
  relativeDateCandidates("tomorrow", newYorkNightOwl, LATE),
  ["1996-08-25", "1996-08-24"]
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

// The rollover boundary itself is exclusive: at 4:30 AM, a student has rolled into the civil day.
const FOUR_THIRTY_AM_ET = Date.parse("2026-08-24T01:30:00-07:00");
assert.equal(
  speakerTemporalContext({ timezone: "ET", occupation: "community college student" }, FOUR_THIRTY_AM_ET).lateNightAmbiguous,
  false
);
assert.deepEqual(
  relativeDateCandidates("yesterday", { timezone: "ET", occupation: "community college student" }, FOUR_THIRTY_AM_ET),
  ["1996-08-23"]
);

// Fuzzy conversational dates must never leak a public fact that is still beyond the absolute room cutoff.
const futureDatedCulture = {
  events: [], movies: [], tv: [],
  anchors: [{ date: "1996-08-24", title: "Mets Dodgers game", detail: "Mets Dodgers went nine innings" }]
};
assert.equal(
  publicWorldViolation("Mets and Dodgers went nine innings today", futureDatedCulture, LATE, "", newYorkNightOwl)?.kind,
  "unsupported-public-detail"
);

// Arizona does not observe daylight saving time. Phoenix/Tempe characters must not inherit Denver time.
const cyberDude = getCharacter("CyberDude");
const sunDevil = getCharacter("SunDevilAZ");
assert.equal(cyberDude?.timezone, "America/Phoenix");
assert.equal(sunDevil?.timezone, "America/Phoenix");
assert.equal(speakerTemporalContext(cyberDude, LATE).civilDateKey, "1996-08-23");
assert.equal(speakerTemporalContext({ timezone: "MT" }, LATE).civilDateKey, "1996-08-24");
assert.equal(mirrorLocalParts(cyberDude.timezone, LATE).dateKey, "1996-8-23");
assert.equal(mirrorLocalParts("MT", LATE).dateKey, "1996-8-24");

// LOL is period-authentic, but repeated use should be softened rather than becoming punctuation.
assert.equal(hasLol("that was funny lol"), true);
assert.equal(hasLol("that was funny haha"), false);
assert.equal(
  moderate1996Lol("that was funny lol", {
    speaker: "JennJenn",
    configuredLol: true,
    ownRecent: ["no way lol", "seriously", "thats wild"],
    roomRecent: ["no way lol", "seriously", "thats wild"]
  }).softened,
  true
);
assert.equal(
  hasLol(moderate1996Lol("that was funny lol", {
    speaker: "JennJenn",
    configuredLol: true,
    ownRecent: ["no way lol", "seriously", "thats wild"],
    roomRecent: ["no way lol", "seriously", "thats wild"]
  }).text),
  false
);
assert.equal(
  moderate1996Lol("that was funny lol", {
    speaker: "JennJenn",
    configuredLol: true,
    ownRecent: ["seriously", "thats wild", "no way"],
    roomRecent: ["seriously", "thats wild", "no way"]
  }).softened,
  false
);
assert.equal(
  moderate1996Lol("that was funny lol", {
    speaker: "NYMike23",
    ownRecent: ["seriously", "thats wild"],
    roomRecent: ["a lol", "b lol", "c lol", "plain line"]
  }).reason,
  "room-saturation"
);
assert.equal(
  moderate1996Lol("lol means laugh out loud", {
    speaker: "CyberDude",
    ownRecent: ["lol"],
    roomRecent: ["lol", "lol", "lol"]
  }).softened,
  false
);

console.log("v35 world-guard and 1996-style regression checks passed");
