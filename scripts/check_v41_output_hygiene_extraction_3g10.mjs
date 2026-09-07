import assert from "node:assert/strict";
import fs from "node:fs";
import { stripInternalChatMetadata } from "../src/output_hygiene_v37.js";

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
const failover = read("src/index_v41_provider_failover_compat.js");
const hygiene = read("src/index_v41_output_hygiene_compat.js");
const residual = read("src/index_v41_hotfix_residual_compat.js");
const freeProviders = read("src/index_v41_free_providers_compat.js");

assert.ok(failover.includes('from "./index_v41_output_hygiene_compat.js"'));
assert.ok(hygiene.includes('from "./index_v41_hotfix_residual_compat.js"'));
assert.ok(residual.includes('from "./index_v37.js"'));
assert.ok(hygiene.includes('from "./output_hygiene_v37.js"'));

assert.equal(
  extractMethod(hygiene, 'say(from, text, kind = "bot", source = "built-in", meta = {}) {'),
  extractMethod(frozen, 'say(from, text, kind = "bot", source = "built-in", meta = {}) {'),
  "3G.10 extracted say() must remain byte-for-byte equivalent to frozen v37 hotfix"
);

assert.equal(ownsMethod(hygiene, "say"), true, "3G.10 hygiene owner must own say()");
assert.equal(ownsMethod(residual, "say"), false, "3G.10 final residual must not retain say()");
assert.equal(residual.includes("stripInternalChatMetadata"), false, "3G.10 residual must not retain the hygiene helper");
assert.equal(residual.includes("internalMetadataOutputHygiene: true"), false, "3G.10 residual must not duplicate the hygiene mode flag");

assert.ok(hygiene.includes("stripInternalChatMetadata(original)"));
assert.ok(hygiene.includes("this.v37ProductionTurnStats.internalMetadataStrips += 1"));
assert.ok(hygiene.includes("this.v37ProductionTurnStats.internalMetadataDroppedLines += 1"));
assert.ok(hygiene.includes("internalMetadataOutputHygiene: true"));
assert.ok(residual.includes("this.v37ProductionTurnStats = {"));
assert.ok(residual.includes("internalMetadataStrips: 0"));
assert.ok(residual.includes("internalMetadataDroppedLines: 0"));
assert.ok(residual.includes("maybeRunV37Shadow(now = Date.now())"));
assert.ok(residual.includes('deferReason = "live-model-shadow-paused"'));

assert.equal(ownsMethod(freeProviders, "say"), true, "3G.4 free-provider source normalization must remain above hygiene");
const freeProviderSay = extractMethod(freeProviders, 'say(from, text, kind = "bot", source = "built-in", meta = {}) {');
assert.ok(freeProviderSay.includes("return super.say("), "live upper say() must delegate downward through 3G.10 hygiene");
assert.ok(freeProviderSay.includes("EXTENDED_ONLY_PROVIDERS.has(source)"), "extended-provider source normalization must remain intact");

assert.equal(stripInternalChatMetadata("hey {t12/gaming} there"), "hey there");
assert.equal(stripInternalChatMetadata("{t9/general}"), "");
assert.equal(stripInternalChatMetadata("human text"), "human text");

console.log("v41 Phase 3G.10 output-hygiene extraction checks passed");
