import { ChatRoom as ProductionChatRoom } from "../src/index_v40_scene_continuity.js";
import { ChatRoom as BrainVoiceChatRoom } from "../src/index_v22.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function bot(from, text, at, extra = {}) {
  return {
    kind: "bot",
    from,
    target: "room",
    intent: "conversation",
    topic: "gaming",
    sceneId: "s-live",
    messageId: `m-${from}-${at}`,
    text,
    at,
    ...extra
  };
}

export class RuntimeContractRoom extends ProductionChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.contractProviderCalls = [];
    this.contractProviderResult = null;
    this.contractGroqLines = null;
    this.contractClients = [];
  }

  async callProvider(provider, prompt, maxTokens) {
    if (this.contractProviderResult) {
      this.contractProviderCalls.push({ provider, prompt, maxTokens });
      return this.contractProviderResult;
    }
    return super.callProvider(provider, prompt, maxTokens);
  }

  async callGroq(...args) {
    if (this.contractGroqLines) return this.contractGroqLines.map((line) => ({ ...line }));
    return super.callGroq(...args);
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
    this.contractProviderCalls = [];
    this.contractProviderResult = null;
    this.contractGroqLines = null;
  }

  hydrateContractScenes() {
    this.sceneBoard.clear();
    this.sceneHydrated = false;
    this.hydrateScenesFromHistory();
  }

  acceptContractHuman(name) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ name, joinedAt: Date.now() });
    this.ctx.acceptWebSocket(server);
    this.contractClients.push(client);
    return server;
  }

  liveBotScene(now = Date.now()) {
    return [
      bot("SegaMan", "saturn pad feels better to me", now - 8000, { target: "CyberDude" }),
      bot("CyberDude", "nah playstation pad is easier", now - 3000, { target: "SegaMan", intent: "reply" })
    ];
  }

  async contractAmbientGeneration() {
    const now = Date.now();
    this.resetContractState({
      history: this.liveBotScene(now),
      bots: ["SegaMan", "CyberDude", "MetallicaFan"]
    });
    this.hydrateContractScenes();
    this.v37LastLivelyAmbientAiAt = 0;
    this.contractProviderResult = {
      ok: true,
      status: 200,
      model: "fake-gemini",
      content: JSON.stringify({
        messages: [
          { speaker: "SegaMan", target: "CyberDude", intent: "reply", topic: "gaming", text: "saturn ports still win" },
          { speaker: "CyberDude", target: "SegaMan", intent: "disagree", topic: "gaming", text: "tekken says otherwise" },
          { speaker: "SegaMan", target: "CyberDude", intent: "question", topic: "gaming", text: "ridge racer too?" }
        ]
      })
    };

    const lines = await this.generateBackgroundPlan();
    equal(this.contractProviderCalls.length, 1, "ambient opportunity should make one provider request");
    equal(this.contractProviderCalls[0]?.provider, "gemini", "Gemini should own healthy ambient generation");
    ensure(/V40 SCENE MOMENTUM LOCK/.test(this.contractProviderCalls[0]?.prompt || ""), "real lively prompt must contain v40 momentum lock");
    equal(this.v40Stats.momentumPromptLocks, 1, "v40 prompt lock counter should increment on actual generation");
    equal(lines.length, 3, "deterministic provider burst should survive parsing");
    return { providerCalls: 1, provider: "gemini", lines: lines.length };
  }

  contractQueuePipeline() {
    const now = Date.now();
    this.resetContractState({
      history: this.liveBotScene(now),
      bots: ["SegaMan", "CyberDude", "MetallicaFan"]
    });
    this.hydrateContractScenes();
    this.v38TopicCooling.set("metal", now + 60000);

    const queued = this.queueScenePlan([
      { speaker: "SegaMan", target: "SegaMan", intent: "reply", topic: "gaming", text: "yeah me too", source: "gemini" },
      { speaker: "MetallicaFan", target: "room", intent: "ambient", topic: "music", text: "metallica anyone", source: "gemini" },
      { speaker: "SegaMan", target: "CyberDude", intent: "reply", topic: "gaming", text: "saturn has better arcade ports", source: "gemini" },
      { speaker: "CyberDude", target: "SegaMan", intent: "disagree", topic: "gaming", text: "tekken still wins though", source: "gemini" }
    ], "background", null, false);

    equal(queued, 2, "v39 self-target and v38 cooled-topic filters should run before v20 queues");
    equal(this.v39Stats.selfDialogueLinesBlocked, 1, "v39 self-dialogue filter should block one line");
    equal(this.v38QualityStats.fatiguedBackgroundLinesBlocked, 1, "v38 topic cooling should block one line");
    equal(this.currentScenePlan?.plannedTurns, 2, "v20 should own the surviving two-line plan");
    const planId = this.currentScenePlan?.id;
    const planItems = this.aiQueue.filter((item) => item._scenePlanId === planId);
    equal(planItems.length, 2, "only surviving lines should be queued");
    ensure(planItems.every((item) => item._continuitySceneId === "s-live"), "v40 should carry the existing scene id onto surviving continuations");
    equal(this.v40Stats.backgroundPlansCarried, 1, "v40 should record one carried plan");
    equal(this.v40Stats.backgroundLinesCarried, 2, "v40 should record two carried lines");
    return { queued, carried: this.v40Stats.backgroundLinesCarried };
  }

  contractHumanSceneExclusion() {
    const now = Date.now();
    const history = [
      { kind: "human", from: "Crateman", target: "BostonRob", topic: "general", sceneId: "s-human", messageId: "m-human", text: "so who is the president", at: now - 8000 },
      { kind: "bot", from: "BostonRob", target: "Crateman", topic: "general", sceneId: "s-answer", messageId: "m-bot", text: "Bill Clinton. Look it up later", intent: "answer", at: now - 3000 }
    ];
    this.resetContractState({ history, bots: ["BostonRob"] });
    this.hydrateContractScenes();
    equal(this.currentAmbientMomentum(now), null, "recent human identity must block mismatched scene-id ambient carry");

    this.resetContractState({
      history: [{ kind: "bot", from: "BostonRob", target: "Crateman", topic: "general", sceneId: "s-active-human", messageId: "m-active", text: "Bill Clinton. Look it up later", intent: "answer", at: now - 1000 }],
      bots: ["BostonRob"]
    });
    this.acceptContractHuman("Crateman");
    this.hydrateContractScenes();
    equal(this.currentAmbientMomentum(now), null, "active human identity must block ambient carry even without a recent human row");
    return { recentHumanBlocked: true, activeHumanBlocked: true };
  }

  contractClosedScene() {
    const now = Date.now();
    this.resetContractState({ history: this.liveBotScene(now), bots: ["SegaMan", "CyberDude"] });
    this.hydrateContractScenes();
    const scene = this.sceneBoard.get("s-live");
    ensure(scene, "live scene should hydrate");
    scene.status = "closed";
    scene.closedAt = now;
    scene.closeReason = "runtime-contract";
    const found = this.sceneForMessage({
      kind: "bot",
      from: "SegaMan",
      target: "CyberDude",
      topic: "gaming",
      sceneId: "s-live",
      text: "one more thing",
      at: now
    }, now);
    equal(found, null, "closed scene must not be rediscovered through deployed sceneForMessage chain");
    return { resurrectionBlocked: true };
  }

  async contractHydration() {
    const now = Date.now();
    const history = [
      bot("SegaMan", "saturn forever", now - 6000, { sceneId: "s-hydrated", target: "CyberDude" }),
      bot("CyberDude", "playstation wins", now - 2000, { sceneId: "s-hydrated", target: "SegaMan" })
    ];
    await this.ctx.storage.put("history", history);
    this.loaded = false;
    this.sceneHydrated = false;
    this.sceneBoard.clear();
    await this.ensureState();
    const scene = this.sceneBoard.get("s-hydrated");
    ensure(scene, "scene board should reconstruct from persisted history");
    equal(scene.turns, 2, "hydrated scene should retain two turns");
    return { sceneId: scene.id, turns: scene.turns };
  }

  async contractSingleflight() {
    this.resetContractState();
    let release;
    const blocker = new Promise((resolve) => { release = resolve; });
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const original = this.runV37BaseProductionTurn;
    this.runV37BaseProductionTurn = async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await blocker;
      active -= 1;
      return calls;
    };
    try {
      const first = this.tick(false);
      const second = this.tick(true);
      const third = this.alarm();
      await Promise.resolve();
      ensure(this.v37ProductionTurnGate.snapshot().coalesced >= 2, "concurrent turn requests should coalesce");
      release();
      await Promise.all([first, second, third]);
      const snapshot = this.v37ProductionTurnGate.snapshot();
      equal(maxActive, 1, "base production turns must never overlap");
      equal(snapshot.maxConcurrent, 1, "singleflight snapshot should observe only one concurrent base turn");
      equal(calls, 2, "coalesced requests should create one bounded replay");
      return { calls, maxConcurrent: snapshot.maxConcurrent };
    } finally {
      this.runV37BaseProductionTurn = original;
    }
  }

  contractWorldGate() {
    this.resetContractState({ bots: ["SegaMan"] });
    const blocked = this.say("SegaMan", "oh it was goldeneye for the n64", "bot", "gemini", {
      target: "room",
      topic: "gaming",
      intent: "conversation"
    });
    equal(blocked, false, "GoldenEye N64 line must be blocked before display");
    equal(this.history.length, 0, "blocked future game claim must not enter visible history");

    this.resetContractState({ bots: ["JerseyGirl"] });
    const allowed = this.say("JerseyGirl", "goldeneye came out last year lol", "bot", "gemini", {
      target: "room",
      topic: "movies",
      intent: "conversation"
    });
    equal(allowed, true, "1995 GoldenEye film discussion should remain allowed");
    equal(this.history.length, 1, "allowed film line should enter history");
    return { futureGameBlocked: true, filmAllowed: true };
  }

  contractReconnect() {
    this.resetContractState();
    const oldSocket = this.acceptContractHuman("Crateman");
    equal(this.humanNames().length, 1, "one accepted socket should be one logical human");
    this.webSocketClose(oldSocket, 1006, "network changed", false);
    ensure(oldSocket.deserializeAttachment().v39DisconnectPending, "closing socket should be marked pending immediately");
    equal(this.humanNames().length, 0, "pending-close socket should immediately stop counting as room presence");
    ensure(this.v39PendingHumanDisconnects.has("Crateman"), "reconnect grace token should be pending");

    this.acceptContractHuman("Crateman");
    const before = this.history.length;
    const result = this.system("Crateman has entered the room.");
    equal(result, false, "quick same-name reconnect should suppress duplicate enter line");
    ensure(!this.v39PendingHumanDisconnects.has("Crateman"), "new session should clear pending disconnect token");
    equal(this.v39Stats.transientHumanReconnects, 1, "reconnect should be recorded as transient");
    equal(this.history.length, before, "quick reconnect should not add a system line");
    equal(this.humanNames().length, 1, "replacement session should restore exactly one logical human");
    return { logicalHumans: 1, duplicateEnterSuppressed: true };
  }

  contractExplicitTargetPrecedence() {
    const now = Date.now();
    this.resetContractState({
      bots: ["BostonRob", "MetallicaFan"],
      history: [
        { kind: "bot", from: "MetallicaFan", target: "Crateman", text: "neo geo costs a ton", topic: "gaming", messageId: "m-metal", sceneId: "s-metal", at: now - 2000 },
        { kind: "bot", from: "BostonRob", target: "Crateman", text: "yeah im here", topic: "general", messageId: "m-boston", sceneId: "s-boston", at: now - 1000 }
      ]
    });
    const human = { from: "Crateman", target: "BostonRob", text: "BostonRob, what do you think about the neo geo cost?", at: now };
    this.repairHumanTarget(human, now);
    equal(human.target, "BostonRob", "explicit screen-name mention must outrank semantic retargeting");
    return { target: human.target };
  }

  contractHumanInterruptDiscard() {
    this.resetContractState({ bots: ["SegaMan", "CyberDude"] });
    const queued = this.queueScenePlan([
      { speaker: "SegaMan", target: "CyberDude", text: "first future", topic: "gaming", intent: "reply", source: "gemini" },
      { speaker: "CyberDude", target: "SegaMan", text: "second future", topic: "gaming", intent: "reply", source: "gemini" }
    ], "background", null, false);
    equal(queued, 2, "background plan should queue before interruption");
    const planId = this.currentScenePlan?.id;
    const removed = this.discardPlannedFuture("human-interrupt-contract");
    equal(removed, 2, "human interruption should discard every queued planned future turn");
    equal(this.aiQueue.filter((item) => item._scenePlanId === planId).length, 0, "interrupted plan must leave no queued future items");
    equal(this.lastScenePlan?.status, "interrupted", "interrupted plan should be finalized as interrupted");
    return { discarded: removed, status: this.lastScenePlan?.status };
  }

  async contractSemanticGap() {
    this.resetContractState({ bots: ["MetallicaFan"] });
    this.contractGroqLines = [{
      speaker: "MetallicaFan",
      target: "Crateman",
      intent: "answer",
      topic: "gaming",
      text: "nah",
      source: "gemini"
    }];
    const plan = {
      provider: "gemini",
      reason: "v37-human-director",
      subject: "Neo Geo ownership and price",
      goal: "Answer both parts of the human question",
      moves: [{
        speaker: "MetallicaFan",
        target: "Crateman",
        intent: "answer",
        topic: "gaming",
        meaning: "say whether he owns a Neo Geo and answer how much Neo Geo systems cost"
      }]
    };
    const voiced = await BrainVoiceChatRoom.prototype.voiceBrainPlan.call(this, plan, this.activeCharacters(), null);
    equal(voiced.length, 1, "legacy Voice should currently accept one surface line");
    equal(voiced[0].text, "nah", "known deficiency should remain characterized rather than fixed in Phase 0");
    ensure(/owns a Neo Geo.*how much/i.test(voiced[0].brainMeaning || ""), "semantic plan should still contain both answer obligations");
    return { knownDeficiency: "voice-semantic-completeness", surface: voiced[0].text };
  }

  async runContract(name) {
    if (name === "ambient-generation") return this.contractAmbientGeneration();
    if (name === "queue-pipeline") return this.contractQueuePipeline();
    if (name === "human-scene-exclusion") return this.contractHumanSceneExclusion();
    if (name === "closed-scene") return this.contractClosedScene();
    if (name === "hydration") return this.contractHydration();
    if (name === "singleflight") return this.contractSingleflight();
    if (name === "world-gate") return this.contractWorldGate();
    if (name === "reconnect") return this.contractReconnect();
    if (name === "explicit-target") return this.contractExplicitTargetPrecedence();
    if (name === "human-interrupt") return this.contractHumanInterruptDiscard();
    if (name === "semantic-gap") return this.contractSemanticGap();
    throw new Error(`unknown runtime contract: ${name}`);
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
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd" });
    if (!url.pathname.startsWith("/contract/")) return new Response("runtime contract only", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    const id = env.CONTRACT_ROOMS.idFromName(`v41-${name}`);
    return env.CONTRACT_ROOMS.get(id).fetch(new Request(`https://room.internal/contract/${encodeURIComponent(name)}`));
  }
};
