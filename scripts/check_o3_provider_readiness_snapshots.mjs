import assert from "node:assert/strict";
import fs from "node:fs";
import { ProviderReadinessTurnCache } from "../src/provider_readiness_snapshot_v41.js";

const free = fs.readFileSync(new URL("../src/index_v41_free_providers_compat.js", import.meta.url), "utf8");
const turn = fs.readFileSync(new URL("../src/index_v41_production_turn_compat.js", import.meta.url), "utf8");

const cache = new ProviderReadinessTurnCache();
let baseBuilds = 0;
let derivedBuilds = 0;
const token = cache.begin(1000);

const baseA = cache.base(1000, () => ({ id: ++baseBuilds }));
const baseB = cache.base(1000, () => ({ id: ++baseBuilds }));
assert.equal(baseA, baseB, "same timestamp must reuse one base readiness snapshot");
assert.equal(baseBuilds, 1);

const depth0A = cache.derived(1000, 0, () => ({ id: ++derivedBuilds }));
const depth0B = cache.derived(1000, 0, () => ({ id: ++derivedBuilds }));
assert.equal(depth0A, depth0B, "same timestamp/depth must reuse one derived readiness snapshot");
assert.equal(derivedBuilds, 1);

cache.derived(1000, 1, () => ({ id: ++derivedBuilds }));
assert.equal(derivedBuilds, 2, "structured-depth changes must receive a fresh derived snapshot");

cache.base(1001, () => ({ id: ++baseBuilds }));
assert.equal(baseBuilds, 2, "new timestamps must receive fresh readiness evaluation");

assert.equal(cache.end(token), true);
const after = cache.snapshot();
assert.equal(after.active, false);
assert.equal(after.baseSnapshotsBuilt, 2);
assert.equal(after.baseCacheHits, 1);
assert.equal(after.derivedSnapshotsBuilt, 2);
assert.equal(after.derivedCacheHits, 1);
assert.equal(after.lastTurnBaseEntries, 2);
assert.equal(after.lastTurnDerivedEntries, 2);

cache.base(1001, () => ({ id: ++baseBuilds }));
assert.equal(baseBuilds, 3, "cache must not leak readiness state outside a production-turn scope");

assert.ok(free.includes("providerReadinessBase(now = Date.now())"));
assert.ok(free.includes("providerReadinessSnapshot(now = Date.now())"));
assert.ok(free.includes("providerCapacityConstrained(now = Date.now())"));
assert.ok(free.includes("this.v41ProviderReadinessCache.base(now"));
assert.ok(free.includes("this.v41ProviderReadinessCache.derived(now, depth"));
assert.ok(free.includes("structuredGenerationDepth: generationDepth"));
assert.ok(
  turn.includes("providerReadinessToken = this.beginV41ProviderReadinessTurn?.(now)"),
  "production turn must open the O3 readiness scope using its exact decision timestamp"
);
assert.ok(
  turn.includes("this.endV41ProviderReadinessTurn?.(providerReadinessToken)"),
  "production turn must always close the O3 readiness scope"
);

console.log("O3 provider readiness snapshot checks passed");
