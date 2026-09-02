import assert from "node:assert/strict";
import { SceneOwnershipCoordinator } from "../src/scene_ownership_coordinator_v41.js";

const NOW = Date.parse("2026-09-01T17:20:00-07:00");
const history = [
  {
    kind: "bot",
    from: "BostonRob",
    target: "Crateman",
    text: "Bill Clinton",
    topic: "general",
    sceneId: "s-human-recent",
    messageId: "m-human-target",
    at: NOW - 3000
  },
  {
    kind: "bot",
    from: "SegaMan",
    target: "BostonRob",
    text: "yeah",
    topic: "general",
    sceneId: "s-human-recent",
    messageId: "m-follow",
    at: NOW - 1000
  }
];
const scene = {
  id: "s-human-recent",
  topic: "general",
  participants: ["BostonRob", "Crateman", "SegaMan"],
  createdAt: NOW - 3000,
  lastAt: NOW - 1000,
  lastText: "yeah",
  turns: 2,
  status: "active",
  openQuestion: null
};
const sceneBoard = new Map([[scene.id, scene]]);
const room = {
  history,
  sceneBoard,
  sceneStats: { closed: 0 },
  humanNames: () => ["Crateman"],
  openScenes: () => [scene],
  messageById: (id) => history.find((row) => row.messageId === id) || null
};

const coordinator = new SceneOwnershipCoordinator(room);
assert.equal(coordinator.ambientMomentum(NOW, { record: true }), null, "recorded decision should block recent bot-to-human momentum");
assert.equal(coordinator.stats.ambientHumanOwnershipBlocks, 1);
assert.equal(coordinator.stats.ambientRecentHumanOwnershipBlocks, 1);

const beforeBase = coordinator.stats.ambientHumanOwnershipBlocks;
const beforeRecent = coordinator.stats.ambientRecentHumanOwnershipBlocks;
coordinator.snapshot(NOW);
coordinator.snapshot(NOW);
assert.equal(coordinator.stats.ambientHumanOwnershipBlocks, beforeBase, "snapshot reads must not increment the base ownership-block counter");
assert.equal(coordinator.stats.ambientRecentHumanOwnershipBlocks, beforeRecent, "snapshot reads must not increment the 1D recent-ownership counter");

console.log("v41 Phase 1D snapshot-safe ownership diagnostic regression passed");
