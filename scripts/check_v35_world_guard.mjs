import assert from "node:assert/strict";
import { publicWorldViolation } from "../src/v35_world_guard.js";

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

console.log("v35 world-guard regression checks passed");