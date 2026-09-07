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

const frozenHumanOnly = read("src/index_v37_human_only.js");
const humanOnly = read("src/index_v41_human_only_compat.js");
const lively = read("src/index_v41_lively_ambient_compat.js");

assert.equal(
  extractMethod(lively, "activeAmbientCharacters() {"),
  extractMethod(frozenHumanOnly, "activeAmbientCharacters() {"),
  "3G.13 activeAmbientCharacters() must remain byte-for-byte equivalent to the frozen v37 helper"
);

assert.equal(ownsMethod(humanOnly, "activeAmbientCharacters"), false, "human-only residual must release activeAmbientCharacters()");
assert.equal(humanOnly.includes("this.v37AmbientProviderCursor = 0"), false, "human-only residual must release the lively provider cursor");
assert.equal(humanOnly.includes('from "./characters.js"'), false, "human-only residual must release character lookup");

assert.equal(ownsMethod(lively, "activeAmbientCharacters"), true, "lively ambient must own activeAmbientCharacters()");
assert.ok(lively.includes('from "./characters.js"'), "lively ambient must own character lookup");
assert.equal(
  (lively.match(/this\.v37AmbientProviderCursor\s*=\s*0/g) || []).length,
  1,
  "lively ambient must initialize its provider cursor exactly once"
);
assert.ok(lively.includes("this.v37AmbientProviderCursor % preferred.length"));
assert.ok(lively.includes("this.v37AmbientProviderCursor = (this.v37AmbientProviderCursor + 1) % 1000000"));
assert.ok(lively.includes("this.activeAmbientCharacters?.()"));

for (const method of ["providerCapacityConstrained", "generateHumanReplan", "v37Snapshot"]) {
  assert.equal(ownsMethod(humanOnly, method), true, `human-only residual must retain ${method}()`);
}
for (const marker of [
  "this.v37LastAmbientAiAt = 0",
  "this.v37AdaptiveAmbientStats = {",
  "humanModelFallbacks",
  "humanModelFallbackMisses",
  "adaptiveAmbientAi: true",
  "humanModelFailureFallsBackBuiltIn: true"
]) {
  assert.ok(humanOnly.includes(marker), `human-only residual must retain marker: ${marker}`);
}

console.log("v41 Phase 3G.13 lively-support consolidation checks passed");
