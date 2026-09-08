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
const humanDirector = read("src/index_v41_human_director_compat.js");

const frozenFallback = extractMethod(frozenHumanOnly, "async generateHumanReplan(human) {");
const delegatedFallback = extractMethod(humanDirector, "async generateDelegatedHumanReplan(human) {")
  .replace("async generateDelegatedHumanReplan(human) {", "async generateHumanReplan(human) {");
assert.equal(
  delegatedFallback,
  frozenFallback,
  "3G.15 delegated fallback must remain byte-for-byte equivalent to frozen v37 human-only generateHumanReplan() after renaming only the method"
);

assert.equal(ownsMethod(humanOnly, "generateHumanReplan"), false, "3G.15 human-only residual must release generateHumanReplan()");
assert.equal(humanOnly.includes('from "./index_v14.js"'), false, "3G.15 human-only residual must release the built-in fallback dependency");
assert.equal(ownsMethod(humanDirector, "generateHumanReplan"), true, "3G.15 human Director must remain the human-turn authority");
assert.equal(ownsMethod(humanDirector, "generateDelegatedHumanReplan"), true, "3G.15 human Director must own delegated fallback");
assert.ok(
  humanDirector.includes("if (!this.directHumanDirectorEligible(packet)) return this.generateDelegatedHumanReplan(human);"),
  "3G.15 Director-ineligible packets must route through the consolidated delegated fallback"
);

for (const marker of [
  "this.v37AdaptiveAmbientStats.humanModelFallbacks += 1",
  "this.v37AdaptiveAmbientStats.humanModelFallbackMisses += 1",
  'this.setAiStatus?.("AI human reply fallback · built-in")',
  'source: "built-in"'
]) {
  assert.ok(humanDirector.includes(marker), `3G.15 Director must preserve delegated fallback marker: ${marker}`);
}

for (const marker of [
  "this.v37LastAmbientAiAt = 0",
  "this.v37AdaptiveAmbientStats = {",
  "humanModelFallbacks",
  "humanModelFallbackMisses",
  "humanModelFailureFallsBackBuiltIn: true",
  "adaptiveAmbientAi: {"
]) {
  assert.ok(humanOnly.includes(marker), `3G.15 human-only residual must retain legacy diagnostic marker: ${marker}`);
}
assert.equal(ownsMethod(humanOnly, "v37Snapshot"), true, "3G.15 human-only residual must retain v37Snapshot()");

console.log("v41 Phase 3G.15 delegated-human-fallback consolidation checks passed");
