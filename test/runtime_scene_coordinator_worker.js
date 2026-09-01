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

  parallelGamingScenes(now = Date.now()) {
    return [
      bot("SegaMan", "CyberDude", "saturn pad feels better", now - 9000, { sceneId: "s-saturn", messageId: "m-saturn-1" }),
      bot("CyberDude", "SegaMan", "playstation pad is easier", now - 4000, { sceneId: "s-saturn", messageId: "m-saturn-2", intent: "reply" }),
      bot("DoomKid", "QuakeGuy", "quake modem lag is brutal", now - 3000, { sceneId: "s-quake", messageId: "m-quake-1" })
    ];
  }

  contractIdentityPairOwnership() {
    const now = Date.now();
    this.resetContractState({ history: this.parallelGamingScenes(now), bots: ["SegaMan", "CyberDude", "DoomKid", "QuakeGuy"] });
    this.hydrateContractScenes();
    const found = this.sceneForMessage({
      kind: "bot",
      from: "SegaMan",
      target: "CyberDude",
      text: "tekken still wins",
      topic: "gaming",
      intent: "disagree",
      at: now
    }, now);
    equal(found?.id, "s-saturn", "direct pair must select its own scene over a newer same-topic scene");
    equal(this.sceneCoordinator.lastAssociation?.reason, "direct-pair", "pair ownership should be visible in diagnostics");
    ensure(this.sceneCoordinator.stats.scoredAssociations >= 1, "scored association counter should increment");
    return { sceneId: found.id, reason: this.sceneCoordinator.lastAssociation.reason };
  }

  contractIdentityStrangerTarget() {
    const now = Date.now();
    this.resetContractState({ history: this.parallelGamingScenes(now), bots: ["SegaMan", "CyberDude", "DoomKid", "QuakeGuy"] });
    this.hydrateContractScenes();
    const found = this.sceneForMessage({
      kind: "human",
      from: "NewKid",
      target: "CyberDude",
      text: "hey whats up",
      topic: "general",
      intent: "reply",
      at: now
    }, now);
    equal(found, null, "target presence alone must not hijack CyberDude's unrelated scene");
    equal(this.sceneCoordinator.lastAssociation?.reason, "below-threshold", "weak target-only association should be explicitly rejected");
    return { rejected: true, reason: this.sceneCoordinator.lastAssociation.reason };
  }

  contractIdentitySameTopicSplit() {
    const now = Date.now();
    const history = this.parallelGamingScenes(now).filter((row) => row.sceneId === "s-saturn");
    this.resetContractState({ history, bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    const oldScene = this.sceneBoard.get("s-saturn");
    ensure(oldScene, "saturn scene should hydrate");

    this.pushMessage({
      kind: "bot",
      from: "SegaMan",
      target: "room",
      text: "goldeneye was cool",
      topic: "gaming",
      intent: "ambient",
      source: "contract",
      at: now
    });
    const latest = this.history[this.history.length - 1];
    ensure(latest?.sceneId, "same-topic new subject should still be allowed to create a v17 scene");
    ensure(latest.sceneId !== "s-saturn", "coarse topic=gaming alone must not merge GoldenEye into the Saturn scene");
    ensure(this.sceneBoard.has(latest.sceneId), "new association boundary must still use v17 scene construction/storage");
    equal(this.sceneBoard.get("s-saturn")?.id, "s-saturn", "existing v17 ID must remain untouched");
    return { oldSceneId: "s-saturn", newSceneId: latest.sceneId };
  }

  contractIdentityReplyAnchor() {
    const now = Date.now();
    this.resetContractState({ history: this.parallelGamingScenes(now), bots: ["SegaMan", "CyberDude", "DoomKid", "QuakeGuy"] });
    this.hydrateContractScenes();
    const found = this.sceneForMessage({
      kind: "bot",
      from: "NewKid",
      target: "room",
      text: "really?",
      topic: "general",
      intent: "reaction",
      replyTo: "m-quake-1",
      at: now
    }, now);
    equal(found?.id, "s-quake", "replyTo must remain a hard ownership anchor despite contextless text and a new speaker");
    equal(this.sceneCoordinator.lastAssociation?.reason, "reply-to", "reply anchor should be diagnosed explicitly");
    return { sceneId: found.id, reason: this.sceneCoordinator.lastAssociation.reason };
  }

  contractIdentityAmbiguity() {
    const now = Date.now();
    const history = [
      bot("A", "B", "games are fun tonight", now - 4000, { sceneId: "s-games-a", messageId: "m-games-a" }),
      bot("C", "D", "games are fun lately", now - 4500, { sceneId: "s-games-b", messageId: "m-games-b" })
    ];
    this.resetContractState({ history, bots: ["A", "B", "C", "D", "NewKid"] });
    this.hydrateContractScenes();
    const found = this.sceneForMessage({
      kind: "bot",
      from: "NewKid",
      target: "room",
      text: "games are cool",
      topic: "gaming",
      intent: "reply",
      at: now
    }, now);
    equal(found, null, "near-tied weak scenes must not be merged arbitrarily");
    equal(this.sceneCoordinator.lastAssociation?.reason, "ambiguous", "ambiguous rejection should be visible in diagnostics");
    ensure(this.sceneCoordinator.stats.ambiguousAssociationRejects >= 1, "ambiguous association counter should increment");
    return { rejected: true, reason: "ambiguous" };
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

    const explicit = this.sceneForMessage({ kind: "bot", from: "SegaMan", target: "CyberDude", text: "saturn ports still win", topic: "gaming", sceneId: "s-live" }, now);
    equal(explicit?.id, "s-live", "explicit v40 carry sceneId must remain a hard identity anchor in 1C");
    equal(this.sceneCoordinator.lastAssociation?.reason, "explicit-scene-id", "carry anchor should be diagnosed as structural, not fuzzy");
    return { queued, carried: 2, delegated: true, explicitIdentityPreserved: true };
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

    const forced = this.sceneForMessage({ kind: "bot", from: "SegaMan", target: "Crateman", text: "new subject", _v37ForceNewScene: true }, now);
    equal(forced, null, "replace/pivot must still force fresh identity after the old scene closes");
    equal(this.sceneCoordinator.lastAssociation?.reason, "forced-new-scene", "forced identity boundary should be explicit in diagnostics");
    return { sceneId: scene.id, closed: true, forcedFreshIdentity: true };
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
    equal(snapshot.phase, "1C", "v41 status should identify Phase 1C");
    equal(snapshot.policy.v17SceneIdsAndStorageSchemaPreserved, true, "1C must preserve v17 IDs and storage schema");
    equal(snapshot.policy.v17LegacyFuzzyMatcherBypassedInV41Production, true, "1C production must bypass the legacy first-match fuzzy matcher");
    equal(snapshot.policy.sceneAssociationRoutedThroughCoordinator, true, "scene association must be coordinator-owned");
    equal(snapshot.policy.legacySceneLayersDelegateThroughAuthorityHook, true, "legacy lifecycle layers must remain delegated instead of competing");
    equal(snapshot.policy.duplicateLifecycleDecisionPolicyRetiredFromProductionPath, true, "duplicate lifecycle decisions must remain retired from production");
    equal(snapshot.policy.closedSceneContinuationRoutedThroughCoordinator, true, "closed-scene continuation must be coordinator-owned");
    equal(snapshot.policy.noAdditionalProviderCall, true, "SceneCoordinator identity must remain provider-free");
    equal(this.sceneLifecycleAuthority(), this.sceneCoordinator, "v41 must expose exactly its SceneCoordinator through the authority hook");
    return { deployVersion: snapshot.deployVersion, phase: snapshot.phase, identityAuthority: true };
  }

  async runContract(name) {
    if (name === "identity-pair-ownership") return this.contractIdentityPairOwnership();
    if (name === "identity-stranger-target") return this.contractIdentityStrangerTarget();
    if (name === "identity-same-topic-split") return this.contractIdentitySameTopicSplit();
    if (name === "identity-reply-anchor") return this.contractIdentityReplyAnchor();
    if (name === "identity-ambiguity") return this.contractIdentityAmbiguity();
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
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd", phase: "1C" });
    if (!url.pathname.startsWith("/contract/")) return new Response("v41 SceneCoordinator contract only", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    const id = env.CONTRACT_ROOMS.idFromName(`v41-scene-${name}`);
    return env.CONTRACT_ROOMS.get(id).fetch(new Request(`https://room.internal/contract/${encodeURIComponent(name)}`));
  }
};
