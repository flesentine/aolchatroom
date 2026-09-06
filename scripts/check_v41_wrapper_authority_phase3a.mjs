import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const v37Hotfix = read("src/index_v37_hotfix.js");
const v37HumanOnly = read("src/index_v37_human_only.js");
const v37Providers = read("src/index_v37_free_providers.js");
const v37Director = read("src/index_v37_human_director.js");
const v37Lively = read("src/index_v37_lively_ambient.js");
const v38 = read("src/index_v38_quality_guard.js");
const v39Coherence = read("src/index_v39_coherence.js");
const v39Presence = read("src/index_v39_presence_fix.js");
const v39World = read("src/index_v39_world_gate.js");
const v40 = read("src/index_v40_scene_continuity.js");
const v41AmbientCompat = read("src/index_v41_ambient_continuity_compat.js");
const v41PresenceCompat = read("src/index_v41_presence_compat.js");
const v41CoherenceCompat = read("src/index_v41_coherence_compat.js");
const v41QualityCompat = read("src/index_v41_quality_compat.js");
const v41LivelyCompat = read("src/index_v41_lively_ambient_compat.js");
const v41HumanDirectorCompat = read("src/index_v41_human_director_compat.js");
const v41FreeProvidersCompat = read("src/index_v41_free_providers_compat.js");
const v41HumanOnlyCompat = read("src/index_v41_human_only_compat.js");
const v41Scene = read("src/index_v41_scene_coordinator.js");
const v41Reconnect = read("src/index_v41_human_reconnect.js");
const v41Coherence = read("src/index_v41_coherence_repair.js");
const v41WorldDate = read("src/index_v41_world_date_guard.js");
const v41Roster = read("src/index_v41_bot_roster_reentry.js");
const v41GenerationBase = read("src/index_v41_generation_contract_base.js");
const v41Generation = read("src/index_v41_generation_contract.js");
const wrangler = read("wrangler.jsonc");

// Production still enters through the Phase 2 v41 wrapper.
assert.ok(wrangler.includes('"main": "src/index_v41_generation_contract.js"'));
assert.ok(wrangler.includes('"DEPLOY_VERSION": "41"'));

// The inherited chain remains explicit. Phase 3A is characterization-only.
assert.ok(v41Generation.includes('from "./index_v41_coherence_repair.js"'), "final Phase 2 Voice must still call through 3C explicitly");
assert.ok(v41GenerationBase.includes('from "./index_v41_bot_roster_reentry.js"'), "production base inheritance must enter Phase 3E");
assert.ok(v41Roster.includes('from "./index_v41_world_date_guard.js"'), "Phase 3E must remain additive above Phase 3D");
assert.ok(v41WorldDate.includes('from "./index_v41_coherence_repair.js"'), "Phase 3D must remain additive above Phase 3C");
assert.ok(v41Coherence.includes('from "./index_v41_human_reconnect.js"'), "Phase 3C must remain additive above Phase 3B");
assert.ok(v41Reconnect.includes('from "./index_v41_scene_coordinator.js"'), "Phase 3B must remain additive above scene authority");
assert.ok(v41Scene.includes('from "./index_v41_ambient_continuity_compat.js"'), "3F.1 production scene layer must use the v41 ambient compatibility spine");
assert.ok(v41AmbientCompat.includes('from "./index_v41_presence_compat.js"'), "3F.2 v41 compatibility spine must use the v41 presence compatibility layer");
assert.ok(v41PresenceCompat.includes('from "./index_v41_coherence_compat.js"'), "3F.3 presence compatibility must use the v41 coherence compatibility layer");
assert.ok(v41CoherenceCompat.includes('from "./index_v41_quality_compat.js"'), "3F.4 coherence compatibility must use the v41 quality compatibility layer");
assert.ok(v41QualityCompat.includes('from "./index_v41_lively_ambient_compat.js"'), "3G.2 quality compatibility must bypass the retired v37 lively wrapper");
assert.ok(v41LivelyCompat.includes('from "./index_v41_human_director_compat.js"'), "3G.3 lively compatibility must use the v41 human Director compatibility layer");
assert.ok(v41HumanDirectorCompat.includes('from "./index_v41_free_providers_compat.js"'), "3G.4 human Director compatibility must route through the v41 provider compatibility owner");
assert.ok(v41FreeProvidersCompat.includes('from "./index_v41_human_only_compat.js"'), "3G.5 provider compatibility must route through the residual v41 human-only owner");
assert.ok(v41HumanOnlyCompat.includes('from "./index_v37_hotfix.js"'), "3G.5 residual human-only owner must preserve the v37 hotfix baseline");
assert.ok(!v41CoherenceCompat.includes('from "./index_v38_quality_guard.js"'), "v38 quality must be retired from v41 production inheritance");
assert.ok(!v41PresenceCompat.includes('from "./index_v39_coherence.js"'), "v39 coherence must be retired from v41 production inheritance");
assert.ok(!v41PresenceCompat.includes('from "./index_v39_presence_fix.js"'), "v39 presence must be retired from v41 production inheritance");
assert.ok(!v41AmbientCompat.includes('from "./index_v39_world_gate.js"'), "v39 world must be retired from v41 production inheritance");
assert.ok(v40.includes('from "./index_v39_world_gate.js"'), "frozen v40 must retain the original v39 world wrapper");
assert.ok(v39World.includes('from "./index_v39_presence_fix.js"'));
assert.ok(v39Presence.includes('from "./index_v39_coherence.js"'));
assert.ok(v39Coherence.includes('from "./index_v38_quality_guard.js"'));

// v39 coherence mixed responsibilities that must be extracted separately.
assert.ok(v39Coherence.includes("resolveDirectTarget(text, sender ="));
assert.ok(v39Coherence.includes("inferClarificationTarget("));
assert.ok(v39Coherence.includes("async voiceBrainPlan(plan, active, human = null)"));
assert.ok(v39Coherence.includes("withCoherenceConstraint(plan, this.history || [], human)"));
assert.ok(v39Coherence.includes("futureEventViolation(text, now)"));
assert.ok(v39Coherence.includes('violation?.kind === "future-era-event"'));
assert.ok(v39Coherence.includes("historicalAudit(includeAll = false)"));
assert.ok(v39Coherence.includes("queueScenePlan(lines, reason ="));
assert.ok(v39Coherence.includes('if (reason !== "background") return super.queueScenePlan'));
assert.ok(v39Coherence.includes("v39ReentryRemaining(name, now = Date.now())"));
assert.ok(v39Coherence.includes("desiredRoster(now = Date.now())"));
assert.ok(v39Coherence.includes("announceBotLeave(name, now = Date.now())"));
assert.ok(v39Coherence.includes("announceBotEnter(name, now = Date.now())"));
assert.ok(v39Coherence.includes("V39_HUMAN_RECONNECT_GRACE_MS = 5000"));
assert.ok(v39Coherence.includes("webSocketClose(ws, code = 1005, reason ="));
assert.ok(v39Coherence.includes("await sleep(V39_HUMAN_RECONNECT_GRACE_MS)"));
assert.ok(v39Coherence.includes('action: "v39-transient-human-reconnect"'));

// Presence is a cooperating authority for reconnect and logical human identity.
assert.ok(v39Presence.includes("humanNames()"));
assert.ok(v39Presence.includes("activeHumanConnectionCount(name)"));
assert.ok(v39Presence.includes("replaceExistingHumanSessions(name, now = Date.now())"));
assert.ok(v39Presence.includes("async generateGroqBatch()"));
assert.ok(v39Presence.includes("legacyQuickBackgroundCallsSuppressed"));
assert.ok(v39Presence.includes("historicalDateMismatch(text, now)"));
assert.ok(v39Presence.includes("auditHistoricalDateClaims(this.history || [], floor)"));
assert.ok(v39Presence.includes("isExplicitErrorChallenge(human?.text || \"\")"));
assert.ok(v39Presence.includes("applyErrorChallengePlan(plan, human)"));
assert.ok(v39Presence.includes("webSocketClose(ws, code = 1005, reason ="));
assert.ok(v39Presence.includes("return super.webSocketClose(ws, code, reason, wasClean)"));

// World and quality gates remain live above/below that hotspot.
assert.ok(v39World.includes("lineViolation("));
assert.ok(v39World.includes("futureGameProductViolation(text, now, context)"));
assert.ok(v39World.includes("auditedPublicClaimViolation(text"));
assert.ok(v39World.includes("normalizeEraConsoleLabels(text)"));
assert.ok(v38.includes("lineViolation("));
assert.ok(v38.includes("hardEraViolation(text, now)"));
assert.ok(v38.includes("detectRoomTopicFatigue(now = Date.now())"));
assert.ok(v38.includes("applyRoomTopicFatigue(now = Date.now())"));
assert.ok(v38.includes("filterFatiguedBackgroundLines(lines, cooling)"));
assert.ok(v38.includes("auditEraHistory(this.history || [], floor)"));
assert.ok(v38.includes("v38Snapshot(now = Date.now())"));

// Older v37 wrappers remain live for infrastructure/provider/director/ambient duties.
assert.ok(v37Hotfix.includes("hardReadyProviders(now = Date.now())"));
assert.ok(v37Hotfix.includes("softReadyProviders(now = Date.now())"));
assert.ok(v37Hotfix.includes("preferredStructuredReadyProviders(now = Date.now())"));
assert.ok(v37Hotfix.includes("effectiveStructuredReadyProviders(now = Date.now())"));
assert.ok(v37Hotfix.includes("providerPoolDegraded(now = Date.now())"));
assert.ok(v37Hotfix.includes("queueV37DegradedFallback(now = Date.now(), forceSoon = false)"));
assert.ok(v37Hotfix.includes("queueV37CapacitySheddingAmbient(now = Date.now(), forceSoon = false)"));
assert.ok(v37Hotfix.includes("requestV37ProductionTurn(source, forceSoon = false)"));
assert.ok(v37Hotfix.includes("this.v37ProductionTurnGate.request(source, Boolean(forceSoon))"));
assert.ok(v37Hotfix.includes("noteProviderFailure(provider, status = 0, response = null, detail ="));
assert.ok(v37Hotfix.includes("isWorkersAiDailyQuotaExhaustion(provider, detail)"));
assert.ok(v37Hotfix.includes("isRequestLocalProviderFailure(status)"));
assert.ok(v37Hotfix.includes("stripInternalChatMetadata(original)"));
assert.ok(v37Hotfix.includes("maybeRunV37Shadow(now = Date.now())"));
assert.ok(v37Hotfix.includes("v37ProviderFailoverSnapshot(now = Date.now())"));
assert.ok(v37HumanOnly.includes("providerCapacityConstrained"));
assert.ok(v37Providers.includes("orderedReadyProviders"));
assert.ok(v37Director.includes("generateHumanReplan"));
assert.ok(v37Lively.includes("generateBackgroundPlan"));

// v41 must remain the authority for the responsibilities already consolidated.
for (const source of [v40, v41AmbientCompat]) {
  assert.ok(source.includes("currentAmbientMomentum(now = Date.now())"));
  assert.ok(source.includes("sceneMomentumPrompt(momentum)"));
  assert.ok(source.includes("selectCarryIndices"));
  assert.ok(source.includes("v40ObservationStats.backgroundQueueAttempts"));
  assert.ok(source.includes("v40Snapshot(now = Date.now())"));
}
assert.ok(v41Scene.includes("sceneLifecycleAuthority()"));
assert.ok(v41Generation.includes("evaluatePrimaryHumanVoice"));
assert.ok(v41Generation.includes("evaluateHumanReplanPrimaryResponse"));

console.log("v41 Phase 3A remaining-wrapper authority characterization passed");
