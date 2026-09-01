import assert from "node:assert/strict";
import fs from "node:fs";
import {
  V40_MAX_SCENE_TURNS,
  V40_MOMENTUM_WINDOW_MS,
  V40_TARGET_SCENE_TURNS,
  inferSceneMomentum,
  inferSceneMomentumCandidate,
  sceneHasHumanParticipant,
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
assert.deepEqual(inferSceneMomentumCandidate(building, NOW), momentum, "raw v40 candidate must preserve bot-only momentum shape for v41 delegation");

const humanOwned = [
  ...building,
  { kind: "human", from: "Crateman", target: "SegaMan", topic: "gaming", sceneId: "s1", text: "what games do you have", at: NOW - 1000 }
];
assert.equal(inferSceneMomentum(humanOwned, NOW, ["Crateman"]), null, "ambient must not pile onto a recent human-owned scene");
assert.equal(inferSceneMomentumCandidate(humanOwned, NOW)?.sceneId, "s1", "candidate export intentionally precedes human ownership filtering for SceneCoordinator");

// Production capture regression: the human line and the bot answer can carry
// different scene IDs. The bot-created scene still targets Crateman, so it is a
// human-owned conversation and must never become an ambient carry target.
const mismatchedHumanScene = [
  { kind: "human", from: "Crateman", target: "BostonRob", topic: "general", sceneId: "s-human-question", text: "so who is the president", at: NOW - 8000 },
  { kind: "bot", from: "BostonRob", target: "Crateman", topic: "general", sceneId: "s-president-answer", text: "Bill Clinton. Look it up later", intent: "answer", at: NOW - 3000 }
];
assert.equal(
  sceneHasHumanParticipant(mismatchedHumanScene, [mismatchedHumanScene[1]], NOW, ["Crateman"]),
  true,
  "a bot scene targeting an active human must be recognized as human-participant even when scene IDs differ"
);
assert.equal(
  inferSceneMomentum(mismatchedHumanScene, NOW, ["Crateman"]),
  null,
  "BostonRob/Crateman capture shape must never be eligible for background carry"
);
assert.equal(
  inferSceneMomentum(mismatchedHumanScene, NOW),
  null,
  "recent human identity from history must also block the mismatched bot scene without relying only on active sockets"
);

const activeHumanTargetOnly = [
  { kind: "bot", from: "BostonRob", target: "Crateman", topic: "general", sceneId: "s-active-human", text: "Bill Clinton. Look it up later", intent: "answer", at: NOW - 1000 }
];
assert.equal(
  inferSceneMomentum(activeHumanTargetOnly, NOW, ["Crateman"]),
  null,
  "a scene targeting a currently active human must be excluded even if the matching human row is outside the local history window"
);

// Review regression: the prompt participant list is intentionally capped at eight,
// but the safety exclusion must inspect every participant. Crateman appears only
// after eight distinct bot participants here and still must block ambient carry.
const crowdedHumanScene = [
  { kind: "bot", from: "Bot1", target: "Bot2", topic: "gaming", sceneId: "s-crowded", text: "one", at: NOW - 5000 },
  { kind: "bot", from: "Bot3", target: "Bot4", topic: "gaming", sceneId: "s-crowded", text: "two", at: NOW - 4000 },
  { kind: "bot", from: "Bot5", target: "Bot6", topic: "gaming", sceneId: "s-crowded", text: "three", at: NOW - 3000 },
  { kind: "bot", from: "Bot7", target: "Bot8", topic: "gaming", sceneId: "s-crowded", text: "four", at: NOW - 2000 },
  { kind: "bot", from: "Bot9", target: "Crateman", topic: "gaming", sceneId: "s-crowded", text: "five", intent: "reply", at: NOW - 1000 }
];
assert.equal(
  sceneHasHumanParticipant(crowdedHumanScene, crowdedHumanScene, NOW, ["Crateman"]),
  true,
  "human exclusion must inspect all scene participants, not only the first eight used for prompt display"
);
assert.equal(
  inferSceneMomentum(crowdedHumanScene, NOW, ["Crateman"]),
  null,
  "an active human beyond the eight-name display cap must still categorically block carry"
);

const exhausted = Array.from({ length: V40_MAX_SCENE_TURNS }, (_, index) =>
  bot(index % 2 ? "CyberDude" : "SegaMan", `gaming line ${index}`, -7000 + index * 800, {
    target: index % 2 ? "SegaMan" : "CyberDude"
  })
);
assert.equal(inferSceneMomentum(exhausted, NOW), null, "a seven-turn scene must be free to end instead of being forcibly carried again");
assert.equal(inferSceneMomentumCandidate(exhausted, NOW), null, "raw candidate must retain the same seven-turn ambient carry ceiling");

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
assert.ok(runtime.includes("inferSceneMomentum(this.history || [], now, this.humanNames?.() || [])"), "standalone v40 runtime must retain its original active-human exclusion fallback");
assert.ok(runtime.includes("item._continuitySceneId = momentum.sceneId"));
assert.ok(runtime.includes("this.registerSceneCarry?.(item, momentum.sceneId, planId)"));
assert.ok(runtime.includes("selectSceneCarryIndices(planItems, momentum)"));
assert.ok(runtime.includes("directHumanScenesRemainOwnedByHumanReplanPath: true"));
assert.ok(runtime.includes('humanParticipantIdentityExclusion: "active-or-recent-90s"'));
assert.ok(runtime.includes("noExtraProviderCallForContinuity: true"));
assert.ok(runtime.includes('url.pathname === "/v40-status"'));

const helper = fs.readFileSync(new URL("../src/scene_continuity_v40.js", import.meta.url), "utf8");
assert.ok(helper.includes("sceneHasHumanParticipant(rows, recentSceneRows, now, activeHumanNames)"), "legacy v40 must keep its standalone human participant guard");
assert.ok(helper.includes("return participantNames(rows, 8)"), "prompt/display participant list may remain capped at eight");
assert.ok(helper.includes("return participantNames(sceneRows).some"), "human safety exclusion must use the untruncated participant set");
assert.ok(helper.includes("inferSceneMomentumCandidate"), "v41 must be able to ask v40 for a pre-ownership momentum candidate without changing legacy infer behavior");

const v41 = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
assert.ok(v41.includes('from "./index_v40_scene_continuity.js"'), "v41 must preserve v40 as its direct compatibility baseline");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wrangler.includes('"main": "src/index_v41_scene_coordinator.js"'));
assert.ok(wrangler.includes('"DEPLOY_VERSION": "41"'));

console.log("v40 scene-continuity and human-participant exclusion regression checks passed");
