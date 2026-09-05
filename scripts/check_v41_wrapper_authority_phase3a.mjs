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
const v41Scene = read("src/index_v41_scene_coordinator.js");
const v41Reconnect = read("src/index_v41_human_reconnect.js");
const v41Coherence = read("src/index_v41_coherence_repair.js");
const v41Generation = read("src/index_v41_generation_contract.js");
const wrangler = read("wrangler.jsonc");

// Production still enters through the Phase 2 v41 wrapper.
assert.ok(wrangler.includes('"main": "src/index_v41_generation_contract.js"'));
assert.ok(wrangler.includes('"DEPLOY_VERSION": "41"'));

// The inherited chain remains explicit. Phase 3A is characterization-only.
assert.ok(v41Generation.includes('from "./index_v41_coherence_repair.js"'));
assert.ok(v41Coherence.includes('from "./index_v41_human_reconnect.js"'));
assert.ok(v41Reconnect.includes('from "./index_v41_scene_coordinator.js"'));
assert.ok(v41Scene.includes('from "./index_v40_scene_continuity.js"'));
assert.ok(v40.includes('from "./index_v39_world_gate.js"'));
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
assert.ok(v40.includes("currentAmbientMomentum(now = Date.now())"));
assert.ok(v40.includes("sceneMomentumPrompt(momentum)"));
assert.ok(v40.includes("selectCarryIndices"));
assert.ok(v40.includes("v40ObservationStats.backgroundQueueAttempts"));
assert.ok(v40.includes("v40Snapshot(now = Date.now())"));
assert.ok(v41Scene.includes("sceneLifecycleAuthority()"));
assert.ok(v41Generation.includes("evaluatePrimaryHumanVoice"));
assert.ok(v41Generation.includes("evaluateHumanReplanPrimaryResponse"));

console.log("v41 Phase 3A remaining-wrapper authority characterization passed");
