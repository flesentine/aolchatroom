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
const providerWrapper = fs.readFileSync(new URL("../src/index_v37_free_providers.js", import.meta.url), "utf8");
const directorWrapper = fs.readFileSync(new URL("../src/index_v37_human_director.js", import.meta.url), "utf8");
const livelyWrapper = fs.readFileSync(new URL("../src/index_v37_lively_ambient.js", import.meta.url), "utf8");
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
assert.ok(providerWrapper.includes('from "./index_v37_human_only.js"'));
assert.ok(providerWrapper.includes("preferredStructuredReadyProviders(now = Date.now())"), "extended provider wrapper must feed Mistral/Vercel into ambient readiness");
assert.ok(directorWrapper.includes('from "./index_v37_free_providers.js"'), "human Director wrapper must retain adaptive/provider layers beneath it");
assert.ok(livelyWrapper.includes('from "./index_v37_human_director.js"'), "production lively layer must retain human Director beneath it");

const directV37 = wrangler.includes('"main": "src/index_v37_lively_ambient.js"');
const v38Url = new URL("../src/index_v38_quality_guard.js", import.meta.url);
const v39Url = new URL("../src/index_v39_coherence.js", import.meta.url);
const v39PresenceUrl = new URL("../src/index_v39_presence_fix.js", import.meta.url);
const v38Entrypoint = fs.existsSync(v38Url) ? fs.readFileSync(v38Url, "utf8") : "";
const wrappedV38 = wrangler.includes('"main": "src/index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39Entrypoint = fs.existsSync(v39Url) ? fs.readFileSync(v39Url, "utf8") : "";
const wrappedV39 = wrangler.includes('"main": "src/index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39PresenceEntrypoint = fs.existsSync(v39PresenceUrl) ? fs.readFileSync(v39PresenceUrl, "utf8") : "";
const wrappedV39Presence = wrangler.includes('"main": "src/index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
assert.ok(directV37 || wrappedV38 || wrappedV39 || wrappedV39Presence, "production must retain lively v37 through an explicit v37/v38/v39 wrapper chain");

console.log("v37 adaptive ambient safety layer remains intact beneath lively production ambient");
