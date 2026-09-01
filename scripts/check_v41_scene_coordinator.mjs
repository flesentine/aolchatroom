import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SceneCoordinator,
  V41_FATIGUE_CLOSE_TURNS,
  V41_FATIGUE_STRONG_TURNS,
  V41_FATIGUE_WARN_TURNS
} from "../src/scene_coordinator_v41.js";
import { inferSceneMomentum, inferSceneMomentumCandidate } from "../src/scene_continuity_v40.js";

const NOW = Date.parse("2026-08-31T20:54:00-07:00");

function row(from, target, text, offset, extra = {}) {
  return {
    kind: "bot",
    from,
    target,
    text,
    topic: "gaming",
    sceneId: "s-live",
    messageId: `m-${Math.abs(offset)}-${from}`,
    at: NOW + offset,
    ...extra
  };
}

function fakeRoom({ history = [], scenes = [], humans = [] } = {}) {
  const sceneBoard = new Map(scenes.map((scene) => [scene.id, scene]));
  return {
    history,
    sceneBoard,
    sceneStats: { closed: 0 },
    humanNames: () => [...humans],
    openScenes: () => [...sceneBoard.values()].filter((scene) => !scene.closedAt && scene.status !== "closed")
  };
}

const botScene = [
  row("SegaMan", "CyberDude", "saturn pad feels better", -8000),
  row("CyberDude", "SegaMan", "playstation pad is easier", -3000, { intent: "reply" })
];

const candidate = inferSceneMomentumCandidate(botScene, NOW);
assert.equal(candidate?.sceneId, "s-live");
assert.equal(candidate?.turns, 2);
assert.equal(candidate?.phase, "building");
assert.deepEqual(inferSceneMomentum(botScene, NOW), candidate, "legacy v40 momentum result must remain unchanged for bot-only scenes");

const botRoom = fakeRoom({ history: botScene });
const botCoordinator = new SceneCoordinator(botRoom);
assert.equal(botCoordinator.ambientMomentum(NOW)?.sceneId, "s-live");
assert.equal(botCoordinator.stats.momentumEligible, 1);

const mismatchedHumanHistory = [
  { kind: "human", from: "Crateman", target: "BostonRob", text: "who is president", topic: "general", sceneId: "s-human", at: NOW - 8000 },
  { kind: "bot", from: "BostonRob", target: "Crateman", text: "Bill Clinton", topic: "general", sceneId: "s-answer", at: NOW - 3000 }
];
const humanCoordinator = new SceneCoordinator(fakeRoom({ history: mismatchedHumanHistory }));
assert.equal(humanCoordinator.ambientMomentum(NOW), null, "recent human identity must block ambient momentum even across mismatched scene ids");
assert.equal(humanCoordinator.stats.ambientHumanOwnershipBlocks, 1);

const activeHumanOnly = new SceneCoordinator(fakeRoom({
  history: [{ kind: "bot", from: "BostonRob", target: "Crateman", text: "Bill Clinton", topic: "general", sceneId: "s-active", at: NOW - 1000 }],
  humans: ["Crateman"]
}));
assert.equal(activeHumanOnly.ambientMomentum(NOW), null, "active human target must block bot ambient carry without a recent human row");

assert.equal(V41_FATIGUE_WARN_TURNS, 8);
assert.equal(V41_FATIGUE_STRONG_TURNS, 12);
assert.equal(V41_FATIGUE_CLOSE_TURNS, 15);

const agingScene = { id: "s-aging", topic: "gaming", turns: 8, status: "active", participants: ["A", "B"] };
const strongScene = { id: "s-strong", topic: "gaming", turns: 12, status: "active", participants: ["A", "B"] };
const exhaustedScene = { id: "s-exhausted", topic: "gaming", turns: 15, status: "active", participants: ["A", "B"] };
const fatigueRoom = fakeRoom({ scenes: [agingScene, strongScene, exhaustedScene] });
const fatigueCoordinator = new SceneCoordinator(fatigueRoom);
assert.equal(fatigueCoordinator.fatigueForScene(agingScene, NOW).phase, "aging");
assert.equal(fatigueCoordinator.fatigueForScene(strongScene, NOW).phase, "strong");
assert.equal(fatigueCoordinator.fatigueForScene(exhaustedScene, NOW).phase, "exhausted");

const exhaustedClosed = fatigueCoordinator.closeExhaustedScenes({
  source: "v37-ambient-exhaustion",
  reason: "v37 lively ambient fatigue boundary",
  now: NOW
});
assert.equal(exhaustedClosed.length, 1);
assert.equal(exhaustedClosed[0].sceneId, "s-exhausted");
assert.equal(exhaustedScene.status, "closed");
assert.equal(exhaustedScene.id, "s-exhausted", "coordinator must preserve v17 scene identity");
assert.equal(fatigueRoom.sceneStats.closed, 1);
assert.equal(fatigueCoordinator.stats.ambientExhaustionCloses, 1);

const protectedScene = {
  id: "s-protected",
  topic: "gaming",
  turns: 15,
  status: "active",
  participants: ["BostonRob", "Crateman"],
  openQuestion: { target: "Crateman", text: "you there?" }
};
const protectedRoom = fakeRoom({ scenes: [protectedScene], humans: ["Crateman"] });
const protectedCoordinator = new SceneCoordinator(protectedRoom);
assert.equal(protectedCoordinator.closeExhaustedScenes({ source: "v37-ambient-exhaustion", reason: "fatigue", now: NOW }).length, 0);
assert.equal(protectedScene.status, "active");
assert.equal(protectedCoordinator.stats.humanProtectedClosures, 1);

const topicScene = { id: "s-metal", topic: "metal", turns: 6, status: "active", participants: ["MetallicaFan", "JerseyGirl"], lastText: "load is growing on me" };
const topicRoom = fakeRoom({ scenes: [topicScene] });
const topicCoordinator = new SceneCoordinator(topicRoom);
const topicClosed = topicCoordinator.closeTopicFatigueScenes(["metal"], NOW);
assert.equal(topicClosed.length, 1);
assert.equal(topicClosed[0].sceneId, "s-metal");
assert.equal(topicCoordinator.stats.roomTopicFatigueCloses, 1);

const pivotScene = { id: "s-pivot", topic: "gaming", turns: 4, status: "active", participants: ["Crateman", "SegaMan"] };
const pivotRoom = fakeRoom({ scenes: [pivotScene] });
const pivotCoordinator = new SceneCoordinator(pivotRoom);
assert.equal(pivotCoordinator.closeHumanPivotScene("s-pivot", NOW)?.sceneId, "s-pivot");
assert.equal(pivotCoordinator.stats.humanPivotCloses, 1);

const openScene = { id: "s-open", status: "active", turns: 2 };
const openCoordinator = new SceneCoordinator(fakeRoom({ scenes: [openScene] }));
assert.equal(openCoordinator.continuationDecision(openScene, {}, NOW).allow, true);
openScene.status = "closed";
openScene.closedAt = NOW;
assert.equal(openCoordinator.continuationDecision(openScene, {}, NOW).allow, false);

const wrapper = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
assert.ok(wrapper.includes('from "./index_v40_scene_continuity.js"'), "v41 1A must remain additive above the exact v40 baseline");
assert.ok(wrapper.includes("this.sceneCoordinator = new SceneCoordinator(this)"));
assert.ok(wrapper.includes("currentAmbientMomentum(now = Date.now())"));
assert.ok(wrapper.includes("closeExhaustedAmbientScenes(now = Date.now())"));
assert.ok(wrapper.includes("applyRoomTopicFatigue(now = Date.now())"));
assert.ok(wrapper.includes("closeLegacySceneForPivot(human, move)"));
assert.ok(wrapper.includes("finishPlan(plan, status, reason = \"\")"));
assert.ok(wrapper.includes("v17AgeAndStorageLifecycleRemainBaseOwnedIn1A: true"));
assert.ok(!wrapper.includes("callProvider("), "SceneCoordinator wrapper must not introduce provider calls");

console.log("v41 SceneCoordinator 1A regression checks passed");
