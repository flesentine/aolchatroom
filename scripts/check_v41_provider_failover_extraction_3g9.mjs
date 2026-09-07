import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function extractMethod(source, signature) {
  const start = source.indexOf(`  ${signature}`);
  assert.ok(start >= 0, `missing method ${signature}`);
  const brace = start + signature.lastIndexOf("{");
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`unterminated method ${signature}`);
}

function ownsMethod(source, name) {
  return source.split("\n").some((line) =>
    line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`)
  );
}

const frozen = read("src/index_v37_hotfix.js");
const productionTurn = read("src/index_v41_production_turn_compat.js");
const readiness = read("src/index_v41_provider_readiness_compat.js");
const failover = read("src/index_v41_provider_failover_compat.js");
const freeProviders = read("src/index_v41_free_providers_compat.js");
const outputHygiene = read("src/index_v41_output_hygiene_compat.js");
const pausedShadow = read("src/index_v41_paused_shadow_compat.js");
const sharedStats = read("src/production_turn_stats_v41.js");

assert.ok(productionTurn.includes('from "./index_v41_provider_readiness_compat.js"'));
assert.ok(readiness.includes('from "./index_v41_provider_failover_compat.js"'));
assert.ok(failover.includes('from "./index_v41_output_hygiene_compat.js"'));
assert.ok(outputHygiene.includes('from "./index_v41_paused_shadow_compat.js"'));
assert.ok(pausedShadow.includes('from "./index_v37.js"'));
assert.ok(pausedShadow.includes('from "./production_turn_stats_v41.js"'));
assert.ok(sharedStats.includes("createV37ProductionTurnStats"));

for (const signature of [
  'noteProviderFailure(provider, status = 0, response = null, detail = "") {',
  "v37ProviderFailoverSnapshot(now = Date.now()) {"
]) {
  assert.equal(
    extractMethod(failover, signature),
    extractMethod(frozen, signature),
    `3G.9 extracted provider-failover method must remain byte-for-byte equivalent: ${signature}`
  );
}

assert.equal(ownsMethod(failover, "orderedReadyProviders"), false, "3G.9 lower failover owner must not falsely claim live provider ordering");
assert.equal(ownsMethod(freeProviders, "orderedReadyProviders"), true, "3G.4 free-provider owner must remain the live v41 provider ordering authority");
assert.ok(freeProviders.includes("orderedExtendedProviders({"));
assert.ok(freeProviders.includes("structuredGenerationDepth: this.v35StructuredGenerationDepth"));

for (const marker of [
  "this.v37WorkersDailyQuotaResetAt = 0",
  "isWorkersAiDailyQuotaExhaustion(provider, detail)",
  "nextUtcDailyQuotaResetAt(now)",
  "isRequestLocalProviderFailure(status)",
  "requestLocalProviderFailuresDoNotTripGlobalCooldown: true",
  "emergencyWorkersBrainFallback: true",
  "workersAiDailyQuotaState: true",
  "providerFailover: this.v37ProviderFailoverSnapshot(Date.now())"
]) {
  assert.ok(failover.includes(marker), `3G.9 provider-failover owner must preserve marker: ${marker}`);
}

assert.ok(sharedStats.includes("createV37ProductionTurnStats"), "3G.12 must keep shared stats in the state factory");
for (const marker of ["stripInternalChatMetadata(original)", "internalMetadataOutputHygiene: true"]) {
  assert.ok(outputHygiene.includes(marker), `3G.10 must preserve output hygiene: ${marker}`);
}
for (const marker of ['deferReason = "live-model-shadow-paused"', "liveAiShadowPausedForProviderStability: true"]) {
  assert.ok(pausedShadow.includes(marker), `3G.11 must preserve paused shadow: ${marker}`);
}

console.log("v41 Phase 3G.9 provider failure/quota extraction checks passed; live ordering remains with 3G.4 free-provider authority");
