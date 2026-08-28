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

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wrangler.includes('"main": "src/index_v37_lively_ambient.js"'), "production entrypoint must use lively ambient wrapper");

console.log("v37 lively AI-dominant ambient regression checks passed");
