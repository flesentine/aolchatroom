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
  "hardReadyProviders(now = Date.now()) {",
  "softReadyProviders(now = Date.now()) {",
  "preferredStructuredReadyProviders(now = Date.now()) {",
  "effectiveStructuredReadyProviders(now = Date.now()) {",
  "providerPoolDegraded(now = Date.now()) {",
  "queueV37DegradedFallback(now = Date.now(), forceSoon = false) {",
  "queueV37CapacitySheddingAmbient(now = Date.now(), forceSoon = false) {",
  "async refillSceneAi(now = Date.now(), force = false) {"
]) {
  assert.equal(
    extractMethod(readiness, signature),
    extractMethod(frozen, signature),
    `3G.8 extracted readiness/degraded method must remain byte-for-byte equivalent: ${signature}`
  );
}

const capacitySignature = "providerCapacityConstrained(now = Date.now()) {";
const frozenCapacity = extractMethod(frozen, capacitySignature);
const liveCapacity = extractMethod(readiness, capacitySignature);
const expectedLiveCapacity = frozenCapacity.replace(
  `  ${capacitySignature}\n`,
  `  ${capacitySignature}\n    const preferred = this.preferredStructuredReadyProviders?.(now) || [];\n    if (preferred.length >= 1) return false;\n`
);
assert.equal(
  liveCapacity,
  expectedLiveCapacity,
  "3G.14 live capacity policy must equal the frozen 3G.8 hotfix baseline plus only the one-preferred-provider override"
);

for (const marker of [
  "providerDegradedModeBuiltInFallback: true",
  "effectiveStructuredProviderReadiness: true",
  "humanPriorityProviderBudget: true",
  "ambientAiCapacityShedding: true"
]) {
  assert.ok(readiness.includes(marker), `3G.8 readiness status surface must retain ${marker}`);
}

for (const marker of [
  "noteProviderFailure(provider, status = 0",
  "requestLocalProviderFailuresDoNotTripGlobalCooldown: true"
]) {
  assert.ok(failover.includes(marker), `3G.9 failover owner must retain later provider-failure authority: ${marker}`);
}
for (const marker of ["stripInternalChatMetadata(original)", "internalMetadataOutputHygiene: true"]) {
  assert.ok(outputHygiene.includes(marker), `3G.10 output-hygiene owner must retain ${marker}`);
}
assert.ok(pausedShadow.includes("maybeRunV37Shadow(now = Date.now())"), "3G.11 paused-shadow owner must retain later shadow authority");

console.log("v41 Phase 3G.8 provider readiness/degraded fallback extraction checks passed");
