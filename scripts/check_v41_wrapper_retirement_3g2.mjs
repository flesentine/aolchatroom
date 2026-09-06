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

const qualityCompat = read("src/index_v41_quality_compat.js");
const livelyCompat = read("src/index_v41_lively_ambient_compat.js");
const frozenLively = read("src/index_v37_lively_ambient.js");

assert.ok(qualityCompat.includes('from "./index_v41_lively_ambient_compat.js"'));
assert.ok(!qualityCompat.includes('from "./index_v37_lively_ambient.js"'));
assert.ok(livelyCompat.includes('from "./index_v37_human_director.js"'));
assert.ok(frozenLively.includes('from "./index_v37_human_director.js"'));

for (const method of [
  "sceneIsClosed",
  "pruneScenes",
  "sceneForMessage",
  "touchScene",
  "recentHumanInScene",
  "closeExhaustedAmbientScenes",
  "livelyAmbientPrompt",
  "generateLivelyAmbientAi",
  "generateBackgroundPlan",
  "v37Snapshot"
]) {
  assert.equal(ownsMethod(livelyCompat, method), true, `3G.2 must preserve ${method}()`);
}

for (const marker of [
  "this.v37LastLivelyAmbientAiAt = 0",
  "this.v37LivelyAmbientStats = {",
  "authority?.closeExhaustedScenes",
  "continuationDecision",
  "livelyAmbientEligible({",
  "preferredStructuredReadyProviders?.(now)",
  "builtInFailureFallbacks",
  "ambientLivelySingleCallAuthoritative: true"
]) {
  assert.ok(livelyCompat.includes(marker), `3G.2 must preserve marker: ${marker}`);
}

const headerLines = 4;
const compatBody = livelyCompat.split("\n").slice(headerLines).join("\n");
assert.equal(
  compatBody,
  frozenLively,
  "3G.2 replacement must remain byte-for-byte behavior-equivalent to frozen v37 lively ambient below its compatibility header"
);

console.log("v41 Phase 3G.2 v37 lively-ambient wrapper retirement checks passed");
