import { ChatRoom as ProductionChatRoom } from "../src/index_v41_scene_coordinator.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function bot(from, target, text, at, extra = {}) {
  return {
    kind: "bot",
    from,
    target,
    text,
    topic: "gaming",
    sceneId: "s-live",
    messageId: `m-${at}-${from}`,
    at,
    ...extra
  };
}

export class RuntimeSceneCoordinatorRoom extends ProductionChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.contractHumanRow = null;
  }

  resetContractState({ history = [], bots = [] } = {}) {
    this.loaded = true;
    this.social = null;
    this.history = history.map((row) => ({ ...row }));
    this.activeBotNames = [...bots];
    this.talkerNames = [...bots];
    this.aiQueue = [];
    this.pendingHumans = [];
    this.nextBotAt = Date.now();
    this.nextScenePlanAt = 0;
    this.sceneHydrated = true;
    this.sceneBoard?.clear?.();
    this.contractHumanRow = null;
  }

  hydrateContractScenes() {
    this.sceneBoard.clear();
    this.sceneHydrated = false;
    this.hydrateScenesFromHistory();
  }

  humanHistoryRow(human) {
    if (this.contractHumanRow) return { ...this.contractHumanRow };
    return super.humanHistoryRow(human);
  }

  liveBotScene(now = Date.now()) {
    return [
      bot("SegaMan", "CyberDude", "saturn pad feels better", now - 8000),
      bot("CyberDude", "SegaMan", "playstation pad is easier", now - 3000, { intent: "reply" })
    ];
  }

  contractCoordinatorMomentum() {
    const now = Date.now();
    this.resetContractState({ history: this.liveBotScene(now), bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    equal(this.currentAmbientMomentum(now)?.sceneId, "s-live", "v40 production method should delegate healthy momentum to v41 coordinator");
    ensure(this.sceneCoordinator.stats.momentumEligible >= 1, "coordinator should own the eligible momentum decision");

    this.resetContractState({
      history: [
        { kind: "human", from: "Crateman", target: "BostonRob", text: "who is president", topic: "general", sceneId: "s-human", at: now - 8000 },
        { kind: "bot", from: "BostonRob", target: "Crateman", text: "Bill Clinton", topic: "general", sceneId: "s-answer", at: now - 3000 }
      ],
      bots: ["BostonRob"]
    });
    this.hydrateContractScenes();
    equal(this.currentAmbientMomentum(now), null, "v41 coordinator must block ambient carry into recent human identity");
    ensure(this.sceneCoordinator.stats.ambientHumanOwnershipBlocks >= 1, "human ownership block should be recorded by coordinator");
    return { eligible: true, humanOwnershipBlocked: true };
  }

  contractCoordinatorFatigueDelegation() {
    const now = Date.now();
    const history = Array.from({ length: 12 }, (_, index) =>
      bot(index % 2 ? "CyberDude" : "SegaMan", index % 2 ? "SegaMan" : "CyberDude", `aging line ${index}`, now - 12000 + index * 800)
    );
    this.resetContractState({ history, bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    const before = this.sceneCoordinator.stats.fatigueQueries;
    const scene = this.fatiguedScene(now);
    equal(scene?.id, "s-live", "v26 fatiguedScene should still find the 12-turn scene");
    ensure(this.sceneCoordinator.stats.fatigueQueries > before, "v26 fatigue lookup must delegate to SceneCoordinator in production");
    equal(this.sceneCoordinator.fatigueForScene(scene, now, { record: false }).phase, "strong", "coordinator owns the strong-fatigue threshold");
    return { sceneId: scene.id, phase: "strong", delegated: true };
  }

  contractCoordinatorCarryDelegation() {
    const now = Date.now();
    this.resetContractState({ history: this.liveBotScene(now), bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    const before = this.sceneCoordinator.stats.carrySelectionQueries;
    const queued = this.queueScenePlan([
      { speaker: "SegaMan", target: "CyberDude", intent: "reply", topic: "gaming", text: "saturn ports still win", source: "gemini" },
      { speaker: "CyberDude", target: "SegaMan", intent: "disagree", topic: "gaming", text: "tekken says otherwise", source: "gemini" }
    ], "background", null, false);
    equal(queued, 2, "two healthy continuation lines should survive lower queue filters");
    equal(this.sceneCoordinator.stats.carrySelectionQueries, before + 1, "v40 carry selection must delegate exactly once to SceneCoordinator");
    const planId = this.currentScenePlan?.id || "";
    const items = this.aiQueue.filter((item) => item?._scenePlanId === planId);
    ensure(items.length === 2 && items.every((item) => item._continuitySceneId === "s-live"), "delegated carry must preserve existing v40 scene-id annotation behavior");
    return { queued, carried: 2, delegated: true };
  }

  contractCoordinatorAmbientClose() {
    const now = Date.now();
    const history = Array.from({ length: 15 }, (_, index) =>
      bot(index % 2 ? "CyberDude" : "SegaMan", index % 2 ? "SegaMan" : "CyberDude", `gaming line ${index}`, now - 15000 + index * 800)
    );
    this.resetContractState({ history, bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    const scene = this.sceneBoard.get("s-live");
    equal(scene?.turns, 15, "hydrated scene should retain the legacy 15-turn exhaustion threshold");

    const closed = this.closeExhaustedAmbientScenes(now);
    equal(closed, 1, "v37 ambient exhaustion path should close exactly one scene through coordinator");
    equal(scene.status, "closed", "coordinator should perform the scene mutation");
    equal(scene.id, "s-live", "v17 scene id must survive the coordinator extraction");
    equal(this.v37LivelyAmbientStats.exhaustedScenesClosedBeforePlan, 1, "legacy v37 counter must still increment");
    equal(this.sceneCoordinator.stats.ambientExhaustionCloses, 1, "v41 coordinator must own the close decision");
    return { sceneId: scene.id, closed, legacyCounterPreserved: true };
  }

  contractCoordinatorTopicClose() {
    const now = Date.now();
    const history = Array.from({ length: 9 }, (_, index) => ({
      kind: "bot",
      from: index % 2 ? "SegaMan" : "CyberDude",
      target: index % 2 ? "CyberDude" : "SegaMan",
      text: index % 2 ? "playstation games again" : "saturn games again",
      topic: "gaming",
      sceneId: "s-fatigue",
      messageId: `m-fatigue-${index}`,
      at: now - 18000 + index * 1200
    }));
    this.resetContractState({ history, bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    const scene = this.sceneBoard.get("s-fatigue");
    ensure(scene, "fatigue scene should hydrate");

    const fatigue = this.applyRoomTopicFatigue(now);
    ensure((fatigue.topics || []).some((row) => row.topic === "gaming"), "v38 detector should still identify gaming fatigue");
    equal(scene.status, "closed", "v38 topic fatigue close should now mutate through coordinator");
    equal(this.v38QualityStats.topicFatigueSceneCloses, 1, "legacy v38 close counter must still increment");
    equal(this.sceneCoordinator.stats.roomTopicFatigueCloses, 1, "v41 coordinator should own room-topic close decision");
    return { topic: "gaming", closed: true, legacyCounterPreserved: true };
  }

  contractCoordinatorHumanPivot() {
    const now = Date.now();
    const history = [
      { kind: "human", from: "Crateman", target: "SegaMan", text: "what games", topic: "gaming", sceneId: "s-human-pivot", messageId: "m-human-pivot", at: now - 3000 },
      { kind: "bot", from: "SegaMan", target: "Crateman", text: "mostly saturn", topic: "gaming", sceneId: "s-human-pivot", messageId: "m-human-answer", at: now - 1000 }
    ];
    this.resetContractState({ history, bots: ["SegaMan"] });
    this.hydrateContractScenes();
    this.contractHumanRow = history[0];
    const scene = this.sceneBoard.get("s-human-pivot");
    ensure(scene, "human scene should hydrate before pivot");

    this.closeLegacySceneForPivot({ from: "Crateman", text: "actually different topic" }, { sceneAction: "replace" });
    equal(scene.status, "closed", "human replace/pivot must close the old scene");
    equal(this.v37HumanDirectorStats.pivotScenesClosed, 1, "legacy v37 pivot counter must remain intact");
    equal(this.sceneCoordinator.stats.humanPivotCloses, 1, "v41 coordinator should own pivot close mutation");
    return { sceneId: scene.id, closed: true };
  }

  contractCoordinatorResurrectionGuard() {
    const now = Date.now();
    this.resetContractState({ history: this.liveBotScene(now), bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    const scene = this.sceneBoard.get("s-live");
    ensure(scene, "scene must hydrate before close-resurrection contract");
    scene.status = "closed";
    scene.closedAt = now;
    scene.closeReason = "runtime-contract";

    const beforeCoordinatorBlocks = this.sceneCoordinator.stats.continuationBlocks;
    const beforeLegacyBlocks = this.v37LivelyAmbientStats.closedSceneResurrectionBlocks;
    const found = this.sceneForMessage({
      kind: "bot",
      from: "SegaMan",
      target: "CyberDude",
      topic: "gaming",
      sceneId: "s-live",
      text: "one more thing",
      at: now
    }, now);
    equal(found, null, "closed scene must remain impossible to rediscover");
    equal(this.sceneCoordinator.stats.continuationBlocks, beforeCoordinatorBlocks + 1, "SceneCoordinator must own the final closed-scene veto");
    equal(this.v37LivelyAmbientStats.closedSceneResurrectionBlocks, beforeLegacyBlocks + 1, "legacy v37 resurrection telemetry must remain comparable");
    return { blockedByCoordinator: true, legacyCounterPreserved: true };
  }

  contractCoordinatorStatus() {
    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.deployVersion, 41, "v41 status should identify deploy version 41");
    equal(snapshot.phase, "1B", "v41 status should identify Phase 1B");
    equal(snapshot.policy.v17SceneIdentityAndHydrationPreserved, true, "1B must preserve v17 identity/hydration");
    equal(snapshot.policy.legacySceneLayersDelegateThroughAuthorityHook, true, "legacy scene layers must delegate instead of competing");
    equal(snapshot.policy.duplicateLifecycleDecisionPolicyRetiredFromProductionPath, true, "duplicate lifecycle decisions must be retired from production");
    equal(snapshot.policy.closedSceneContinuationRoutedThroughCoordinator, true, "closed-scene continuation must be coordinator-owned");
    equal(snapshot.policy.noAdditionalProviderCall, true, "SceneCoordinator must remain provider-free");
    equal(this.sceneLifecycleAuthority(), this.sceneCoordinator, "v41 must expose exactly its SceneCoordinator through the authority hook");
    return { deployVersion: snapshot.deployVersion, phase: snapshot.phase };
  }

  async runContract(name) {
    if (name === "coordinator-momentum") return this.contractCoordinatorMomentum();
    if (name === "coordinator-fatigue-delegation") return this.contractCoordinatorFatigueDelegation();
    if (name === "coordinator-carry-delegation") return this.contractCoordinatorCarryDelegation();
    if (name === "coordinator-ambient-close") return this.contractCoordinatorAmbientClose();
    if (name === "coordinator-topic-close") return this.contractCoordinatorTopicClose();
    if (name === "coordinator-human-pivot") return this.contractCoordinatorHumanPivot();
    if (name === "coordinator-resurrection-guard") return this.contractCoordinatorResurrectionGuard();
    if (name === "coordinator-status") return this.contractCoordinatorStatus();
    throw new Error(`unknown v41 SceneCoordinator contract: ${name}`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/contract/")) return super.fetch(request);
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    try {
      const detail = await this.runContract(name);
      return Response.json({ ok: true, contract: name, detail });
    } catch (error) {
      return Response.json({
        ok: false,
        contract: name,
        error: String(error?.message || error),
        stack: String(error?.stack || "").split("\n").slice(0, 8)
      }, { status: 500 });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd", phase: "1B" });
    if (!url.pathname.startsWith("/contract/")) return new Response("v41 SceneCoordinator contract only", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    const id = env.CONTRACT_ROOMS.idFromName(`v41-scene-${name}`);
    return env.CONTRACT_ROOMS.get(id).fetch(new Request(`https://room.internal/contract/${encodeURIComponent(name)}`));
  }
};
