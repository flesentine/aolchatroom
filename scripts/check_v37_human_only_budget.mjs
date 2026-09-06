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
const v39WorldUrl = new URL("../src/index_v39_world_gate.js", import.meta.url);
const v40Url = new URL("../src/index_v40_scene_continuity.js", import.meta.url);
const v41CompatUrl = new URL("../src/index_v41_ambient_continuity_compat.js", import.meta.url);
const v41PresenceCompatUrl = new URL("../src/index_v41_presence_compat.js", import.meta.url);
const v41CoherenceCompatUrl = new URL("../src/index_v41_coherence_compat.js", import.meta.url);
const v41QualityCompatUrl = new URL("../src/index_v41_quality_compat.js", import.meta.url);
const v41LivelyCompatUrl = new URL("../src/index_v41_lively_ambient_compat.js", import.meta.url);
const v41HumanDirectorCompatUrl = new URL("../src/index_v41_human_director_compat.js", import.meta.url);
const v41Url = new URL("../src/index_v41_scene_coordinator.js", import.meta.url);
const v41ReconnectUrl = new URL("../src/index_v41_human_reconnect.js", import.meta.url);
const v41CoherenceUrl = new URL("../src/index_v41_coherence_repair.js", import.meta.url);
const v41GenerationUrl = new URL("../src/index_v41_generation_contract.js", import.meta.url);
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
const v39WorldEntrypoint = fs.existsSync(v39WorldUrl) ? fs.readFileSync(v39WorldUrl, "utf8") : "";
const wrappedV39World = wrangler.includes('"main": "src/index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v40Entrypoint = fs.existsSync(v40Url) ? fs.readFileSync(v40Url, "utf8") : "";
const wrappedV40 = wrangler.includes('"main": "src/index_v40_scene_continuity.js"')
  && v40Entrypoint.includes('from "./index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v41CompatEntrypoint = fs.existsSync(v41CompatUrl) ? fs.readFileSync(v41CompatUrl, "utf8") : "";
const v41PresenceCompatEntrypoint = fs.existsSync(v41PresenceCompatUrl) ? fs.readFileSync(v41PresenceCompatUrl, "utf8") : "";
const v41CoherenceCompatEntrypoint = fs.existsSync(v41CoherenceCompatUrl) ? fs.readFileSync(v41CoherenceCompatUrl, "utf8") : "";
const v41QualityCompatEntrypoint = fs.existsSync(v41QualityCompatUrl) ? fs.readFileSync(v41QualityCompatUrl, "utf8") : "";
const v41LivelyCompatEntrypoint = fs.existsSync(v41LivelyCompatUrl) ? fs.readFileSync(v41LivelyCompatUrl, "utf8") : "";
const v41HumanDirectorCompatEntrypoint = fs.existsSync(v41HumanDirectorCompatUrl) ? fs.readFileSync(v41HumanDirectorCompatUrl, "utf8") : "";
const v41Entrypoint = fs.existsSync(v41Url) ? fs.readFileSync(v41Url, "utf8") : "";
const wrappedV41 = wrangler.includes('"main": "src/index_v41_scene_coordinator.js"')
  && v41Entrypoint.includes('from "./index_v41_ambient_continuity_compat.js"')
  && v41CompatEntrypoint.includes('from "./index_v41_presence_compat.js"')
  && v41PresenceCompatEntrypoint.includes('from "./index_v41_coherence_compat.js"')
  && v41CoherenceCompatEntrypoint.includes('from "./index_v41_quality_compat.js"')
  && v41QualityCompatEntrypoint.includes('from "./index_v41_lively_ambient_compat.js"')
  && v41LivelyCompatEntrypoint.includes('from "./index_v41_human_director_compat.js"')
  && v41HumanDirectorCompatEntrypoint.includes('from "./index_v41_free_providers_compat.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v41ReconnectEntrypoint = fs.existsSync(v41ReconnectUrl) ? fs.readFileSync(v41ReconnectUrl, "utf8") : "";
const v41CoherenceEntrypoint = fs.existsSync(v41CoherenceUrl) ? fs.readFileSync(v41CoherenceUrl, "utf8") : "";
const v41GenerationEntrypoint = fs.existsSync(v41GenerationUrl) ? fs.readFileSync(v41GenerationUrl, "utf8") : "";
const wrappedV41Generation = wrangler.includes('"main": "src/index_v41_generation_contract.js"')
  && (
    v41GenerationEntrypoint.includes('from "./index_v41_scene_coordinator.js"')
    || (
      v41GenerationEntrypoint.includes('from "./index_v41_coherence_repair.js"')
      && v41CoherenceEntrypoint.includes('from "./index_v41_human_reconnect.js"')
      && v41ReconnectEntrypoint.includes('from "./index_v41_scene_coordinator.js"')
    )
  )
  && v41Entrypoint.includes('from "./index_v41_ambient_continuity_compat.js"')
  && v41CompatEntrypoint.includes('from "./index_v41_presence_compat.js"')
  && v41PresenceCompatEntrypoint.includes('from "./index_v41_coherence_compat.js"')
  && v41CoherenceCompatEntrypoint.includes('from "./index_v41_quality_compat.js"')
  && v41QualityCompatEntrypoint.includes('from "./index_v41_lively_ambient_compat.js"')
  && v41LivelyCompatEntrypoint.includes('from "./index_v41_human_director_compat.js"')
  && v41HumanDirectorCompatEntrypoint.includes('from "./index_v41_free_providers_compat.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
assert.ok(directV37 || wrappedV38 || wrappedV39 || wrappedV39Presence || wrappedV39World || wrappedV40 || wrappedV41 || wrappedV41Generation, "production must retain lively v37 through an explicit v37/v38/v41 compatibility chain");

console.log("v37 adaptive ambient safety layer remains intact beneath lively production ambient");
