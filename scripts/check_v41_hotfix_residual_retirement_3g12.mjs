import assert from "node:assert/strict";
import fs from "node:fs";
import { createV37ProductionTurnStats } from "../src/production_turn_stats_v41.js";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function extractObjectBody(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing object marker: ${marker}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  assert.fail(`unterminated object marker: ${marker}`);
}

function zeroKeys(body) {
  return body
    .split("\n")
    .map((line) => line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*0\s*,?\s*$/)?.[1] || "")
    .filter(Boolean)
    .sort();
}

const frozen = read("src/index_v37_hotfix.js");
const shadow = read("src/index_v41_paused_shadow_compat.js");
const statsSource = read("src/production_turn_stats_v41.js");
const productionTurn = read("src/index_v41_production_turn_compat.js");
const readiness = read("src/index_v41_provider_readiness_compat.js");
const failover = read("src/index_v41_provider_failover_compat.js");
const hygiene = read("src/index_v41_output_hygiene_compat.js");

const retiredUrl = new URL("../src/index_v41_hotfix_residual_compat.js", import.meta.url);
assert.equal(fs.existsSync(retiredUrl), false, "3G.12 retired hotfix residual file must remain deleted");

assert.ok(shadow.includes('from "./index_v37.js"'), "3G.12 paused-shadow owner must inherit directly from v37");
assert.ok(shadow.includes('from "./production_turn_stats_v41.js"'), "3G.12 paused-shadow owner must use the shared stats factory");
assert.ok(shadow.includes("this.v37ProductionTurnStats = createV37ProductionTurnStats()"), "3G.12 live constructor must initialize the shared stats object exactly once");
assert.equal((shadow.match(/this\.v37ProductionTurnStats\s*=/g) || []).length, 1, "3G.12 live constructor must have exactly one stats assignment");

const frozenKeys = zeroKeys(extractObjectBody(frozen, "this.v37ProductionTurnStats = {"));
const stats = createV37ProductionTurnStats();
assert.deepEqual(Object.keys(stats).sort(), frozenKeys, "3G.12 stats factory must preserve the frozen hotfix telemetry schema exactly");
assert.equal(Object.values(stats).every((value) => value === 0), true, "3G.12 every shared telemetry counter must initialize to zero");
assert.notEqual(stats, createV37ProductionTurnStats(), "3G.12 stats factory must return a fresh object per room instance");

for (const key of frozenKeys) {
  assert.ok(statsSource.includes(`${key}: 0`), `3G.12 stats factory source must retain counter ${key}`);
}

for (const [name, source] of [
  ["production-turn", productionTurn],
  ["readiness", readiness],
  ["failover", failover],
  ["hygiene", hygiene]
]) {
  assert.equal(source.includes("createV37ProductionTurnStats"), false, `3G.12 ${name} owner must consume shared stats without reinitializing them`);
  assert.equal(source.includes("index_v41_hotfix_residual_compat.js"), false, `3G.12 ${name} owner must not reference the retired residual`);
}

assert.equal(shadow.includes("index_v41_hotfix_residual_compat.js"), false, "3G.12 paused-shadow owner must not reference the retired residual");
assert.ok(productionTurn.includes("this.v37ProductionTurnStats."), "singleflight owner must still write shared telemetry");
assert.ok(readiness.includes("this.v37ProductionTurnStats."), "readiness owner must still write shared telemetry");
assert.ok(failover.includes("this.v37ProductionTurnStats."), "failover owner must still write shared telemetry");
assert.ok(hygiene.includes("this.v37ProductionTurnStats."), "hygiene owner must still write shared telemetry");
assert.ok(shadow.includes("this.v37ProductionTurnStats."), "paused-shadow owner must still write shared telemetry");

console.log("v41 Phase 3G.12 hotfix residual retirement checks passed");
