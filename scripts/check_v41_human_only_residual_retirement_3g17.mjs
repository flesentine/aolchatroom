import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeV37HumanOnlyDiagnostics,
  mergeV37HumanOnlySnapshot,
  mergeV37HumanOnlyStatus
} from "../src/human_only_legacy_diagnostics_v41.js";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const retainedResidual = read("src/index_v41_human_only_compat.js");
const freeProviders = read("src/index_v41_free_providers_compat.js");
const helper = read("src/human_only_legacy_diagnostics_v41.js");

const productionOwnerPaths = [
  "src/index_v41_generation_contract_base.js",
  "src/index_v41_bot_roster_reentry.js",
  "src/index_v41_world_date_guard.js",
  "src/index_v41_coherence_repair.js",
  "src/index_v41_human_reconnect.js",
  "src/index_v41_scene_coordinator.js",
  "src/index_v41_ambient_continuity_compat.js",
  "src/index_v41_presence_compat.js",
  "src/index_v41_coherence_compat.js",
  "src/index_v41_quality_compat.js",
  "src/index_v41_lively_ambient_compat.js",
  "src/index_v41_human_director_compat.js",
  "src/index_v41_free_providers_compat.js",
  "src/index_v41_production_turn_compat.js",
  "src/index_v41_provider_readiness_compat.js",
  "src/index_v41_provider_failover_compat.js",
  "src/index_v41_output_hygiene_compat.js",
  "src/index_v41_paused_shadow_compat.js"
];
const productionSpine = productionOwnerPaths.map(read).join("\n");

assert.ok(
  freeProviders.includes('from "./index_v41_production_turn_compat.js"'),
  "3G.17 free providers must inherit/fetch directly from production-turn"
);
assert.ok(
  freeProviders.includes('from "./human_only_legacy_diagnostics_v41.js"'),
  "3G.17 free providers must consume the extracted diagnostics helper"
);
assert.ok(
  freeProviders.includes("export class ChatRoom extends ProductionTurnChatRoom"),
  "3G.17 free-provider class must directly extend ProductionTurnChatRoom"
);
assert.equal(
  productionSpine.includes('from "./index_v41_human_only_compat.js"'),
  false,
  "3G.17 no v41 production dependency edge may reference the retired human-only residual"
);
assert.equal(
  productionSpine.includes("index_v41_human_only_compat.js"),
  false,
  "3G.17 retired human-only residual path must be absent from the v41 production spine"
);

for (const marker of [
  "humanOnlyModelBudget: false",
  "ambientModelGenerationDisabled: false",
  "adaptiveAmbientAi: true",
  "ambientSingleProviderAttempt: true",
  "ambientSingleCallExchange: true",
  "humanModelFailureFallsBackBuiltIn: true",
  "ambientAiAttempts: 0",
  "ambientAiSuccesses: 0",
  "ambientAiFailures: 0",
  "ambientAiOutputRejects: 0",
  "ambientAiLines: 0",
  "ambientBuiltInPlansGenerated: 0",
  "ambientAiRateSkips: 0",
  "ambientAiHumanPrioritySkips: 0",
  "humanModelFallbacks: Number(room.v37HumanFallbackStats?.humanModelFallbacks || 0)",
  "humanModelFallbackMisses: Number(room.v37HumanFallbackStats?.humanModelFallbackMisses || 0)"
]) {
  assert.ok(helper.includes(marker), `3G.17 diagnostics helper must preserve marker: ${marker}`);
}

const room = {
  v37HumanFallbackStats: {
    humanModelFallbacks: 3,
    humanModelFallbackMisses: 2
  },
  preferredStructuredReadyProviders: () => ["gemini"]
};
initializeV37HumanOnlyDiagnostics(room);
assert.equal(room.v37LastAmbientAiAt, 0);
assert.deepEqual(room.v37AdaptiveAmbientStats, {
  ambientAiAttempts: 0,
  ambientAiSuccesses: 0,
  ambientAiFailures: 0,
  ambientAiOutputRejects: 0,
  ambientAiLines: 0,
  ambientBuiltInPlansGenerated: 0,
  ambientAiRateSkips: 0,
  ambientAiHumanPrioritySkips: 0
});

const status = mergeV37HumanOnlyStatus({ v37: { sentinel: true } });
assert.equal(status.v37.sentinel, true);
assert.equal(status.v37.humanOnlyModelBudget, false);
assert.equal(status.v37.adaptiveAmbientAi, true);
assert.equal(status.v37.humanModelFailureFallsBackBuiltIn, true);

const snapshot = mergeV37HumanOnlySnapshot(room, { mode: { sentinel: true } });
assert.equal(snapshot.mode.sentinel, true);
assert.equal(snapshot.mode.humanOnlyModelBudget, false);
assert.equal(snapshot.mode.adaptiveAmbientAi, true);
assert.equal(snapshot.adaptiveAmbientAi.humanModelFallbacks, 3);
assert.equal(snapshot.adaptiveAmbientAi.humanModelFallbackMisses, 2);
assert.deepEqual(snapshot.adaptiveAmbientAi.preferredReadyProviders, ["gemini"]);
assert.equal(snapshot.adaptiveAmbientAi.nextIntervalMs, 90000);
assert.equal(snapshot.adaptiveAmbientAi.lastAmbientAiAgoMs, null);

assert.ok(
  retainedResidual.includes('from "./index_v41_production_turn_compat.js"'),
  "retained historical residual source must remain readable for prior-phase proof"
);

console.log("v41 Phase 3G.17 human-only residual retirement checks passed");
