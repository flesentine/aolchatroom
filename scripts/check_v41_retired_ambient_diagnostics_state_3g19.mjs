import assert from "node:assert/strict";
import fs from "node:fs";
import {
  V37_RETIRED_ADAPTIVE_AMBIENT_STATS,
  mergeV37HumanOnlySnapshot,
  mergeV37HumanOnlyStatus
} from "../src/human_only_legacy_diagnostics_v41.js";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const helper = read("src/human_only_legacy_diagnostics_v41.js");
const freeProviders = read("src/index_v41_free_providers_compat.js");
const workerContracts = read("test/runtime_generation_contract_worker.js");
const runtimeList = read("scripts/check_v41_generation_contract_runtime.mjs");

assert.equal(
  helper.includes("initializeV37HumanOnlyDiagnostics"),
  false,
  "3G.19 diagnostics helper must release the retired room-state initializer"
);
assert.equal(
  helper.includes("room.v37AdaptiveAmbientStats") || helper.includes("room.v37LastAmbientAiAt"),
  false,
  "3G.19 diagnostics helper must not read or write retired ambient room state"
);
assert.equal(
  freeProviders.includes("initializeV37HumanOnlyDiagnostics"),
  false,
  "3G.19 free-provider constructor must stop allocating retired ambient room state"
);

assert.deepEqual(V37_RETIRED_ADAPTIVE_AMBIENT_STATS, {
  ambientAiAttempts: 0,
  ambientAiSuccesses: 0,
  ambientAiFailures: 0,
  ambientAiOutputRejects: 0,
  ambientAiLines: 0,
  ambientBuiltInPlansGenerated: 0,
  ambientAiRateSkips: 0,
  ambientAiHumanPrioritySkips: 0
});
assert.equal(Object.isFrozen(V37_RETIRED_ADAPTIVE_AMBIENT_STATS), true, "3G.19 retired ambient compatibility payload must be immutable");

const room = {
  v37HumanFallbackStats: {
    humanModelFallbacks: 4,
    humanModelFallbackMisses: 2
  },
  preferredStructuredReadyProviders: () => ["gemini"]
};
const snapshot = mergeV37HumanOnlySnapshot(room, { mode: { sentinel: true } });
assert.equal(Object.prototype.hasOwnProperty.call(room, "v37AdaptiveAmbientStats"), false);
assert.equal(Object.prototype.hasOwnProperty.call(room, "v37LastAmbientAiAt"), false);
assert.equal(snapshot.mode.sentinel, true);
assert.deepEqual(
  {
    ambientAiAttempts: snapshot.adaptiveAmbientAi.ambientAiAttempts,
    ambientAiSuccesses: snapshot.adaptiveAmbientAi.ambientAiSuccesses,
    ambientAiFailures: snapshot.adaptiveAmbientAi.ambientAiFailures,
    ambientAiOutputRejects: snapshot.adaptiveAmbientAi.ambientAiOutputRejects,
    ambientAiLines: snapshot.adaptiveAmbientAi.ambientAiLines,
    ambientBuiltInPlansGenerated: snapshot.adaptiveAmbientAi.ambientBuiltInPlansGenerated,
    ambientAiRateSkips: snapshot.adaptiveAmbientAi.ambientAiRateSkips,
    ambientAiHumanPrioritySkips: snapshot.adaptiveAmbientAi.ambientAiHumanPrioritySkips
  },
  V37_RETIRED_ADAPTIVE_AMBIENT_STATS,
  "3G.19 historical ambient counter payload must remain exactly zero-valued"
);
assert.equal(snapshot.adaptiveAmbientAi.humanModelFallbacks, 4);
assert.equal(snapshot.adaptiveAmbientAi.humanModelFallbackMisses, 2);
assert.deepEqual(snapshot.adaptiveAmbientAi.preferredReadyProviders, ["gemini"]);
assert.equal(snapshot.adaptiveAmbientAi.nextIntervalMs, 90000);
assert.equal(snapshot.adaptiveAmbientAi.lastAmbientAiAgoMs, null);

const status = mergeV37HumanOnlyStatus({ v37: { sentinel: true } });
assert.equal(status.v37.sentinel, true);
assert.equal(status.v37.humanOnlyModelBudget, false);
assert.equal(status.v37.humanModelFailureFallsBackBuiltIn, true);

assert.ok(
  workerContracts.includes('contractV41RetiredAmbientDiagnosticsState()'),
  "3G.19 real-Worker contract must cover stateless historical diagnostics"
);
assert.ok(
  runtimeList.includes('"v41-retired-ambient-diagnostics-state"'),
  "3G.19 real-Worker contract must remain active"
);

console.log("v41 Phase 3G.19 retired ambient diagnostic state checks passed");
