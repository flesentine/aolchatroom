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

const humanCompat = read("src/index_v41_human_director_compat.js");
const providerCompat = read("src/index_v41_free_providers_compat.js");
const frozenProvider = read("src/index_v37_free_providers.js");
const humanOnly = read("src/index_v41_human_only_compat.js");
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
assert.ok(providerCompat.includes('from "./index_v41_human_only_compat.js"'));
assert.ok(frozenProvider.includes('from "./index_v37_human_only.js"'));
assert.ok(humanOnly.includes('from "./index_v37_hotfix.js"'));
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

const headerLines = 4;
const compatBody = providerCompat.split("\n").slice(headerLines).join("\n")
  .replace('from "./index_v41_human_only_compat.js"', 'from "./index_v37_human_only.js"');
assert.equal(
  compatBody,
  frozenProvider,
  "3G.4 replacement must remain byte-for-byte behavior-equivalent to frozen v37 free-provider wrapper below its compatibility header"
);

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
  assert.ok(source.includes('from "./index_v37_hotfix.js"'));
  assert.ok(!source.includes('from "./index_v37_free_providers.js"'));
}

console.log("v41 Phase 3G.4 v37 free-provider wrapper retirement checks passed");
