import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AMBIENT_AI_ONE_PRIMARY_INTERVAL_MS,
  AMBIENT_AI_TWO_PRIMARY_INTERVAL_MS,
  adaptiveAmbientAiEligible,
  ambientAiIntervalMs
} from "../src/adaptive_ambient_policy_v37.js";

assert.equal(ambientAiIntervalMs(0), Infinity);
assert.equal(ambientAiIntervalMs(1), AMBIENT_AI_ONE_PRIMARY_INTERVAL_MS);
assert.equal(ambientAiIntervalMs(2), AMBIENT_AI_TWO_PRIMARY_INTERVAL_MS);
assert.ok(AMBIENT_AI_ONE_PRIMARY_INTERVAL_MS > AMBIENT_AI_TWO_PRIMARY_INTERVAL_MS);

assert.deepEqual(
  adaptiveAmbientAiEligible({ now: 100000, readyPreferredCount: 1, lastAmbientAiAt: 0, pendingHumanCount: 0, aiQueueLength: 0 }),
  { ok: true, reason: "ready", intervalMs: AMBIENT_AI_ONE_PRIMARY_INTERVAL_MS }
);
assert.equal(adaptiveAmbientAiEligible({ now: 100000, readyPreferredCount: 1, pendingHumanCount: 1 }).reason, "human-pending");
assert.equal(adaptiveAmbientAiEligible({ now: 100000, readyPreferredCount: 1, aiQueueLength: 1 }).reason, "queue-not-empty");
assert.equal(adaptiveAmbientAiEligible({ now: 100000, readyPreferredCount: 0 }).reason, "no-preferred-provider");
assert.equal(
  adaptiveAmbientAiEligible({ now: 100000, readyPreferredCount: 1, lastAmbientAiAt: 99999 }).reason,
  "ambient-rate-limit"
);

const worker = fs.readFileSync(new URL("../src/index_v37_human_only.js", import.meta.url), "utf8");
const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.ok(worker.includes("async generateAdaptiveAmbientAi(now = Date.now())"));
assert.ok(worker.includes("this.callProvider(provider, this.ambientAiPrompt(), AMBIENT_AI_MAX_TOKENS)"));
assert.equal(worker.includes("super.generateBackgroundPlan()"), false, "ambient AI must not restore the multi-call Brain+Voice background planner");
assert.ok(worker.includes("Generate exactly TWO short consecutive bot lines"));
assert.ok(worker.includes("ambientSingleProviderAttempt: true"));
assert.ok(worker.includes("ambientSingleCallExchange: true"));
assert.ok(worker.includes("adaptiveAmbientAi: true"));
assert.ok(worker.includes("humanOnlyModelBudget: false"));
assert.ok(worker.includes("ambientModelGenerationDisabled: false"));
assert.ok(worker.includes("async generateHumanReplan(human)"));
assert.ok(worker.includes("const lines = await super.generateHumanReplan(human)"));
assert.ok(worker.includes("ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)"));
assert.ok(worker.includes("AI human reply fallback · built-in"));
assert.ok(wrangler.includes('"main": "src/index_v37_human_only.js"'));

console.log("v37 adaptive ambient AI budget regression checks passed");
