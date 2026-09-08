import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const retiredPath = new URL("../src/index_v41_human_only_compat.js", import.meta.url);
const frozenPath = new URL("../src/index_v37_human_only.js", import.meta.url);

assert.equal(fs.existsSync(retiredPath), false, "3G.18 v41 human-only residual source must stay deleted");
assert.equal(fs.existsSync(frozenPath), true, "3G.18 frozen v37 human-only lineage source must remain");

const frozenHumanOnly = read("src/index_v37_human_only.js");
const freeProviders = read("src/index_v41_free_providers_compat.js");
const helper = read("src/human_only_legacy_diagnostics_v41.js");
const packageJson = read("package.json");

assert.ok(frozenHumanOnly.includes('from "./index_v37_hotfix.js"'), "frozen v37 lineage must remain intact");
assert.ok(freeProviders.includes('from "./index_v41_production_turn_compat.js"'), "live free-provider owner must inherit directly from production-turn");
assert.ok(freeProviders.includes('from "./human_only_legacy_diagnostics_v41.js"'), "live free-provider owner must compose extracted diagnostics");
assert.equal(freeProviders.includes("index_v41_human_only_compat.js"), false, "live provider owner must not reference deleted residual");
assert.equal(packageJson.includes("node --check src/index_v41_human_only_compat.js"), false, "check:v41 must not syntax-check deleted residual");

for (const marker of [
  "initializeV37HumanOnlyDiagnostics",
  "mergeV37HumanOnlyStatus",
  "mergeV37HumanOnlySnapshot",
  "V37_HUMAN_ONLY_COMPAT_MODE"
]) {
  assert.ok(helper.includes(marker), `3G.18 helper must preserve compatibility marker: ${marker}`);
}

for (const proofPath of [
  "scripts/check_v41_v37_stack_characterization_3g1.mjs",
  "scripts/check_v41_wrapper_retirement_3g5.mjs",
  "scripts/check_v41_lively_support_consolidation_3g13.mjs",
  "scripts/check_v41_capacity_policy_consolidation_3g14.mjs",
  "scripts/check_v41_human_fallback_consolidation_3g15.mjs",
  "scripts/check_v41_human_fallback_telemetry_3g16.mjs",
  "scripts/check_v41_human_only_residual_retirement_3g17.mjs"
]) {
  const proof = read(proofPath);
  assert.equal(
    proof.includes('read("src/index_v41_human_only_compat.js")'),
    false,
    `3G.18 prior proof must not read deleted residual: ${proofPath}`
  );
}

console.log("v41 Phase 3G.18 human-only source retirement checks passed");
