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
const providerReadiness = read("src/index_v41_provider_readiness_compat.js");
const providerFailover = read("src/index_v41_provider_failover_compat.js");
const outputHygiene = read("src/index_v41_output_hygiene_compat.js");
const pausedShadow = read("src/index_v41_paused_shadow_compat.js");
const sharedStats = read("src/production_turn_stats_v41.js");
const humanOnly = read("src/index_v41_human_only_compat.js");
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
const lively = read("src/index_v41_lively_ambient_compat.js");
const director = read("src/index_v41_human_director_compat.js");
const providers = read("src/index_v41_free_providers_compat.js");

assert.ok(humanOnly.includes('from "./index_v41_production_turn_compat.js"'));
assert.ok(productionTurn.includes('from "./index_v41_provider_readiness_compat.js"'));
assert.ok(providerReadiness.includes('from "./index_v41_provider_failover_compat.js"'));
assert.ok(providerFailover.includes('from "./index_v41_output_hygiene_compat.js"'));
assert.ok(outputHygiene.includes('from "./index_v41_paused_shadow_compat.js"'));
assert.ok(pausedShadow.includes('from "./index_v37.js"'));
assert.ok(pausedShadow.includes('from "./production_turn_stats_v41.js"'));
assert.ok(sharedStats.includes("createV37ProductionTurnStats"));
assert.ok(!productionTurn.includes('from "./index_v37_hotfix.js"'));

for (const signature of [
  "async runV37BaseProductionTurn(source, forceSoon = false) {",
  "requestV37ProductionTurn(source, forceSoon = false) {",
  "async tick(forceSoon = false) {",
  "async alarm() {"
]) {
  assert.equal(
    extractMethod(productionTurn, signature),
    extractMethod(frozen, signature),
    `3G.7 extracted method must remain byte-for-byte equivalent: ${signature}`
  );
}

for (const method of ["runV37BaseProductionTurn", "requestV37ProductionTurn", "tick", "alarm"]) {
  assert.equal(ownsMethod(providerReadiness, method), false, `readiness owner must not retain ${method}()`);
}

for (const signature of [
  'noteProviderFailure(provider, status = 0, response = null, detail = "") {',
  "v37ProviderFailoverSnapshot(now = Date.now()) {"
]) {
  assert.equal(
    extractMethod(providerFailover, signature),
    extractMethod(frozen, signature),
    `3G.9 failover method must remain byte-for-byte equivalent: ${signature}`
  );
}
assert.equal(
  extractMethod(outputHygiene, 'say(from, text, kind = "bot", source = "built-in", meta = {}) {'),
  extractMethod(frozen, 'say(from, text, kind = "bot", source = "built-in", meta = {}) {'),
  "3G.10 output-hygiene say() must remain byte-for-byte equivalent"
);
assert.equal(
  extractMethod(pausedShadow, "maybeRunV37Shadow(now = Date.now()) {"),
  extractMethod(frozen, "maybeRunV37Shadow(now = Date.now()) {"),
  "3G.11 paused-shadow method must remain byte-for-byte equivalent"
);

for (const marker of [
  "this.v37ProductionTurnStats = {",
  "outerRequests: 0",
  "deferredAfterReplayCap: 0",
  "maxConcurrentBaseTurns: 0",
  "liveAiShadowPauses: 0",
  "internalMetadataStrips: 0",
  "workersDailyQuotaExhaustions: 0",
  "degradedModeTicks: 0",
  "capacitySheddingAmbientQueued: 0"
]) {
  assert.ok(sharedStats.includes(marker), `shared hotfix diagnostics must remain in the stats factory: ${marker.replace(": 0", "")}`);
}

assert.ok(productionTurn.includes("this.v37ProductionTurnGate = new CoalescingTurnGate({"));
assert.ok(productionTurn.includes("maxReplays: 2"));
assert.ok(productionTurn.includes("onCoalesce: () => { this.v37ProductionTurnStats.coalescedRequests += 1; }"));
assert.ok(productionTurn.includes("onReplay: () => { this.v37ProductionTurnStats.replayTurns += 1; }"));
assert.ok(productionTurn.includes("onDeferred: () => { this.v37ProductionTurnStats.deferredAfterReplayCap += 1; }"));
assert.ok(productionTurn.includes("productionTurnSingleFlight: true"));
assert.ok(productionTurn.includes("productionTurnReplayCoalescing: true"));
assert.ok(productionTurn.includes("productionTurn: {"));

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
  lively,
  director,
  providers,
  humanOnly,
  productionTurn,
  providerReadiness,
  providerFailover,
  outputHygiene,
  pausedShadow,
  sharedStats
].join("\n");

assert.equal(
  v41ProductionSpine.includes('from "./index_v37_hotfix.js"'),
  false,
  "3G.7 must remove frozen index_v37_hotfix.js from every v41 production dependency edge"
);

for (const source of [roster, worldDate, coherence, reconnect]) {
  assert.ok(source.includes('from "./index_v37.js"'));
  assert.ok(!source.includes('from "./index_v37_hotfix.js"'));
}

console.log("v41 Phase 3G.7 production-turn singleflight extraction checks passed");
