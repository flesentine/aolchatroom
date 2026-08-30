import assert from "node:assert/strict";
import fs from "node:fs";
import {
  LIVELY_AMBIENT_MIN_LINES,
  LIVELY_AMBIENT_MAX_LINES,
  LIVELY_AMBIENT_ONE_PROVIDER_INTERVAL_MS,
  LIVELY_AMBIENT_TWO_PROVIDER_INTERVAL_MS,
  LIVELY_AMBIENT_THREE_PLUS_INTERVAL_MS,
  livelyAmbientEligible,
  livelyAmbientIntervalMs
} from "../src/lively_ambient_policy_v37.js";

assert.equal(LIVELY_AMBIENT_MIN_LINES, 3);
assert.equal(LIVELY_AMBIENT_MAX_LINES, 5);
assert.equal(livelyAmbientIntervalMs(0), Infinity);
assert.equal(livelyAmbientIntervalMs(1), LIVELY_AMBIENT_ONE_PROVIDER_INTERVAL_MS);
assert.equal(livelyAmbientIntervalMs(2), LIVELY_AMBIENT_TWO_PROVIDER_INTERVAL_MS);
assert.equal(livelyAmbientIntervalMs(3), LIVELY_AMBIENT_THREE_PLUS_INTERVAL_MS);
assert.ok(LIVELY_AMBIENT_ONE_PROVIDER_INTERVAL_MS > LIVELY_AMBIENT_TWO_PROVIDER_INTERVAL_MS);
assert.ok(LIVELY_AMBIENT_TWO_PROVIDER_INTERVAL_MS > LIVELY_AMBIENT_THREE_PLUS_INTERVAL_MS);

assert.deepEqual(
  livelyAmbientEligible({ now: 100000, readyPreferredCount: 3, lastAmbientAiAt: 0, pendingHumanCount: 0, aiQueueLength: 0 }),
  { ok: true, reason: "ready", intervalMs: LIVELY_AMBIENT_THREE_PLUS_INTERVAL_MS }
);
assert.equal(livelyAmbientEligible({ now: 100000, readyPreferredCount: 2, pendingHumanCount: 1 }).reason, "human-pending");
assert.equal(livelyAmbientEligible({ now: 100000, readyPreferredCount: 2, aiQueueLength: 1 }).reason, "queue-not-empty");
assert.equal(livelyAmbientEligible({ now: 100000, readyPreferredCount: 0 }).reason, "no-preferred-provider");
assert.equal(livelyAmbientEligible({ now: 100000, readyPreferredCount: 3, lastAmbientAiAt: 99999 }).reason, "ambient-rate-limit");

const runtime = fs.readFileSync(new URL("../src/index_v37_lively_ambient.js", import.meta.url), "utf8");
assert.ok(runtime.includes('from "./index_v37_human_director.js"'), "lively ambient must retain authoritative direct-human routing below it");
assert.ok(runtime.includes("Generate ${LIVELY_AMBIENT_MIN_LINES}-${LIVELY_AMBIENT_MAX_LINES} short sends"), "prompt must request a multi-line room burst");
assert.ok(runtime.includes("using 2-4 ONLINE BOTS"), "prompt must restore multi-speaker room behavior");
assert.ok(runtime.includes("It is fine for a comment to be ignored"), "prompt must preserve natural messy chat behavior");
assert.ok(runtime.includes("this.callProvider(provider, this.livelyAmbientPrompt(now), LIVELY_AMBIENT_MAX_TOKENS)"), "ambient burst must use one provider request directly");
assert.equal(runtime.includes("super.generateBackgroundPlan()"), false, "do not restore the old multi-call Brain+Voice background planner");
assert.ok(runtime.includes("ambientBuiltInFillerBetweenCalls: false"), "healthy room must not be dominated by canned filler");
assert.ok(runtime.includes("ambientBuiltInOnlyOnProviderFailure: true"), "built-in chatter must be fallback-only when AI is healthy");
assert.ok(runtime.includes("closeExhaustedAmbientScenes(now)"), "overlong ambient scenes must be closed before another plan is generated");
assert.ok(runtime.includes("EXHAUSTED_SCENE_TURNS = 15"));
assert.ok(runtime.includes("safe.length < LIVELY_AMBIENT_MIN_LINES || distinctSpeakers.size < 2"), "output validator must require enough lines and multiple speakers");

// Live-capture regression: the v37 burst must not be filtered through the old
// v14/v16/v17 parse stack before its own 3-line / 2-speaker acceptance gate.
assert.ok(runtime.includes("function parseLivelyAmbientBurst"), "lively ambient must have a dedicated v37 burst parser");
assert.ok(runtime.includes("safe = parseLivelyAmbientBurst(result.content, activeNames, LIVELY_AMBIENT_MAX_LINES)"), "provider output must use the dedicated v37 parser");
assert.equal(runtime.includes("this.parseGroqMessages(extractJson(result.content)"), false, "lively ambient must not inherit legacy parser rejection layers");
assert.ok(runtime.includes("canonical.get(clean(raw?.speaker, 32).toLowerCase())"), "burst parser must canonicalize only currently active bot speakers");
assert.ok(runtime.includes("canonical.get(requestedTarget.toLowerCase()) || \"room\""), "invalid burst targets must fall safely back to room");

// Live-capture regression: explicit scene closure is terminal in production v37.
assert.ok(runtime.includes("sceneIsClosed(scene)"), "production v37 must recognize explicit closed scenes");
assert.ok(runtime.includes("explicitlyClosed.set(id"), "pruning must preserve explicit scene closure");
assert.ok(runtime.includes("closedSceneResurrectionBlocks"), "closed-scene resurrection attempts must be observable");
assert.ok(runtime.includes("if (!this.sceneIsClosed(scene)) return scene"), "scene lookup must refuse a closed scene");
assert.ok(runtime.includes("if (this.sceneIsClosed(scene))"), "scene touch must not reactivate a closed scene");

// Runtime diagnostics must describe the authoritative production path, not the old shadow era.
assert.ok(runtime.includes("shadowOnly: false"), "v37 diagnostics must no longer claim shadow-only mode");
assert.ok(runtime.includes("visibleRoutingChanges: true"), "v37 diagnostics must acknowledge visible routing changes");
assert.ok(runtime.includes("legacyPlannerAuthoritative: false"), "v37 diagnostics must not call the legacy planner authoritative");
assert.ok(runtime.includes("noVisibleRoutingChanges: false"), "top-level v37 diagnostics must clear the old no-visible-routing flag");
assert.ok(runtime.includes("ambientStillLegacyAuthoritative: false"), "ambient diagnostics must identify lively v37 as authoritative");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const directV37 = wrangler.includes('"main": "src/index_v37_lively_ambient.js"');
let wrappedV38 = false;
if (fs.existsSync(new URL("../src/index_v38_quality_guard.js", import.meta.url))) {
  const v38Entrypoint = fs.readFileSync(new URL("../src/index_v38_quality_guard.js", import.meta.url), "utf8");
  wrappedV38 = wrangler.includes('"main": "src/index_v38_quality_guard.js"')
    && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
}
assert.ok(directV37 || wrappedV38, "production entrypoint must use lively v37 directly or through an explicit v38 wrapper");

console.log("v37 lively AI-dominant ambient regression checks passed");
