import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function extractMethod(source, signature) {
  const start = source.indexOf(`  ${signature}`);
  assert.ok(start >= 0, `missing method ${signature}`);
  const brace = source.indexOf("{", start);
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
const residual = read("src/index_v41_hotfix_residual_compat.js");

assert.ok(productionTurn.includes('from "./index_v41_provider_readiness_compat.js"'));
assert.ok(readiness.includes('from "./index_v41_provider_failover_compat.js"'));
assert.ok(failover.includes('from "./index_v41_hotfix_residual_compat.js"'));
assert.ok(residual.includes('from "./index_v37.js"'));

for (const signature of [
  "hardReadyProviders(now = Date.now()) {",
  "softReadyProviders(now = Date.now()) {",
  "preferredStructuredReadyProviders(now = Date.now()) {",
  "providerCapacityConstrained(now = Date.now()) {",
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

for (const method of [
  "hardReadyProviders",
  "softReadyProviders",
  "preferredStructuredReadyProviders",
  "providerCapacityConstrained",
  "effectiveStructuredReadyProviders",
  "providerPoolDegraded",
  "queueV37DegradedFallback",
  "queueV37CapacitySheddingAmbient",
  "refillSceneAi"
]) {
  assert.equal(ownsMethod(residual, method), false, `3G.8 residual must not retain ${method}()`);
}

for (const marker of [
  "providerDegradedModeBuiltInFallback: true",
  "effectiveStructuredProviderReadiness: true",
  "humanPriorityProviderBudget: true",
  "ambientAiCapacityShedding: true"
]) {
  assert.ok(readiness.includes(marker), `3G.8 readiness status surface must retain ${marker}`);
  assert.equal(residual.includes(marker), false, `3G.8 residual must not duplicate ${marker}`);
}

for (const marker of [
  "noteProviderFailure(provider, status = 0",
  "orderedReadyProviders(now = Date.now())",
  "requestLocalProviderFailuresDoNotTripGlobalCooldown: true"
]) {
  assert.ok(failover.includes(marker), `3G.9 failover owner must retain later provider authority: ${marker}`);
}
for (const marker of [
  "stripInternalChatMetadata(original)",
  "maybeRunV37Shadow(now = Date.now())",
  "internalMetadataOutputHygiene: true"
]) {
  assert.ok(residual.includes(marker), `3G.9 residual must retain later hygiene/shadow authority: ${marker}`);
}

console.log("v41 Phase 3G.8 provider readiness/degraded fallback extraction checks passed");
