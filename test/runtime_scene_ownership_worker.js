import { ChatRoom as ProductionChatRoom } from "../src/index_v41_scene_coordinator.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function row(kind, from, target, text, at, extra = {}) {
  return { kind, from, target, text, topic: "general", messageId: `m-${Math.abs(at)}-${from}`, at, ...extra };
}

export class RuntimeSceneOwnershipRoom extends ProductionChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.contractHumanRow = null;
    this.contractHumans = [];
  }

  humanNames() {
    if (this.contractHumans.length) return [...this.contractHumans];
    return super.humanNames();
  }

  humanHistoryRow(human) {
    if (this.contractHumanRow) return { ...this.contractHumanRow };
    return super.humanHistoryRow(human);
  }

  reset({ history = [], bots = [], humans = [] } = {}) {
    this.loaded = true;
    this.social = null;
    this.history = history.map((item) => ({ ...item }));
    this.activeBotNames = [...bots];
    this.talkerNames = [...bots];
    this.contractHumans = [...humans];
    this.aiQueue = [];
    this.pendingHumans = [];
    this.currentScenePlan = null;
    this.nextBotAt = Date.now();
    this.nextScenePlanAt = 0;
    this.sceneHydrated = true;
    this.sceneBoard.clear();
    this.contractHumanRow = null;
    this.sceneCarryByLine?.clear?.();
  }

  hydrate() {
    this.sceneBoard.clear();
    this.sceneHydrated = false;
    this.hydrateScenesFromHistory();
  }

  contractStaleQuestionSplit() {
    const now = Date.now();
    const history = [row("bot", "RaveChick", "Crateman", "asl?", now - 183000, {
      topic: "asl", sceneId: "s-asl", messageId: "m-asl", intent: "stranger-greeting"
    })];
    this.reset({ history, bots: ["RaveChick"], humans: ["Crateman"] });
    this.hydrate();
    ensure(this.sceneBoard.has("s-asl"), "fading asl scene should still exist at 183 seconds");

    this.pushMessage({
      kind: "human", from: "Crateman", target: "room", text: "i heard there is a secret room in zelda 3",
      topic: "general", intent: "human", source: "human", at: now
    });
    const latest = this.history[this.history.length - 1];
    ensure(latest.sceneId && latest.sceneId !== "s-asl", "Zelda room message must create a new scene instead of joining stale asl");
    equal(this.sceneCoordinator.lastAssociation?.reason, "room-continuity-ineligible", "stale question should fail the room eligibility gate");
    ensure(this.sceneCoordinator.stats.staleOpenQuestionAssociationBlocks >= 1, "stale-question diagnostic must increment");
    return { oldScene: "s-asl", newScene: latest.sceneId };
  }

  contractFreshQuestionOwnership() {
    const now = Date.now();
    const history = [row("bot", "RaveChick", "Crateman", "asl?", now - 30000, {
      topic: "asl", sceneId: "s-fresh", messageId: "m-fresh", intent: "stranger-greeting"
    })];
    this.reset({ history, bots: ["RaveChick"], humans: ["Crateman"] });
    this.hydrate();
    const found = this.sceneForMessage({ kind: "human", from: "Crateman", target: "room", text: "19 m ca", topic: "general", intent: "human" }, now);
    equal(found?.id, "s-fresh", "fresh unanswered question must retain fuzzy ownership");
    equal(this.sceneCoordinator.lastAssociation?.reason, "open-question", "fresh question association should be diagnosed");
    return { sceneId: found.id };
  }

  contractRoomParticipantGate() {
    const now = Date.now();
    const history = [row("bot", "BostonRob", "Crateman", "bar was packed tonight", now - 5000, {
      topic: "work", sceneId: "s-work", messageId: "m-work"
    })];
    this.reset({ history, bots: ["BostonRob"], humans: ["Crateman"] });
    this.hydrate();
    const found = this.sceneForMessage({ kind: "human", from: "Crateman", target: "room", text: "pizza sounds good", topic: "general", intent: "human" }, now);
    equal(found, null, "participant + recency alone may not claim unrelated room chatter");
    equal(this.sceneCoordinator.lastAssociation?.reason, "room-continuity-ineligible", "room gate should fail before thresholding");
    ensure(this.sceneCoordinator.stats.roomContinuityEligibilityBlocks >= 1, "room eligibility diagnostic must increment");
    return { rejected: true };
  }

  contractEffectiveSubjectDrift() {
    const now = Date.now();
    const history = [
      row("bot", "CaliGrrl", "Crateman", "hey crateman", now - 30000, { topic: "greeting", sceneId: "s-drift", messageId: "m-greet" }),
      row("human", "Crateman", "CaliGrrl", "is pokemon on gameboy", now - 9000, { topic: "general", sceneId: "s-drift", messageId: "m-pokemon" }),
      row("bot", "CaliGrrl", "Crateman", "yeah pokemon is on gameboy", now - 4000, { topic: "general", sceneId: "s-drift", messageId: "m-gameboy" })
    ];
    this.reset({ history, bots: ["CaliGrrl"], humans: ["Crateman"] });
    this.hydrate();
    const storedTopic = this.sceneBoard.get("s-drift")?.topic;
    const found = this.sceneForMessage({ kind: "human", from: "Crateman", target: "room", text: "zelda on gameboy would be cool", topic: "general", intent: "reply" }, now);
    equal(found?.id, "s-drift", "recent text-derived gaming subject should preserve genuine follow-up");
    equal(storedTopic, "greeting", "v17 stored topic must remain unchanged");
    equal(this.sceneBoard.get("s-drift")?.topic, "greeting", "association must not mutate stored scene topic");
    return { sceneId: found.id, storedTopic };
  }

  contractHumanReplanCarryRetirement() {
    const now = Date.now();
    const human = row("human", "Crateman", "room", "you guys ever play street fighter 2 in the arcade?", now - 1000, {
      topic: "gaming", sceneId: "s-human", messageId: "m-human", intent: "human"
    });
    this.reset({ history: [human], bots: ["CaliGrrl", "CyberDude", "SoCalGuy", "xXBabyGirlXx"], humans: ["Crateman"] });
    this.hydrate();
    this.contractHumanRow = human;

    const queued = this.queueScenePlan([
      { speaker: "CaliGrrl", target: "Crateman", text: "yeah street fighter is awesome", topic: "gaming", intent: "reply", source: "gemini" },
      { speaker: "xXBabyGirlXx", target: "room", text: "that mtv video was weird", topic: "music", intent: "ambient", source: "gemini" },
      { speaker: "CyberDude", target: "SoCalGuy", text: "hows next weekend lookin", topic: "work", intent: "reply", source: "gemini" }
    ], "human-replan", { from: "Crateman", text: human.text, target: "room" }, true);
    equal(queued, 3, "human replan should still queue all generated lines");
    const planId = this.currentScenePlan?.id;
    const items = this.aiQueue.filter((item) => item?._scenePlanId === planId);
    equal(items.length, 3, "all plan lines should remain queued after ownership stabilization");
    ensure(items.every((item) => !item._continuitySceneId), "legacy v25 blanket continuity IDs must be removed under v41");
    equal(items[0].replyTo, "m-human", "direct human response must be structurally anchored by replyTo");
    equal(items[1]._v41HumanReplanSideLine, true, "room side chatter should be detached from the human scene");
    equal(items[2]._v41HumanReplanSideLine, true, "bot-to-bot side chatter should be detached from the human scene");
    equal(this.sceneCarryByLine.size, 0, "legacy v25 scene carry map must be cleared for the human plan");
    ensure(this.sceneCoordinator.stats.humanReplanSceneCarriesRetired >= 3, "retired carry diagnostic should record v25 cleanup");
    return { queued, planId, directReplyAnchored: true, sideLinesDetached: 2 };
  }

  contractSideLineNoEviction() {
    const now = Date.now();
    const history = [
      row("bot", "A", "B", "scene one", now - 8000, { topic: "work", sceneId: "s1", messageId: "m1" }),
      row("bot", "C", "D", "scene two", now - 7000, { topic: "music", sceneId: "s2", messageId: "m2" }),
      row("bot", "E", "F", "scene three", now - 6000, { topic: "gaming", sceneId: "s3", messageId: "m3" })
    ];
    this.reset({ history, bots: ["A", "B", "C", "D", "E", "F", "CyberDude", "SoCalGuy"], humans: ["Crateman"] });
    this.hydrate();
    equal(this.openScenes(now).length, 3, "contract requires all three v17 scene slots occupied");
    this.currentScenePlan = { id: "p-human", reason: "human-replan", triggerFrom: "Crateman", triggerMessageId: "m-human" };

    this.pushMessage({
      kind: "bot", from: "CyberDude", target: "SoCalGuy", text: "hows next weekend lookin", topic: "work",
      intent: "reply", source: "gemini", planReason: "human-replan", _v41HumanReplanSideLine: true, at: now
    });
    const latest = this.history[this.history.length - 1];
    equal(latest.sceneId || "", "", "detached side line should still emit but remain scene-less at capacity");
    equal(this.openScenes(now).length, 3, "side line must not evict a live scene");
    ensure([...this.sceneBoard.values()].every((scene) => !scene.closedAt), "no existing scene may be closed for detached side chatter");
    ensure(this.sceneCoordinator.stats.sideLineSceneCapEvictionBlocks >= 1, "scene-cap block diagnostic must increment");
    return { emitted: true, sceneLess: true, preservedScenes: 3 };
  }

  contractRecentOnlyHumanMomentumProtection() {
    const now = Date.now();
    const history = [
      row("human", "Crateman", "SegaMan", "what game", now - 100000, { sceneId: "s-momentum", messageId: "m-old-human" }),
      row("bot", "SegaMan", "CyberDude", "saturn pad is better", now - 8000, { topic: "gaming", sceneId: "s-momentum", messageId: "m-bot1" }),
      row("bot", "CyberDude", "SegaMan", "playstation pad is easier", now - 3000, { topic: "gaming", sceneId: "s-momentum", messageId: "m-bot2", intent: "reply" })
    ];
    this.reset({ history, bots: ["SegaMan", "CyberDude"], humans: ["Crateman"] });
    this.hydrate();
    const momentum = this.currentAmbientMomentum(now);
    equal(momentum?.sceneId, "s-momentum", "stale stored human participant must not poison recent bot-only momentum");

    this.reset({
      history: [
        row("bot", "BostonRob", "Crateman", "Bill Clinton", now - 3000, { sceneId: "s-human-recent", messageId: "m-human-target", intent: "reply" }),
        row("bot", "SegaMan", "BostonRob", "yeah", now - 1000, { sceneId: "s-human-recent", messageId: "m-follow" })
      ],
      bots: ["BostonRob", "SegaMan"], humans: ["Crateman"]
    });
    this.hydrate();
    equal(this.currentAmbientMomentum(now), null, "recent bot-to-human activity must still block ambient pile-on");
    ensure(this.sceneCoordinator.stats.ambientHumanOwnershipBlocks >= 1, "human pile-on protection telemetry must remain active");
    return { staleHumanReleased: true, recentHumanProtected: true };
  }

  contractLifecycleStillDelegated() {
    const now = Date.now();
    const history = Array.from({ length: 15 }, (_, index) => row(
      "bot", index % 2 ? "CyberDude" : "SegaMan", index % 2 ? "SegaMan" : "CyberDude", `gaming line ${index}`,
      now - 15000 + index * 800, { topic: "gaming", sceneId: "s-fatigue", messageId: `m-fatigue-${index}` }
    ));
    this.reset({ history, bots: ["SegaMan", "CyberDude"] });
    this.hydrate();
    const scene = this.sceneBoard.get("s-fatigue");
    equal(this.closeExhaustedAmbientScenes(now), 1, "1B lifecycle close must remain delegated through 1D coordinator");
    equal(scene.status, "closed", "coordinator must still perform fatigue mutation");
    ensure(this.sceneCoordinator.stats.ambientExhaustionCloses >= 1, "delegated lifecycle telemetry must survive 1D");
    return { closed: true };
  }

  contractStatus() {
    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.deployVersion, 41, "1D stays on deploy version 41");
    equal(snapshot.phase, "1D", "status must identify Phase 1D");
    equal(snapshot.policy.v17SceneIdsAndStorageSchemaPreserved, true, "v17 schema remains untouched");
    equal(snapshot.policy.legacyHumanReplanBlanketCarryRetiredAtV41Boundary, true, "status must expose carry retirement");
    equal(snapshot.policy.detachedHumanReplanSideLinesCannotEvictExistingScenes, true, "status must expose non-eviction guard");
    equal(snapshot.policy.phase2GenerationContractStillDeferred, true, "Phase 2 must remain deferred");
    ensure(Array.isArray(snapshot.coordinator.associationHistory), "1D diagnostics must include recent association history");
    return { deployVersion: snapshot.deployVersion, phase: snapshot.phase };
  }

  async runContract(name) {
    if (name === "stale-question-split") return this.contractStaleQuestionSplit();
    if (name === "fresh-question-ownership") return this.contractFreshQuestionOwnership();
    if (name === "room-participant-gate") return this.contractRoomParticipantGate();
    if (name === "effective-subject-drift") return this.contractEffectiveSubjectDrift();
    if (name === "human-replan-carry-retirement") return this.contractHumanReplanCarryRetirement();
    if (name === "side-line-no-eviction") return this.contractSideLineNoEviction();
    if (name === "recent-only-human-momentum") return this.contractRecentOnlyHumanMomentumProtection();
    if (name === "lifecycle-still-delegated") return this.contractLifecycleStillDelegated();
    if (name === "status") return this.contractStatus();
    throw new Error(`unknown 1D contract: ${name}`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/contract/")) return super.fetch(request);
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    try {
      return Response.json({ ok: true, contract: name, detail: await this.runContract(name) });
    } catch (error) {
      return Response.json({ ok: false, contract: name, error: String(error?.message || error), stack: String(error?.stack || "").split("\n").slice(0, 8) }, { status: 500 });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd", phase: "1D" });
    if (!url.pathname.startsWith("/contract/")) return new Response("v41 1D contract only", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    const id = env.CONTRACT_ROOMS.idFromName(`v41-ownership-${name}`);
    return env.CONTRACT_ROOMS.get(id).fetch(new Request(`https://room.internal/contract/${encodeURIComponent(name)}`));
  }
};
