import assert from "node:assert/strict";
import fs from "node:fs";
import { SceneOwnershipCoordinator } from "../src/scene_ownership_coordinator_v41.js";
import {
  effectiveMessageSubject,
  effectiveSceneSubject,
  inspectEffectiveOpenQuestion,
  selectSceneAssociationV41D,
  V41D_OPEN_QUESTION_WINDOW_MS
} from "../src/scene_ownership_policy_v41.js";

const NOW = Date.parse("2026-09-01T16:20:00-07:00");

function fakeRoom({ history = [], scenes = [], humans = [], currentScenePlan = null } = {}) {
  const sceneBoard = new Map(scenes.map((scene) => [scene.id, scene]));
  return {
    history,
    sceneBoard,
    sceneStats: { closed: 0 },
    currentScenePlan,
    clearSceneCarryPlanCalls: [],
    clearSceneCarryPlan(planId) { this.clearSceneCarryPlanCalls.push(planId); },
    humanNames: () => [...humans],
    messageById: (id) => [...history].reverse().find((row) => row?.messageId === id) || null,
    openScenes: () => [...sceneBoard.values()].filter((scene) => !scene.closedAt && scene.status !== "closed")
  };
}

function scene(id, extra = {}) {
  return {
    id,
    topic: "general",
    participants: [],
    createdAt: NOW - 60000,
    lastAt: NOW - 5000,
    lastText: "",
    turns: 2,
    status: "active",
    openQuestion: null,
    ...extra
  };
}

// Zelda-style stale-question failure from the Phase 1C production capture.
const staleQuestionScene = scene("s-asl", {
  topic: "asl",
  participants: ["RaveChick", "Crateman"],
  lastAt: NOW - 183000,
  lastText: "asl?",
  openQuestion: { messageId: "m-asl", from: "RaveChick", target: "Crateman", text: "asl?", at: NOW - 183000 }
});
const staleHistory = [
  { kind: "bot", from: "RaveChick", target: "Crateman", text: "asl?", topic: "asl", sceneId: "s-asl", messageId: "m-asl", at: NOW - 183000 }
];
const stalePick = selectSceneAssociationV41D({
  message: { kind: "human", from: "Crateman", target: "room", text: "i heard there is a secret room in zelda 3", topic: "general", intent: "human" },
  scenes: [staleQuestionScene],
  history: staleHistory,
  now: NOW
});
assert.equal(stalePick.sceneId, "", "stale asl question must not claim an unrelated room-target Zelda message");
assert.equal(stalePick.reason, "room-continuity-ineligible");
assert.equal(stalePick.candidates[0]?.features?.staleOpenQuestionIgnored, true);
assert.equal(stalePick.candidates[0]?.features?.messageSubject, "gaming");
assert.equal(stalePick.candidates[0]?.features?.sceneSubject, "asl");

// Fresh unanswered questions remain valid fuzzy ownership evidence.
const freshQuestionScene = scene("s-fresh", {
  topic: "asl",
  participants: ["RaveChick", "Crateman"],
  lastAt: NOW - 30000,
  lastText: "asl?",
  openQuestion: { messageId: "m-fresh", from: "RaveChick", target: "Crateman", text: "asl?", at: NOW - 30000 }
});
const freshHistory = [
  { kind: "bot", from: "RaveChick", target: "Crateman", text: "asl?", topic: "asl", sceneId: "s-fresh", messageId: "m-fresh", at: NOW - 30000 }
];
const freshPick = selectSceneAssociationV41D({
  message: { kind: "human", from: "Crateman", target: "room", text: "19 m ca", topic: "general", intent: "human" },
  scenes: [freshQuestionScene],
  history: freshHistory,
  now: NOW
});
assert.equal(freshPick.sceneId, "s-fresh", "fresh open question should still own a context-light answer");
assert.equal(freshPick.reason, "open-question");

// Stored open questions that were already answered must stop influencing identity.
const answeredHistory = [
  ...freshHistory,
  { kind: "human", from: "Crateman", target: "RaveChick", text: "19 m ca", topic: "asl", sceneId: "s-fresh", messageId: "m-answer", at: NOW - 20000 }
];
const answeredState = inspectEffectiveOpenQuestion(freshQuestionScene, answeredHistory, NOW);
assert.equal(answeredState.question, null);
assert.equal(answeredState.answered, true);
const answeredPick = selectSceneAssociationV41D({
  message: { kind: "human", from: "Crateman", target: "room", text: "pizza sounds good", topic: "general", intent: "human" },
  scenes: [freshQuestionScene],
  history: answeredHistory,
  now: NOW
});
assert.equal(answeredPick.sceneId, "", "answered stored question must not capture later room chatter");

// Participant + recency alone is no longer sufficient for room ownership.
const recentParticipantScene = scene("s-recent", {
  topic: "work",
  participants: ["Crateman", "BostonRob"],
  lastAt: NOW - 5000,
  lastText: "bar was packed tonight"
});
const recentParticipantHistory = [
  { kind: "bot", from: "BostonRob", target: "Crateman", text: "bar was packed tonight", topic: "work", sceneId: "s-recent", at: NOW - 5000 }
];
const weakRoom = selectSceneAssociationV41D({
  message: { kind: "human", from: "Crateman", target: "room", text: "pizza sounds good", topic: "general", intent: "human" },
  scenes: [recentParticipantScene],
  history: recentParticipantHistory,
  now: NOW
});
assert.equal(weakRoom.sceneId, "");
assert.equal(weakRoom.reason, "room-continuity-ineligible", "participant + recency alone must fail before score thresholding");

// Stored scene topic can be stale; recent rows determine effective subject without mutation.
const driftScene = scene("s-drift", {
  topic: "greeting",
  participants: ["Crateman", "CaliGrrl"],
  lastAt: NOW - 4000,
  lastText: "pokemon is on gameboy"
});
const driftHistory = [
  { kind: "bot", from: "CaliGrrl", target: "Crateman", text: "hey crateman", topic: "greeting", sceneId: "s-drift", at: NOW - 30000 },
  { kind: "human", from: "Crateman", target: "CaliGrrl", text: "is pokemon on gameboy", topic: "general", sceneId: "s-drift", at: NOW - 9000 },
  { kind: "bot", from: "CaliGrrl", target: "Crateman", text: "yeah pokemon is on gameboy", topic: "general", sceneId: "s-drift", at: NOW - 4000 }
];
assert.equal(effectiveSceneSubject(driftScene, driftHistory, NOW), "gaming");
assert.equal(driftScene.topic, "greeting", "effective subject must not mutate v17 stored topic");
const driftPick = selectSceneAssociationV41D({
  message: { kind: "human", from: "Crateman", target: "room", text: "zelda on gameboy would be cool", topic: "general", intent: "reply" },
  scenes: [driftScene],
  history: driftHistory,
  now: NOW
});
assert.equal(driftPick.sceneId, "s-drift", "recent effective gaming subject should preserve a genuine room-target follow-up");

for (const text of ["zelda 3", "pokemon", "gameboy", "neo geo", "street fighter 2"]) {
  assert.equal(effectiveMessageSubject({ text, topic: "general" }), "gaming", `${text} should provide gaming evidence when upstream topic is general`);
}
assert.equal(V41D_OPEN_QUESTION_WINDOW_MS, 95000);

// Human-replan blanket carry is retired after legacy v25 has populated it.
const humanScene = scene("s-human", { participants: ["Crateman", "CaliGrrl"] });
const ownershipRoom = fakeRoom({ scenes: [humanScene] });
const ownershipCoordinator = new SceneOwnershipCoordinator(ownershipRoom);
const plan = { id: "p-human", reason: "human-replan", triggerFrom: "Crateman", triggerMessageId: "m-human" };
const queue = [
  { speaker: "CaliGrrl", target: "Crateman", text: "yeah i played it", _scenePlanId: "p-human", _continuitySceneId: "s-human" },
  { speaker: "xXBabyGirlXx", target: "room", text: "that mtv video was weird", _scenePlanId: "p-human", _continuitySceneId: "s-human" },
  { speaker: "CyberDude", target: "SoCalGuy", text: "weekend lookin good", _scenePlanId: "p-human", _continuitySceneId: "s-human" }
];
const stabilized = ownershipCoordinator.stabilizeHumanReplanPlan(plan, queue);
assert.deepEqual(stabilized, { examined: 3, detached: 2, anchored: 1, retired: 3 });
assert.equal(queue[0].replyTo, "m-human", "direct human response should use structural replyTo instead of blanket scene carry");
assert.equal(queue[0]._continuitySceneId, undefined);
assert.equal(queue[1]._v41HumanReplanSideLine, true);
assert.equal(queue[2]._v41HumanReplanSideLine, true);
assert.deepEqual(ownershipRoom.clearSceneCarryPlanCalls, ["p-human"]);

// Detached side chatter may not evict one of three existing scenes just to get an ID.
ownershipRoom.currentScenePlan = plan;
ownershipRoom.sceneBoard = new Map([
  ["s1", scene("s1")], ["s2", scene("s2")], ["s3", scene("s3")]
]);
assert.equal(ownershipCoordinator.shouldPreventSideLineSceneEviction({
  planReason: "human-replan", target: "SoCalGuy", text: "weekend lookin good"
}, NOW), true);
ownershipCoordinator.noteSideLineSceneCapEvictionBlock();
assert.equal(ownershipCoordinator.stats.sideLineSceneCapEvictionBlocks, 1);

// Active humans that are only stale stored participants no longer poison bot-only momentum.
const oldHumanScene = scene("s-old-human", { participants: ["Crateman", "SegaMan", "CyberDude"], lastAt: NOW - 3000 });
const oldHumanHistory = [
  { kind: "human", from: "Crateman", target: "SegaMan", text: "what game", sceneId: "s-old-human", at: NOW - 100000 },
  { kind: "bot", from: "SegaMan", target: "CyberDude", text: "saturn pad", sceneId: "s-old-human", at: NOW - 8000 },
  { kind: "bot", from: "CyberDude", target: "SegaMan", text: "playstation pad", sceneId: "s-old-human", at: NOW - 3000 }
];
const oldHumanRoom = fakeRoom({ history: oldHumanHistory, scenes: [oldHumanScene], humans: ["Crateman"] });
const oldHumanCoordinator = new SceneOwnershipCoordinator(oldHumanRoom);
assert.equal(oldHumanCoordinator.ambientHumanOwnership({ sceneId: "s-old-human" }, NOW).owned, false, "stale stored human participant must not block recent bot-only momentum");

const recentTargetHistory = [
  { kind: "bot", from: "BostonRob", target: "Crateman", text: "Bill Clinton", sceneId: "s-recent-human", at: NOW - 3000 }
];
const recentTargetRoom = fakeRoom({ history: recentTargetHistory, scenes: [scene("s-recent-human")], humans: ["Crateman"] });
const recentTargetCoordinator = new SceneOwnershipCoordinator(recentTargetRoom);
assert.equal(recentTargetCoordinator.ambientHumanOwnership({ sceneId: "s-recent-human" }, NOW).owned, true, "recent bot-to-human line must preserve #41 human pile-on protection");

// Closure uses the same effective-question semantics as association.
const staleClosureRoom = fakeRoom({ history: staleHistory, scenes: [staleQuestionScene], humans: ["Crateman"] });
const staleClosureCoordinator = new SceneOwnershipCoordinator(staleClosureRoom);
assert.equal(staleClosureCoordinator.closureHumanOwnership(staleQuestionScene, NOW).protected, false, "stale stored question alone must not protect a scene from fatigue closure");
const freshClosureRoom = fakeRoom({ history: freshHistory, scenes: [freshQuestionScene], humans: ["Crateman"] });
const freshClosureCoordinator = new SceneOwnershipCoordinator(freshClosureRoom);
assert.equal(freshClosureCoordinator.closureHumanOwnership(freshQuestionScene, NOW).protected, true, "fresh effective question targeting active human must protect the scene");

const wrapper = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
assert.ok(wrapper.includes('SceneOwnershipCoordinator'));
assert.ok(wrapper.includes('phase: "1D"'));
assert.ok(wrapper.includes('stabilizeHumanReplanPlan'));
assert.ok(wrapper.includes('shouldPreventSideLineSceneEviction'));
assert.ok(!wrapper.includes('callProvider('), "Phase 1D must not add provider calls");

console.log("v41 Phase 1D scene ownership stabilization checks passed");
