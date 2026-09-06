import assert from "node:assert/strict";
import fs from "node:fs";
import {
  auditFutureGameProductHistory,
  auditedPublicClaimViolation,
  futureGameProductViolation,
  normalizeEraConsoleLabels
} from "../src/v39_public_world_gate.js";

const NOW = Date.parse("2026-08-31T13:30:00-07:00");
const emptyCulture = { events: [], movies: [], tv: [], anchors: [] };
const pacific = { timezone: "PT", occupation: "student" };

const tony = futureGameProductViolation(
  "tony hawk is coming out eventually anyway",
  NOW,
  "snes games playstation cartridges"
);
assert.equal(tony?.kind, "future-game-product");
assert.equal(tony?.product, "Tony Hawk's Pro Skater");
assert.equal(tony?.notBefore, "1999-08-31");

const goldenEyeGame = futureGameProductViolation("oh it was goldeneye for the n64", NOW);
assert.equal(goldenEyeGame?.kind, "future-game-product");
assert.equal(goldenEyeGame?.notBefore, "1997-08-25");

assert.equal(
  futureGameProductViolation("goldeneye came out last year lol", NOW, "whats the latest james bond film"),
  null
);
assert.equal(futureGameProductViolation("tony hawk is awesome", NOW, "skateboarding"), null);

const novelty = auditedPublicClaimViolation("did anyone see that new show about the single lawyers", {
  culture: emptyCulture,
  now: NOW,
  context: "",
  speaker: pacific
});
assert.equal(novelty?.kind, "unsupported-audited-public-claim");
assert.equal(novelty?.claimType, "novelty");

const relativeSchedule = auditedPublicClaimViolation("yo anyone catch that game last night", {
  culture: emptyCulture,
  now: NOW,
  context: "",
  speaker: pacific
});
assert.equal(relativeSchedule?.kind, "unsupported-audited-public-claim");
assert.equal(relativeSchedule?.claimType, "schedule");

assert.equal(
  auditedPublicClaimViolation("anyone like scary movies", {
    culture: emptyCulture,
    now: NOW,
    context: "",
    speaker: pacific
  }),
  null
);

assert.equal(normalizeEraConsoleLabels("nah snes still rules over ps1"), "nah snes still rules over playstation");
assert.equal(normalizeEraConsoleLabels("PS1 has good games"), "PlayStation has good games");

const retained = [
  { kind: "bot", from: "JerseyGirl", text: "goldeneye came out last year lol", topic: "general", at: NOW - 3000 },
  { kind: "human", from: "Crateman", text: "what n64 games are coming", topic: "gaming", at: NOW - 2000 },
  { kind: "bot", from: "Sk8rGuy16", text: "tony hawk is coming out eventually anyway", topic: "gaming", at: NOW - 1000 },
  { kind: "bot", from: "JennJenn", text: "oh it was goldeneye for the n64", topic: "gaming", at: NOW }
];
const audit = auditFutureGameProductHistory(retained, 0);
assert.equal(audit.violations, 2, JSON.stringify(audit));
assert.ok(audit.examples.some((row) => /Tony Hawk/i.test(row.product)));
assert.ok(audit.examples.some((row) => /GoldenEye/i.test(row.product)));

const runtime = fs.readFileSync(new URL("../src/index_v39_world_gate.js", import.meta.url), "utf8");
assert.ok(runtime.includes('from "./index_v39_presence_fix.js"'), "world gate must remain additive above the stable presence/capture wrapper");
assert.ok(runtime.includes("futureGameProductViolation(text, now, context)"));
assert.ok(runtime.includes("auditedPublicClaimViolation(text"));
assert.ok(runtime.includes("normalizeEraConsoleLabels(text)"));
assert.ok(runtime.includes("v39FutureGameProductViolations"));

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const directWorld = wrangler.includes('"main": "src/index_v39_world_gate.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"');
const v40Runtime = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
const wrappedByV40 = wrangler.includes('"main": "src/index_v40_scene_continuity.js"')
  && wrangler.includes('"DEPLOY_VERSION": "40"')
  && v40Runtime.includes('from "./index_v39_world_gate.js"');
const v41CompatRuntime = fs.readFileSync(new URL("../src/index_v41_ambient_continuity_compat.js", import.meta.url), "utf8");
const v41PresenceCompatRuntime = fs.readFileSync(new URL("../src/index_v41_presence_compat.js", import.meta.url), "utf8");
const v41CoherenceCompatRuntime = fs.readFileSync(new URL("../src/index_v41_coherence_compat.js", import.meta.url), "utf8");
const v41QualityCompatRuntime = fs.readFileSync(new URL("../src/index_v41_quality_compat.js", import.meta.url), "utf8");
const v41LivelyCompatRuntime = fs.readFileSync(new URL("../src/index_v41_lively_ambient_compat.js", import.meta.url), "utf8");
const v41Runtime = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
const v41ReconnectRuntime = fs.readFileSync(new URL("../src/index_v41_human_reconnect.js", import.meta.url), "utf8");
const v41CoherenceRuntime = fs.readFileSync(new URL("../src/index_v41_coherence_repair.js", import.meta.url), "utf8");
const wrappedByV41 = wrangler.includes('"main": "src/index_v41_scene_coordinator.js"')
  && wrangler.includes('"DEPLOY_VERSION": "41"')
  && v41Runtime.includes('from "./index_v41_ambient_continuity_compat.js"')
  && v41CompatRuntime.includes('from "./index_v41_presence_compat.js"')
  && v41PresenceCompatRuntime.includes('from "./index_v41_coherence_compat.js"')
  && v41CoherenceCompatRuntime.includes('from "./index_v41_quality_compat.js"')
  && v41QualityCompatRuntime.includes('from "./index_v41_lively_ambient_compat.js"')
  && v41LivelyCompatRuntime.includes('from "./index_v37_human_director.js"');
const v41GenerationRuntime = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
const wrappedByV41Generation = wrangler.includes('"main": "src/index_v41_generation_contract.js"')
  && wrangler.includes('"DEPLOY_VERSION": "41"')
  && (
    v41GenerationRuntime.includes('from "./index_v41_scene_coordinator.js"')
    || (
      v41GenerationRuntime.includes('from "./index_v41_coherence_repair.js"')
      && v41CoherenceRuntime.includes('from "./index_v41_human_reconnect.js"')
      && v41ReconnectRuntime.includes('from "./index_v41_scene_coordinator.js"')
    )
  )
  && v41Runtime.includes('from "./index_v41_ambient_continuity_compat.js"')
  && v41CompatRuntime.includes('from "./index_v41_presence_compat.js"')
  && v41PresenceCompatRuntime.includes('from "./index_v41_coherence_compat.js"')
  && v41CoherenceCompatRuntime.includes('from "./index_v41_quality_compat.js"')
  && v41QualityCompatRuntime.includes('from "./index_v41_lively_ambient_compat.js"')
  && v41LivelyCompatRuntime.includes('from "./index_v37_human_director.js"');
assert.ok(directWorld || wrappedByV40 || wrappedByV41 || wrappedByV41Generation, "production must retain the v39 world gate directly or beneath the additive v40/v41 scene wrappers");

console.log("v39 focused public-world pre-display gate regression checks passed");
