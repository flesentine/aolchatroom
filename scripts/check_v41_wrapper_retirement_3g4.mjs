import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function ownsMethod(source, name) {
  return source.split("\n").some((line) =>
    line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`)
  );
}

function methodBlock(source, name) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) =>
    line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`)
  );
  assert.ok(start >= 0, `missing method ${name}()`);
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line === "}" || /^  (?:async )?[A-Za-z0-9_$]+\(/.test(line)) break;
    end += 1;
  }
  return lines.slice(start, end).join("\n");
}

const humanCompat = read("src/index_v41_human_director_compat.js");
const providerCompat = read("src/index_v41_free_providers_compat.js");
const frozenProvider = read("src/index_v37_free_providers.js");
const frozenHumanOnly = read("src/index_v37_human_only.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");
const scene = read("src/index_v41_scene_coordinator.js");
const ambient = read("src/index_v41_ambient_continuity_compat.js");
const presence = read("src/index_v41_presence_compat.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");
const qualityCompat = read("src/index_v41_quality_compat.js");
const livelyCompat = read("src/index_v41_lively_ambient_compat.js");

assert.ok(humanCompat.includes('from "./index_v41_free_providers_compat.js"'));
assert.ok(!humanCompat.includes('from "./index_v37_free_providers.js"'));
assert.ok(providerCompat.includes('from "./index_v41_production_turn_compat.js"'));
assert.ok(providerCompat.includes('from "./human_only_legacy_diagnostics_v41.js"'));
assert.ok(!providerCompat.includes('from "./index_v41_human_only_compat.js"'));
assert.ok(frozenProvider.includes('from "./index_v37_human_only.js"'));
assert.equal(
  fs.existsSync(new URL("../src/index_v41_human_only_compat.js", import.meta.url)),
  false,
  "3G.18 retired v41 human-only residual source must stay deleted"
);
assert.ok(frozenHumanOnly.includes('from "./index_v37_hotfix.js"'));

for (const method of [
  "configuredProviders",
  "preferredStructuredReadyProviders",
  "effectiveStructuredReadyProviders",
  "providerPoolDegraded",
  "orderedReadyProviders",
  "noteExtendedProvider",
  "callOpenAiCompatible",
  "callMistralProvider",
  "callVercelAiGatewayProvider",
  "callOpenRouterProvider",
  "callHuggingFaceProvider",
  "callCerebrasProvider",
  "callCohereTrialProvider",
  "callProvider",
  "providerEvent",
  "say",
  "v37ProviderFailoverSnapshot",
  "fetch",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(providerCompat, method), true, `3G.4 must preserve ${method}()`);
}

for (const marker of [
  "this.v37ExtendedProviderStats = {",
  "configuredExtendedProviders(this.env || {}, super.configuredProviders?.() || [])",
  "ambientReadyProviders({",
  "orderedExtendedProviders({",
  'provider === "mistral"',
  'provider === "vercel-ai-gateway"',
  'provider === "openrouter"',
  'provider === "huggingface"',
  'provider === "cerebras"',
  'provider === "cohere-trial"',
  "EXTENDED_ONLY_PROVIDERS.has(source)",
  "extendedFreeProviderPool: true",
  "cohereTrialProductionDisabledByDefault: true"
]) {
  assert.ok(providerCompat.includes(marker), `3G.4 must preserve marker: ${marker}`);
}

// O3 intentionally optimizes the readiness-classification methods. Preserve the
// original 3G.4 guarantee for every unchanged provider/network surface byte-for-byte,
// while O3's dedicated gate proves semantic equivalence for readiness ordering,
// degradation/capacity classification, timestamp/depth scoping, and invalidation.
for (const method of [
  "configuredProviders",
  "noteExtendedProvider",
  "callOpenAiCompatible",
  "callMistralProvider",
  "callVercelAiGatewayProvider",
  "callOpenRouterProvider",
  "callHuggingFaceProvider",
  "callCerebrasProvider",
  "callCohereTrialProvider",
  "callProvider",
  "providerEvent",
  "say",
  "v37ProviderFailoverSnapshot",
  "fetch"
]) {
  assert.equal(
    methodBlock(providerCompat, method),
    methodBlock(frozenProvider, method),
    `3G.4 unchanged provider/network behavior must remain byte-for-byte equivalent for ${method}()`
  );
}

for (const marker of [
  'from "./provider_readiness_snapshot_v41.js"',
  "providerReadinessBase(now = Date.now())",
  "providerReadinessSnapshot(now = Date.now())",
  "hardReadyProviders(now = Date.now())",
  "softReadyProviders(now = Date.now())",
  "preferredStructuredReadyProviders(now = Date.now())",
  "effectiveStructuredReadyProviders(now = Date.now())",
  "providerPoolDegraded(now = Date.now())",
  "providerCapacityConstrained(now = Date.now())",
  "orderedReadyProviders(now = Date.now())",
  "invalidateV41ProviderReadiness()"
]) {
  assert.ok(providerCompat.includes(marker), `O3 readiness optimization marker must remain explicit: ${marker}`);
}


const v41ProductionSpine = [
  generationBase,
  roster,
  worldDate,
  coherence,
  reconnect,
  scene,
  ambient,
  presence,
  coherenceCompat,
  qualityCompat,
  livelyCompat,
  humanCompat,
  providerCompat
].join("\n");

assert.equal(
  v41ProductionSpine.includes('from "./index_v37_free_providers.js"'),
  false,
  "3G.4 must remove the retired v37 free-provider wrapper from every v41 production dependency edge"
);

for (const source of [roster, worldDate, coherence, reconnect]) {
  assert.ok(source.includes('from "./index_v37.js"'));
  assert.ok(!source.includes('from "./index_v37_free_providers.js"'));
}

console.log("v41 Phase 3G.4 free-provider retirement checks passed with O3 readiness optimization carve-out");
