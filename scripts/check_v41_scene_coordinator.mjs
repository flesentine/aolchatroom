import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SceneCoordinator,
  V41_FATIGUE_CLOSE_TURNS,
  V41_FATIGUE_STRONG_TURNS,
  V41_FATIGUE_WARN_TURNS
} from "../src/scene_coordinator_v41.js";
import { inferSceneMomentum, inferSceneMomentumCandidate, selectSceneCarryIndices } from "../src/scene_continuity_v40.js";
import {
  V41_AMBIGUITY_MARGIN,
  V41_DIRECT_ASSOCIATION_THRESHOLD,
  V41_ROOM_ASSOCIATION_THRESHOLD,
  selectSceneAssociation
} from "../src/scene_identity_v41.js";

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
    messageById: (id) => [...history].reverse().find((item) => item?.messageId === id) || null,
    openScenes: () => [...sceneBoard.values()].filter((scene) => !scene.closedAt && scene.status !== "closed")
  };
}

// --- Phase 1C identity policy -------------------------------------------------
assert.equal(V41_DIRECT_ASSOCIATION_THRESHOLD, 48);
assert.equal(V41_ROOM_ASSOCIATION_THRESHOLD, 46);
assert.equal(V41_AMBIGUITY_MARGIN, 6);

const sceneA = {
  id: "s-saturn",
  topic: "gaming",
  participants: ["SegaMan", "CyberDude"],
  lastAt: NOW - 4000,
  lastText: "saturn pad feels better",
  turns: 4,
  status: "active",
  openQuestion: null
};
const sceneB = {
  id: "s-quake",
  topic: "gaming",
  participants: ["DoomKid", "QuakeGuy"],
  lastAt: NOW - 3000,
  lastText: "quake modem lag is brutal",
  turns: 3,
  status: "active",
  openQuestion: null
};
const parallelHistory = [
  row("SegaMan", "CyberDude", "saturn pad feels better", -9000, { sceneId: "s-saturn", messageId: "m-saturn-1" }),
  row("CyberDude", "SegaMan", "yeah but playstation pad is easier", -4000, { sceneId: "s-saturn", messageId: "m-saturn-2", intent: "reply" }),
  row("DoomKid", "QuakeGuy", "quake modem lag is brutal", -3000, { sceneId: "s-quake", messageId: "m-quake-1" })
];

const pairPick = selectSceneAssociation({
  message: { kind: "bot", from: "SegaMan", target: "CyberDude", text: "tekken still wins", topic: "gaming", intent: "disagree" },
  scenes: [sceneB, sceneA],
  history: parallelHistory,
  now: NOW
});
assert.equal(pairPick.sceneId, "s-saturn", "direct pair ownership must beat a slightly newer unrelated same-topic scene");
assert.equal(pairPick.reason, "direct-pair");

const strangerTarget = selectSceneAssociation({
  message: { kind: "human", from: "NewKid", target: "CyberDude", text: "hey whats up", topic: "general", intent: "reply" },
  scenes: [sceneA, sceneB],
  history: parallelHistory,
  now: NOW
});
assert.equal(strangerTarget.sceneId, "", "target presence alone must not hijack somebody else's active scene");
assert.equal(strangerTarget.reason, "below-threshold");

const freshSameTopic = selectSceneAssociation({
  message: { kind: "bot", from: "SegaMan", target: "room", text: "goldeneye was cool", topic: "gaming", intent: "ambient" },
  scenes: [sceneA],
  history: parallelHistory,
  now: NOW
});
assert.equal(freshSameTopic.sceneId, "", "a participant's unrelated ambient gaming subject must not be merged only because topic=gaming");

const roomFollowup = selectSceneAssociation({
  message: { kind: "bot", from: "SegaMan", target: "room", text: "saturn pad is still better", topic: "gaming", intent: "reply" },
  scenes: [sceneA, sceneB],
  history: parallelHistory,
  now: NOW
});
assert.equal(roomFollowup.sceneId, "s-saturn", "participant + lexical continuity should keep a room-target follow-up in its scene");
assert.equal(roomFollowup.reason, "participant-context");

const contextlessReaction = selectSceneAssociation({
  message: { kind: "bot", from: "SegaMan", target: "room", text: "lol", topic: "general", intent: "reaction" },
  scenes: [sceneA, sceneB],
  history: parallelHistory,
  now: NOW
});
assert.equal(contextlessReaction.sceneId, "s-saturn", "a contextless reaction from a current participant should stay with that participant's scene");

const ambiguousA = { id: "s-games-a", topic: "gaming", participants: ["A", "B"], lastAt: NOW - 4000, lastText: "games are fun tonight", turns: 2, status: "active" };
const ambiguousB = { id: "s-games-b", topic: "gaming", participants: ["C", "D"], lastAt: NOW - 4500, lastText: "games are fun lately", turns: 2, status: "active" };
const ambiguous = selectSceneAssociation({
  message: { kind: "bot", from: "NewKid", target: "room", text: "games are cool", topic: "gaming", intent: "reply" },
  scenes: [ambiguousA, ambiguousB],
  history: [
    row("A", "B", "games are fun tonight", -4000, { sceneId: "s-games-a" }),
    row("C", "D", "games are fun lately", -4500, { sceneId: "s-games-b" })
  ],
  now: NOW
});
assert.equal(ambiguous.sceneId, "", "near-tied weak same-topic scenes should produce no arbitrary association");
assert.equal(ambiguous.reason, "ambiguous");

const identityRoom = fakeRoom({ history: parallelHistory, scenes: [sceneA, sceneB] });
const identityCoordinator = new SceneCoordinator(identityRoom);
const explicit = identityCoordinator.associateScene({ from: "SegaMan", target: "room", text: "carried line", sceneId: "s-saturn" }, NOW);
assert.equal(explicit.scene?.id, "s-saturn", "explicit v25/v40 carried sceneId must remain a hard anchor");
assert.equal(explicit.reason, "explicit-scene-id");

const replyAnchor = identityCoordinator.associateScene({ from: "NewKid", target: "room", text: "really?", replyTo: "m-quake-1" }, NOW);
assert.equal(replyAnchor.scene?.id, "s-quake", "replyTo must remain a hard scene-ownership anchor even for contextless text");
assert.equal(replyAnchor.reason, "reply-to");

const forced = identityCoordinator.associateScene({ from: "SegaMan", target: "CyberDude", text: "new subject", _v37ForceNewScene: true }, NOW);
assert.equal(forced.scene, null, "Human Director replace/pivot must force a new scene before fuzzy association");
assert.equal(forced.reason, "forced-new-scene");

const closedAnchorScene = { ...sceneA, id: "s-closed-anchor", status: "closed", closedAt: NOW - 1000 };
const closedCoordinator = new SceneCoordinator(fakeRoom({ scenes: [closedAnchorScene] }));
const closedAnchor = closedCoordinator.associateScene({ from: "SegaMan", target: "CyberDude", text: "one more thing", sceneId: "s-closed-anchor" }, NOW);
assert.equal(closedAnchor.scene?.id, "s-closed-anchor", "explicit closed scene must reach the continuation guard rather than silently remap elsewhere");
assert.equal(closedCoordinator.continuationDecision(closedAnchor.scene, {}, NOW).allow, false);

// --- Existing Phase 1A/1B lifecycle contracts remain unchanged -------------
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

const carryLines = [
  { speaker: "SegaMan", target: "CyberDude", intent: "reply", topic: "gaming", text: "saturn ports are still better" },
  { speaker: "MetallicaFan", target: "room", intent: "ambient", topic: "music", text: "metallica anyone" },
  { speaker: "CyberDude", target: "SegaMan", intent: "disagree", topic: "gaming", text: "tekken still wins" }
];
assert.deepEqual(
  botCoordinator.selectCarryIndices(carryLines, candidate),
  selectSceneCarryIndices(carryLines, candidate),
  "SceneCoordinator must own production carry selection without changing the v40 algorithm"
);
assert.equal(botCoordinator.stats.carrySelectionQueries, 1);

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

// --- Source-chain invariants --------------------------------------------------
const wrapper = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
const identity = fs.readFileSync(new URL("../src/scene_identity_v41.js", import.meta.url), "utf8");
const v17 = fs.readFileSync(new URL("../src/index_v17.js", import.meta.url), "utf8");
const v26 = fs.readFileSync(new URL("../src/index_v26.js", import.meta.url), "utf8");
const humanDirector = fs.readFileSync(new URL("../src/index_v37_human_director.js", import.meta.url), "utf8");
const lively = fs.readFileSync(new URL("../src/index_v37_lively_ambient.js", import.meta.url), "utf8");
const v38 = fs.readFileSync(new URL("../src/index_v38_quality_guard.js", import.meta.url), "utf8");
const v40 = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");

assert.ok(wrapper.includes('from "./index_v40_scene_continuity.js"'), "v41 1C must remain additive above the exact v40 baseline");
assert.ok(wrapper.includes("this.sceneCoordinator = new SceneCoordinator(this)"));
assert.ok(wrapper.includes("sceneLifecycleAuthority()"));
assert.ok(wrapper.includes("sceneForMessage(message, now = Date.now())"), "1C must make v41 production identity explicit");
assert.ok(wrapper.includes("this.sceneCoordinator.associateScene(message, now)"));
assert.ok(wrapper.includes('phase: "1C"'));
assert.ok(wrapper.includes("v17LegacyFuzzyMatcherBypassedInV41Production: true"));
assert.ok(wrapper.includes("duplicateLifecycleDecisionPolicyRetiredFromProductionPath: true"));
assert.ok(!wrapper.includes("currentAmbientMomentum(now = Date.now())"), "1C must not resurrect the 1A momentum interception");
assert.ok(!wrapper.includes("closeExhaustedAmbientScenes(now = Date.now())"), "1C must not resurrect the 1A ambient-close interception");
assert.ok(!wrapper.includes("applyRoomTopicFatigue(now = Date.now())"), "1C must not resurrect the 1A topic-close interception");
assert.ok(!wrapper.includes("closeLegacySceneForPivot(human, move)"), "1C must not resurrect the 1A pivot interception");
assert.ok(!wrapper.includes("finishPlan(plan, status, reason = \"\")"), "1C must not resurrect the 1A v26 finish interception");
assert.ok(!wrapper.includes("callProvider("), "scene identity must not introduce provider calls");
assert.ok(identity.includes("selectSceneAssociation"));
assert.ok(identity.includes("V41_AMBIGUITY_MARGIN"));
assert.ok(v17.includes("DIRECT_REPLY_WINDOW_MS"), "frozen v40 baseline must retain the legacy v17 matcher for standalone characterization");

for (const [name, source] of [
  ["v26", v26],
  ["v37 human director", humanDirector],
  ["v37 lively", lively],
  ["v38", v38],
  ["v40", v40]
]) {
  assert.ok(source.includes("this.sceneLifecycleAuthority?.()"), `${name} must retain Phase 1B lifecycle delegation`);
}
assert.ok(v40.includes("authority.selectCarryIndices(planItems, momentum)"), "v40 carry selection must remain delegated to SceneCoordinator");
assert.ok(v26.includes("authority.fatigueForScene(scene, now)"), "v26 prompt fatigue phase must remain delegated to SceneCoordinator");
assert.ok(lively.includes("authority.continuationDecision(scene, message, now)"), "inherited fallback continuation must remain delegated when top identity is absent");

console.log("v41 SceneCoordinator Phase 1C scene-identity + lifecycle regression checks passed");
