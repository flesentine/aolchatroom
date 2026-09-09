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
const humanDirectorCompat = read("src/index_v41_human_director_compat.js");
const generationBase = read("src/index_v41_generation_contract_base.js");
const roster = read("src/index_v41_bot_roster_reentry.js");
const worldDate = read("src/index_v41_world_date_guard.js");
const coherence = read("src/index_v41_coherence_repair.js");
const reconnect = read("src/index_v41_human_reconnect.js");
const scene = read("src/index_v41_scene_coordinator.js");
const ambient = read("src/index_v41_ambient_continuity_compat.js");
const presence = read("src/index_v41_presence_compat.js");
const coherenceCompat = read("src/index_v41_coherence_compat.js");

assert.ok(qualityCompat.includes('from "./index_v41_lively_ambient_compat.js"'));
assert.ok(!qualityCompat.includes('from "./index_v37_lively_ambient.js"'));
assert.ok(livelyCompat.includes('from "./index_v41_human_director_compat.js"'));
assert.ok(humanDirectorCompat.includes('from "./index_v41_free_providers_compat.js"'));
assert.ok(frozenLively.includes('from "./index_v37_human_director.js"'));

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
  livelyCompat
].join("\n");
assert.equal(
  v41ProductionSpine.includes('from "./index_v37_lively_ambient.js"'),
  false,
  "3G.2 must remove the retired v37 lively wrapper from every v41 production dependency edge"
);

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
const o4HelperImport = 'import { collectLastMatching, findLastMatching } from "./hotpath_collections_v41.js";\n';
const movedSupportMethod = `  activeAmbientCharacters() {
    const active = [];
    for (const name of this.activeBotNames || []) {
      const character = getCharacter(name);
      if (character) active.push(character);
    }
    return active;
  }

`;
const o4RecentHuman = `  recentHumanInScene(sceneId, now = Date.now()) {
    if (!sceneId) return null;
    return findLastMatching(this.history || [], (row) =>
      row?.kind === "human"
      && row.sceneId === sceneId
      && now - Number(row.at || 0) <= RECENT_HUMAN_SCENE_MS
    );
  }`;
const frozenRecentHuman = `  recentHumanInScene(sceneId, now = Date.now()) {
    if (!sceneId) return null;
    return [...(this.history || [])].reverse().find((row) =>
      row?.kind === "human"
      && row.sceneId === sceneId
      && now - Number(row.at || 0) <= RECENT_HUMAN_SCENE_MS
    ) || null;
  }`;
const o4RecentChat = `    const recent = collectLastMatching(
      this.history || [],
      LIVELY_AMBIENT_RECENT_LINES,
      (row) => row?.kind === "human" || row?.kind === "bot"
    )
      .map((row) => \`\${row.from}\${row.target && row.target !== "room" ? \` -> \${row.target}\` : ""}: \${clean(row.text, 180)}\`)
      .join("\\n");`;
const frozenRecentChat = `    const recent = (this.history || [])
      .filter((row) => row?.kind === "human" || row?.kind === "bot")
      .slice(-LIVELY_AMBIENT_RECENT_LINES)
      .map((row) => \`\${row.from}\${row.target && row.target !== "room" ? \` -> \${row.target}\` : ""}: \${clean(row.text, 180)}\`)
      .join("\\n");`;
const compatBody = livelyCompat.split("\n").slice(headerLines).join("\n")
  .replace('from "./index_v41_human_director_compat.js"', 'from "./index_v37_human_director.js"')
  .replace(o4HelperImport, "")
  .replace('import { getCharacter } from "./characters.js";\n', "")
  .replace("    this.v37AmbientProviderCursor = 0;\n", "")
  .replace(movedSupportMethod, "")
  .replace(o4RecentHuman, frozenRecentHuman)
  .replace(o4RecentChat, frozenRecentChat);
assert.equal(
  compatBody,
  frozenLively,
  "3G.2 original lively behavior must remain byte-for-byte equivalent after subtracting the explicit 3G.13 support additions"
);

console.log("v41 Phase 3G.2 lively retirement checks passed with O4 hot-path normalization");
