import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const chain = [
  ["src/index_v41_generation_contract.js", "./index_v41_generation_contract_base.js", "Phase2ChatRoom"],
  ["src/index_v41_generation_contract_base.js", "./index_v41_bot_roster_reentry.js", "V41RosterChatRoom"],
  ["src/index_v41_bot_roster_reentry.js", "./index_v41_world_date_guard.js", "V41WorldDateChatRoom"],
  ["src/index_v41_world_date_guard.js", "./index_v41_coherence_repair.js", "V41CoherenceChatRoom"],
  ["src/index_v41_coherence_repair.js", "./index_v41_human_reconnect.js", "V41ReconnectChatRoom"],
  ["src/index_v41_human_reconnect.js", "./index_v41_scene_coordinator.js", "V41SceneChatRoom"],
  ["src/index_v41_scene_coordinator.js", "./index_v41_ambient_continuity_compat.js", "V40ChatRoom"],
  ["src/index_v41_ambient_continuity_compat.js", "./index_v41_presence_compat.js", "V41PresenceCompatChatRoom"],
  ["src/index_v41_presence_compat.js", "./index_v41_coherence_compat.js", "V41CoherenceCompatChatRoom"],
  ["src/index_v41_coherence_compat.js", "./index_v41_quality_compat.js", "V41QualityCompatChatRoom"],
  ["src/index_v41_quality_compat.js", "./index_v41_lively_ambient_compat.js", "V41LivelyAmbientCompatChatRoom"],
  ["src/index_v41_lively_ambient_compat.js", "./index_v41_human_director_compat.js", "HumanDirectorChatRoom"],
  ["src/index_v41_human_director_compat.js", "./index_v41_free_providers_compat.js", "FreeProviderChatRoom"],
  ["src/index_v41_free_providers_compat.js", "./index_v41_production_turn_compat.js", "ProductionTurnChatRoom"],
  ["src/index_v41_production_turn_compat.js", "./index_v41_provider_readiness_compat.js", "ProviderReadinessChatRoom"],
  ["src/index_v41_provider_readiness_compat.js", "./index_v41_provider_failover_compat.js", "ProviderFailoverChatRoom"],
  ["src/index_v41_provider_failover_compat.js", "./index_v41_output_hygiene_compat.js", "OutputHygieneChatRoom"],
  ["src/index_v41_output_hygiene_compat.js", "./index_v41_paused_shadow_compat.js", "PausedShadowChatRoom"],
  ["src/index_v41_paused_shadow_compat.js", "./index_v37.js", "V37ChatRoom"]
];

const retiredWrapperImports = [
  "./index_v40_scene_continuity.js",
  "./index_v39_world_gate.js",
  "./index_v39_presence_fix.js",
  "./index_v39_coherence.js",
  "./index_v38_quality_guard.js",
  "./index_v37_lively_ambient.js",
  "./index_v37_human_director.js",
  "./index_v37_free_providers.js",
  "./index_v37_human_only.js",
  "./index_v37_hotfix.js"
];

const frozenLineageFiles = [
  "src/index_v40_scene_continuity.js",
  "src/index_v39_world_gate.js",
  "src/index_v39_presence_fix.js",
  "src/index_v39_coherence.js",
  "src/index_v38_quality_guard.js",
  "src/index_v37_lively_ambient.js",
  "src/index_v37_human_director.js",
  "src/index_v37_free_providers.js",
  "src/index_v37_human_only.js",
  "src/index_v37_hotfix.js",
  "src/index_v37.js"
];

const sources = new Map(chain.map(([path]) => [path, read(path)]));

for (const [path, parentImport, parentAlias] of chain) {
  const source = sources.get(path);
  const parentImportLine = source.split("\n").find((line) =>
    line.startsWith("import ") &&
    line.includes(parentImport) &&
    line.includes(`ChatRoom as ${parentAlias}`)
  );
  assert.ok(
    parentImportLine,
    `3G.20 production spine parent binding drifted: ${path} must bind ChatRoom as ${parentAlias} from ${parentImport}`
  );
  assert.ok(
    source.includes(`export class ChatRoom extends ${parentAlias} {`),
    `3G.20 production spine inheritance drifted: ${path} must extend ${parentAlias}`
  );
}

const srcDir = new URL("../src/", import.meta.url);
const productionSourcePaths = fs.readdirSync(srcDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => `src/${name}`)
  .filter((path) => !frozenLineageFiles.includes(path));
const productionSources = new Map(productionSourcePaths.map((path) => [path, read(path)]));

for (const [path, source] of productionSources) {
  for (const retiredImport of retiredWrapperImports) {
    assert.equal(
      source.includes(`from "${retiredImport}"`) || source.includes(`from '${retiredImport}'`),
      false,
      `3G.20 retired wrapper must not re-enter production anywhere under src/: ${path} imports ${retiredImport}`
    );
  }
}

const directBaselineImporters = [...productionSources]
  .filter(([, source]) =>
    source.includes('from "./index_v37.js"') ||
    source.includes("from './index_v37.js'")
  )
  .map(([path]) => path)
  .sort();

assert.deepEqual(
  directBaselineImporters,
  [
    "src/index_v41_bot_roster_reentry.js",
    "src/index_v41_coherence_repair.js",
    "src/index_v41_human_reconnect.js",
    "src/index_v41_paused_shadow_compat.js",
    "src/index_v41_world_date_guard.js"
  ],
  "3G.20 direct frozen-v37 baseline callers must remain explicit and bounded"
);

for (const path of frozenLineageFiles) {
  assert.equal(
    fs.existsSync(new URL(`../${path}`, import.meta.url)),
    true,
    `3G.20 frozen lineage file must remain available: ${path}`
  );
}

for (const deletedPath of [
  "src/index_v41_human_only_compat.js",
  "src/index_v41_hotfix_residual_compat.js"
]) {
  assert.equal(
    fs.existsSync(new URL(`../${deletedPath}`, import.meta.url)),
    false,
    `3G.20 retired v41 residual must stay deleted: ${deletedPath}`
  );
}

assert.equal(
  fs.existsSync(new URL("../src/human_only_legacy_diagnostics_v41.js", import.meta.url)),
  true,
  "3G.20 stateless historical diagnostics helper must remain available"
);

console.log("v41 Phase 3G.20 wrapper-retirement closure checks passed");
