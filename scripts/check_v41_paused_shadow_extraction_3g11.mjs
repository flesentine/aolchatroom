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
const hygiene = read("src/index_v41_output_hygiene_compat.js");
const shadow = read("src/index_v41_paused_shadow_compat.js");
const residual = read("src/index_v41_hotfix_residual_compat.js");

assert.ok(hygiene.includes('from "./index_v41_paused_shadow_compat.js"'));
assert.ok(shadow.includes('from "./index_v41_hotfix_residual_compat.js"'));
assert.ok(residual.includes('from "./index_v37.js"'));
assert.ok(productionTurn.includes("this.maybeRunV37Shadow(Date.now())"));

assert.equal(
  extractMethod(shadow, "maybeRunV37Shadow(now = Date.now()) {"),
  extractMethod(frozen, "maybeRunV37Shadow(now = Date.now()) {"),
  "3G.11 extracted paused-shadow method must remain byte-for-byte equivalent"
);

assert.equal(ownsMethod(shadow, "maybeRunV37Shadow"), true, "3G.11 shadow owner must own maybeRunV37Shadow()");
assert.equal(ownsMethod(residual, "maybeRunV37Shadow"), false, "3G.11 shared-state residual must not retain maybeRunV37Shadow()");
assert.equal(ownsMethod(shadow, "v37Snapshot"), true, "3G.11 shadow owner must own shadow mode diagnostics");
assert.equal(ownsMethod(residual, "v37Snapshot"), false, "3G.11 shared-state residual must not retain a shadow snapshot override");

for (const marker of [
  'deferReason !== "live-model-shadow-paused"',
  'pending.shadow.ai.status = "deferred-production-priority"',
  'pending.shadow.ai.deferReason = "live-model-shadow-paused"',
  'pending.shadow.ai.error = "live Director model calls paused after provider retry recurrence"',
  "this.v37ProductionTurnStats.liveAiShadowPauses += 1",
  "liveAiShadowPausedForProviderStability: true",
  "liveAiShadowResumedAfterSingleFlightValidation: false",
  "shadowPacketsStillRecordedWhileModelPaused: true"
]) {
  assert.ok(shadow.includes(marker), `3G.11 paused-shadow owner must preserve marker: ${marker}`);
  assert.equal(residual.includes(marker), false, `3G.11 shared-state residual must not duplicate marker: ${marker}`);
}

assert.ok(residual.includes("this.v37ProductionTurnStats = {"));
assert.ok(residual.includes("liveAiShadowPauses: 0"));
assert.equal((residual.match(/this\.v37ProductionTurnStats = \{/g) || []).length, 1, "shared stats must be initialized exactly once");
assert.equal(shadow.includes("this.v37ProductionTurnStats = {"), false, "shadow owner must consume shared stats without reinitializing them");
assert.equal(hygiene.includes("this.v37ProductionTurnStats = {"), false, "hygiene owner must consume shared stats without reinitializing them");

console.log("v41 Phase 3G.11 paused-shadow extraction checks passed");
