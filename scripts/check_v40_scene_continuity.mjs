import assert from "node:assert/strict";
import fs from "node:fs";
import {
  V40_MAX_SCENE_TURNS,
  V40_MOMENTUM_WINDOW_MS,
  V40_TARGET_SCENE_TURNS,
  inferSceneMomentum,
  sceneMomentumPrompt,
  selectSceneCarryIndices
} from "../src/scene_continuity_v40.js";

const NOW = Date.parse("2026-08-31T20:54:00-07:00");

function bot(from, text, offset, extra = {}) {
  return {
    kind: "bot",
    from,
    target: "room",
    topic: "gaming",
    sceneId: "s1",
    text,
    at: NOW + offset,
    ...extra
  };
}

const building = [
  bot("SegaMan", "saturn pad feels better to me", -8000),
  bot("CyberDude", "nah playstation pad is easier", -3000, { target: "SegaMan", intent: "reply" })
];
const momentum = inferSceneMomentum(building, NOW);
assert.equal(momentum?.sceneId, "s1");
assert.equal(momentum?.phase, "building");
assert.equal(momentum?.turns, 2);
assert.equal(momentum?.topic, "gaming");
assert.ok(momentum?.participants.includes("SegaMan"));
assert.ok(momentum?.participants.includes("CyberDude"));
assert.ok(momentum.ageMs < V40_MOMENTUM_WINDOW_MS);

const humanOwned = [
  ...building,
  { kind: "human", from: "Crateman", target: "SegaMan", topic: "gaming", sceneId: "s1", text: "what games do you have", at: NOW - 1000 }
];
assert.equal(inferSceneMomentum(humanOwned, NOW), null, "ambient must not pile onto a recent human-owned scene");

const exhausted = Array.from({ length: V40_MAX_SCENE_TURNS }, (_, index) =>
  bot(index % 2 ? "CyberDude" : "SegaMan", `gaming line ${index}`, -7000 + index * 800, {
    target: index % 2 ? "SegaMan" : "CyberDude"
  })
);
assert.equal(inferSceneMomentum(exhausted, NOW), null, "a seven-turn scene must be free to end instead of being forcibly carried again");

const plan = [
  { speaker: "SegaMan", target: "CyberDude", intent: "reply", topic: "gaming", text: "saturn has better arcade ports" },
  { speaker: "CyberDude", target: "SegaMan", intent: "disagree", topic: "gaming", text: "tekken still wins though" },
  { speaker: "MetallicaFan", target: "room", intent: "ambient", topic: "music", text: "anyone got the new metallica cd" },
  { speaker: "SegaMan", target: "CyberDude", intent: "question", topic: "gaming", text: "you play ridge racer much" }
];
assert.deepEqual(
  selectSceneCarryIndices(plan, momentum),
  [0, 1, 3],
  "same-scene continuation lines should inherit the current scene while unrelated side chatter stays independent"
);

const agingMomentum = { ...momentum, turns: 6, phase: "aging" };
assert.equal(selectSceneCarryIndices(plan, agingMomentum).length, 1, "an aging six-turn scene may carry only one more line before the seven-turn cap");

assert.match(sceneMomentumPrompt(momentum), /V40 SCENE MOMENTUM LOCK/);
assert.match(sceneMomentumPrompt(momentum), /first 2-3 sends continue/i);
assert.equal(V40_TARGET_SCENE_TURNS, 4);
assert.equal(V40_MAX_SCENE_TURNS, 7);

const runtime = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
assert.ok(runtime.includes('from "./index_v39_world_gate.js"'), "v40 must remain additive above all stabilized v39 guards");
assert.ok(runtime.includes('reason === "background" ? this.currentAmbientMomentum(now) : null'), "scene carry must be background-only");
assert.ok(runtime.includes("item._continuitySceneId = momentum.sceneId"));
assert.ok(runtime.includes("this.registerSceneCarry?.(item, momentum.sceneId, planId)"));
assert.ok(runtime.includes("selectSceneCarryIndices(planItems, momentum)"));
assert.ok(runtime.includes("directHumanScenesRemainOwnedByHumanReplanPath: true"));
assert.ok(runtime.includes("noExtraProviderCallForContinuity: true"));
assert.ok(runtime.includes('url.pathname === "/v40-status"'));

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wrangler.includes('"main": "src/index_v40_scene_continuity.js"'));
assert.ok(wrangler.includes('"DEPLOY_VERSION": "40"'));

console.log("v40 scene-continuity and topic-churn regression checks passed");
