import assert from "node:assert/strict";
import fs from "node:fs";
import { CoalescingTurnGate } from "../src/production_turn_gate.js";

let releaseFirst;
const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
const calls = [];
let concurrent = 0;
let maxConcurrent = 0;

const gate = new CoalescingTurnGate({
  maxReplays: 2,
  run: async (source, forceSoon) => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    calls.push({ source, forceSoon });
    try {
      if (calls.length === 1) await firstBlocked;
      return calls.length;
    } finally {
      concurrent -= 1;
    }
  }
});

const first = gate.request("tick", false);
const overlappingAlarm = gate.request("alarm", false);
const overlappingHuman = gate.request("tick", true);

await Promise.resolve();
assert.equal(calls.length, 1, "overlapping requests must not start parallel production turns");
assert.equal(gate.snapshot().coalesced, 2);
assert.equal(gate.snapshot().replayRequested, true);
assert.equal(gate.snapshot().replayForce, true, "human forceSoon must survive coalescing");

releaseFirst();
await Promise.all([first, overlappingAlarm, overlappingHuman]);
assert.equal(calls.length, 2, "many overlapping requests should collapse into one replay");
assert.deepEqual(calls[0], { source: "tick", forceSoon: false });
assert.deepEqual(calls[1], { source: "replay", forceSoon: true });
assert.equal(maxConcurrent, 1);
assert.equal(gate.snapshot().maxConcurrent, 1);
assert.equal(gate.snapshot().replays, 1);
assert.equal(gate.snapshot().active, false);

let releaseInitial2;
let releaseReplay2;
const initialBlocked2 = new Promise((resolve) => { releaseInitial2 = resolve; });
const replayBlocked2 = new Promise((resolve) => { releaseReplay2 = resolve; });
const calls2 = [];
let concurrent2 = 0;
let maxConcurrent2 = 0;
const gate2 = new CoalescingTurnGate({
  maxReplays: 2,
  run: async (source, forceSoon) => {
    concurrent2 += 1;
    maxConcurrent2 = Math.max(maxConcurrent2, concurrent2);
    calls2.push({ source, forceSoon });
    try {
      if (calls2.length === 1) await initialBlocked2;
      if (calls2.length === 2) await replayBlocked2;
      return calls2.length;
    } finally {
      concurrent2 -= 1;
    }
  }
});

const first2 = gate2.request("alarm", false);
const queuedReplay2 = gate2.request("tick", false);
await Promise.resolve();
assert.equal(calls2.length, 1);
releaseInitial2();
while (calls2.length < 2) await Promise.resolve();

const duringReplayPulse = gate2.request("tick", false);
const duringReplayHuman = gate2.request("tick", true);
await Promise.resolve();
assert.equal(calls2.length, 2, "requests during replay must not run concurrently");
assert.equal(gate2.snapshot().replayForce, true);
releaseReplay2();
await Promise.all([first2, queuedReplay2, duringReplayPulse, duringReplayHuman]);

assert.equal(calls2.length, 3, "requests during replay should collapse into the second bounded replay");
assert.deepEqual(calls2[2], { source: "replay", forceSoon: true });
assert.equal(maxConcurrent2, 1);
assert.equal(gate2.snapshot().maxConcurrent, 1);
assert.equal(gate2.snapshot().replays, 2);
assert.equal(gate2.snapshot().active, false);

const wrapper = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
assert.ok(wrapper.includes('requestV37ProductionTurn("tick", forceSoon)'));
assert.ok(wrapper.includes('requestV37ProductionTurn("alarm", false)'));
assert.ok(wrapper.includes("liveAiShadowPausedForProviderStability: true"));
assert.ok(wrapper.includes("liveAiShadowResumedAfterSingleFlightValidation: false"));
assert.ok(wrapper.includes("shadowPacketsStillRecordedWhileModelPaused: true"));
assert.ok(wrapper.includes("productionTurnSingleFlight: true"));
assert.ok(wrapper.includes("live-model-shadow-paused"));
assert.equal(wrapper.includes("setTimeout("), false, "single-flight and shadow isolation must not be timing-delay patches");

const adaptiveEntrypoint = fs.readFileSync(new URL("../src/index_v37_human_only.js", import.meta.url), "utf8");
assert.ok(adaptiveEntrypoint.includes('from "./index_v37_hotfix.js"'), "adaptive ambient layer must retain the single-flight/provider hotfix layer");
assert.ok(adaptiveEntrypoint.includes("adaptiveAmbientAi: true"));
assert.ok(adaptiveEntrypoint.includes("ambientSingleProviderAttempt: true"));
assert.ok(adaptiveEntrypoint.includes("ambientModelGenerationDisabled: false"));
assert.ok(adaptiveEntrypoint.includes("humanOnlyModelBudget: false"));

const providerEntrypoint = fs.readFileSync(new URL("../src/index_v37_free_providers.js", import.meta.url), "utf8");
assert.ok(providerEntrypoint.includes('from "./index_v37_human_only.js"'), "extended provider layer must retain adaptive ambient and all hotfix layers beneath it");
assert.ok(providerEntrypoint.includes("extendedFreeProviderPool: true"));

const humanDirectorEntrypoint = fs.readFileSync(new URL("../src/index_v37_human_director.js", import.meta.url), "utf8");
assert.ok(humanDirectorEntrypoint.includes('from "./index_v37_free_providers.js"'), "human Director cutover must retain the extended provider/single-flight layers beneath it");
assert.ok(humanDirectorEntrypoint.includes("directHumanDirectorAuthoritative: true"));

const productionEntrypoint = fs.readFileSync(new URL("../src/index_v37_lively_ambient.js", import.meta.url), "utf8");
assert.ok(productionEntrypoint.includes('from "./index_v37_human_director.js"'), "lively ambient production layer must retain human Director and all safety layers beneath it");
assert.ok(productionEntrypoint.includes("livelyAmbientAi: true"));
assert.ok(productionEntrypoint.includes("ambientBuiltInFillerBetweenCalls: false"));

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const directV37 = wrangler.includes('"main": "src/index_v37_lively_ambient.js"')
  && wrangler.includes('"DEPLOY_VERSION": "37"');
const v38Url = new URL("../src/index_v38_quality_guard.js", import.meta.url);
const v39Url = new URL("../src/index_v39_coherence.js", import.meta.url);
const v39PresenceUrl = new URL("../src/index_v39_presence_fix.js", import.meta.url);
const v39WorldUrl = new URL("../src/index_v39_world_gate.js", import.meta.url);
const v40Url = new URL("../src/index_v40_scene_continuity.js", import.meta.url);
const v41Url = new URL("../src/index_v41_scene_coordinator.js", import.meta.url);
const v41ReconnectUrl = new URL("../src/index_v41_human_reconnect.js", import.meta.url);
const v41CoherenceUrl = new URL("../src/index_v41_coherence_repair.js", import.meta.url);
const v41GenerationUrl = new URL("../src/index_v41_generation_contract.js", import.meta.url);
const v38Entrypoint = fs.existsSync(v38Url) ? fs.readFileSync(v38Url, "utf8") : "";
const wrappedV38 = wrangler.includes('"main": "src/index_v38_quality_guard.js"')
  && wrangler.includes('"DEPLOY_VERSION": "38"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39Entrypoint = fs.existsSync(v39Url) ? fs.readFileSync(v39Url, "utf8") : "";
const wrappedV39 = wrangler.includes('"main": "src/index_v39_coherence.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39PresenceEntrypoint = fs.existsSync(v39PresenceUrl) ? fs.readFileSync(v39PresenceUrl, "utf8") : "";
const wrappedV39Presence = wrangler.includes('"main": "src/index_v39_presence_fix.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39WorldEntrypoint = fs.existsSync(v39WorldUrl) ? fs.readFileSync(v39WorldUrl, "utf8") : "";
const wrappedV39World = wrangler.includes('"main": "src/index_v39_world_gate.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v40Entrypoint = fs.existsSync(v40Url) ? fs.readFileSync(v40Url, "utf8") : "";
const wrappedV40 = wrangler.includes('"main": "src/index_v40_scene_continuity.js"')
  && wrangler.includes('"DEPLOY_VERSION": "40"')
  && v40Entrypoint.includes('from "./index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v41Entrypoint = fs.existsSync(v41Url) ? fs.readFileSync(v41Url, "utf8") : "";
const wrappedV41 = wrangler.includes('"main": "src/index_v41_scene_coordinator.js"')
  && wrangler.includes('"DEPLOY_VERSION": "41"')
  && v41Entrypoint.includes('from "./index_v40_scene_continuity.js"')
  && v40Entrypoint.includes('from "./index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v41ReconnectEntrypoint = fs.existsSync(v41ReconnectUrl) ? fs.readFileSync(v41ReconnectUrl, "utf8") : "";
const v41CoherenceEntrypoint = fs.existsSync(v41CoherenceUrl) ? fs.readFileSync(v41CoherenceUrl, "utf8") : "";
const v41GenerationEntrypoint = fs.existsSync(v41GenerationUrl) ? fs.readFileSync(v41GenerationUrl, "utf8") : "";
const wrappedV41Generation = wrangler.includes('"main": "src/index_v41_generation_contract.js"')
  && wrangler.includes('"DEPLOY_VERSION": "41"')
  && (
    v41GenerationEntrypoint.includes('from "./index_v41_scene_coordinator.js"')
    || (
      v41GenerationEntrypoint.includes('from "./index_v41_coherence_repair.js"')
      && v41CoherenceEntrypoint.includes('from "./index_v41_human_reconnect.js"')
      && v41ReconnectEntrypoint.includes('from "./index_v41_scene_coordinator.js"')
    )
  )
  && v41Entrypoint.includes('from "./index_v40_scene_continuity.js"')
  && v40Entrypoint.includes('from "./index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
assert.ok(directV37 || wrappedV38 || wrappedV39 || wrappedV39Presence || wrappedV39World || wrappedV40 || wrappedV41 || wrappedV41Generation, "production must deploy v37 lively ambient through an explicit v37/v38/v39/v40/v41 wrapper chain");

console.log("v37 production-turn single-flight + extended-provider + human-Director + lively-ambient regression checks passed");
