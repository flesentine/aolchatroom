import { ChatRoom as ProductionChatRoom } from "../src/index_v41_generation_contract.js";
import { getCharacter } from "../src/characters.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function directPlan({ speaker = "MetallicaFan", target = "Crateman", intent = "answer", goal, meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "direct-human-contract",
    goal: goal || meaning || "answer the human",
    moves: [{ speaker, target, intent, topic: "general", meaning: meaning || goal || "answer the human" }]
  };
}

export class RuntimeGenerationContractRoom extends ProductionChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.contractVoiceText = "";
    this.contractVoiceTexts = [];
    this.contractDirectorDecision = null;
    this.contractBypassDirector = false;
    this.contractBrainPlan = null;
    this.contractBuiltIn = null;
    this.contractClients = [];
  }

  orderedReadyProviders() {
    return ["gemini"];
  }

  hasReadyAi() {
    return true;
  }

  directHumanDirectorEligible(packet) {
    if (this.contractBypassDirector) return false;
    return super.directHumanDirectorEligible(packet);
  }

  async callAuthoritativeHumanDirector(packet) {
    if (this.contractDirectorDecision) return this.contractDirectorDecision;
    return super.callAuthoritativeHumanDirector(packet);
  }

  async callBrainProvider(prompt, activeNames, reason) {
    if (this.contractBrainPlan && reason === "human-replan") return this.contractBrainPlan;
    return super.callBrainProvider(prompt, activeNames, reason);
  }

  builtInHumanReply(human) {
    // Simulate the provider-aware v19.2 suppression path. Phase 2B must not rely
    // on this dynamic method when it needs its deterministic emergency fallback.
    if (Array.isArray(this.contractBuiltIn)) return [];
    return super.builtInHumanReply(human);
  }

  v41DeterministicHumanFallback(human) {
    if (Array.isArray(this.contractBuiltIn)) return this.contractBuiltIn.map((row) => ({ ...row }));
    return super.v41DeterministicHumanFallback(human);
  }

  async callProvider(provider, prompt, maxTokens) {
    const texts = this.contractVoiceTexts.length
      ? this.contractVoiceTexts
      : this.contractVoiceText !== "" ? [this.contractVoiceText] : [];
    if (texts.length) {
      return {
        ok: true,
        status: 200,
        model: "phase2-contract-model",
        content: JSON.stringify({ messages: texts.map((text) => ({ text })) })
      };
    }
    return super.callProvider(provider, prompt, maxTokens);
  }

  reset({ history = [], bots = [] } = {}) {
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
    this.contractVoiceText = "";
    this.contractVoiceTexts = [];
    this.contractDirectorDecision = null;
    this.contractBypassDirector = false;
    this.contractBrainPlan = null;
    this.contractBuiltIn = null;
  }

  active(name) {
    const character = getCharacter(name);
    ensure(character, `missing contract character ${name}`);
    return [character];
  }

  acceptContractHuman(name) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ name, joinedAt: Date.now() });
    this.ctx.acceptWebSocket(server);
    this.contractClients.push(client);
    return server;
  }

  async contractSemanticReject() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "do you own a neo geo and how much do they cost?",
      messageId: "m-human",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan"] });
    this.contractVoiceText = "nah";
    const plan = directPlan({
      goal: "Answer both parts of the human question",
      meaning: "say whether he owns a Neo Geo and answer how much Neo Geo systems cost"
    });
    const voiced = await this.voiceBrainPlan(plan, this.active("MetallicaFan"), human);
    equal(voiced.length, 0, "Phase 2A must fail closed on the Phase 0 semantic-gap surface");
    equal(this.v41GenerationStats.primaryVoiceContractsChecked, 1, "semantic contract should execute once");
    equal(this.v41GenerationStats.primaryVoiceContractsRejected, 1, "bad Voice surface should be rejected");
    equal(this.v41LastGenerationContract?.reason, "missing-price", "diagnostic should identify the omitted price obligation");
    return { rejected: true, reason: this.v41LastGenerationContract?.reason };
  }

  async contractScopedEvidenceReject() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "do you own a neo geo and how much did it cost?",
      messageId: "m-human-scoped",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan"] });
    this.contractVoiceText = "yeah i bought it in 1995";
    const plan = directPlan({
      goal: "Answer ownership and price",
      meaning: "say whether he owns a Neo Geo and how much it cost"
    });
    const voiced = await this.voiceBrainPlan(plan, this.active("MetallicaFan"), human);
    equal(voiced.length, 0, "a purchase year must not masquerade as price evidence");
    equal(this.v41LastGenerationContract?.reason, "missing-price", "year-only evidence should leave price unsatisfied");
    return { rejected: true, reason: this.v41LastGenerationContract?.reason };
  }

  async contractPolarityScopeReject() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "do you own a neo geo and how much did it cost?",
      messageId: "m-human-polarity-scope",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan"] });
    this.contractVoiceText = "not sure what it costs";
    const plan = directPlan({
      goal: "Answer ownership and price",
      meaning: "say whether he owns a Neo Geo and how much it cost"
    });
    const voiced = await this.voiceBrainPlan(plan, this.active("MetallicaFan"), human);
    equal(voiced.length, 0, "price-only uncertainty must not satisfy the separate ownership clause");
    equal(this.v41LastGenerationContract?.reason, "missing-polarity", "uncertainty cue must not leak into multipart polarity");
    return { rejected: true, reason: this.v41LastGenerationContract?.reason };
  }

  async contractSemanticPass() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "do you own a neo geo and how much do they cost?",
      messageId: "m-human-good",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan"] });
    this.contractVoiceText = "nah i dont own one, they go for like 600 bucks tho";
    const plan = directPlan({
      goal: "Answer both parts of the human question",
      meaning: "say whether he owns a Neo Geo and answer how much Neo Geo systems cost"
    });
    const voiced = await this.voiceBrainPlan(plan, this.active("MetallicaFan"), human);
    equal(voiced.length, 1, "complete Voice surface should survive the contract");
    equal(voiced[0]?.speaker, "MetallicaFan", "legacy Voice must still preserve Director speaker");
    equal(voiced[0]?.target, "Crateman", "legacy Voice must still preserve Director target");
    equal(this.v41GenerationStats.primaryVoiceContractsPassed, 1, "accepted surface should be recorded");
    return { accepted: true, text: voiced[0]?.text };
  }

  async contractFullHumanFallback() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "do you own a neo geo and how much do they cost?",
      messageId: "m-human-fallback",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan"] });
    this.contractVoiceText = "nah";
    this.contractDirectorDecision = {
      provider: "phase2-director",
      move: {
        complete: true,
        speaker: "MetallicaFan",
        target: "Crateman",
        replyTo: "m-human-fallback",
        subject: "Neo Geo ownership and price",
        goal: "say whether he owns a Neo Geo and answer how much Neo Geo systems cost",
        moveType: "answer",
        sceneAction: "continue",
        contextEvidence: { source: "phase2-contract" }
      }
    };

    const fallback = await this.generateHumanReplan(human);
    ensure(Array.isArray(fallback) && fallback.length > 0, "semantic rejection must flow through the authoritative human path to a built-in fallback");
    equal(fallback[0]?.source, "built-in", "rejected Voice must surface through the existing built-in fallback");
    equal(fallback[0]?._v37DirectHuman, true, "fallback must remain marked as the direct-human response");
    equal(this.v41GenerationStats.primaryVoiceContractsRejected, 1, "full human path must record the Voice rejection");
    equal(this.v41LastGenerationContract?.reason, "missing-price", "full human path must preserve semantic rejection diagnostics");
    ensure(Number(this.v37HumanDirectorStats?.voiceFallbacks || 0) >= 1, "v37 must record that its established Voice fallback path was used");
    return { fallback: true, text: fallback[0]?.text, reason: this.v41LastGenerationContract?.reason };
  }

  async contractEraPrimaryReject() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "how much did the PS5 cost?",
      messageId: "m-human-era-primary",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan"] });
    this.contractVoiceText = "$499";
    const plan = directPlan({
      goal: "Give the PS5 price",
      meaning: "answer how much the PS5 cost"
    });
    const voiced = await this.voiceBrainPlan(plan, this.active("MetallicaFan"), human);
    equal(voiced.length, 0, "production Voice must reject a context-only confident answer to a future-world premise");
    equal(this.v41LastGenerationContract?.reason, "era-boundary-confident-answer", "future premise rejection should be diagnosed at the semantic boundary");
    return { rejected: true, reason: this.v41LastGenerationContract?.reason, eraDate: this.currentEraDate() };
  }

  async contractEraFallbackSafe() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "how much did the PS5 cost?",
      messageId: "m-human-era-fallback",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan"] });
    this.contractVoiceText = "$499";
    this.contractDirectorDecision = {
      provider: "phase2-director",
      move: {
        complete: true,
        speaker: "MetallicaFan",
        target: "Crateman",
        replyTo: "m-human-era-fallback",
        subject: "PS5 price",
        goal: "answer how much the PS5 cost",
        moveType: "answer",
        sceneAction: "continue",
        contextEvidence: { source: "phase2-era-contract" }
      }
    };

    const fallback = await this.generateHumanReplan(human);
    equal(fallback.length, 1, "future-premise Voice rejection should recover with one period-safe direct-human fallback");
    equal(fallback[0]?.speaker, "MetallicaFan", "era fallback must preserve required responder");
    equal(fallback[0]?.target, "Crateman", "era fallback must preserve human target");
    equal(fallback[0]?.source, "built-in", "era fallback must remain provider-independent built-in output");
    equal(fallback[0]?.text, "what? never heard of that", "v14 topic/question fallback must be made period-safe after future-premise rejection");
    equal(fallback[0]?._v37DirectHuman, true, "era fallback must preserve v37 direct-human marking");
    equal(fallback[0]?._v41EraSafeFallback, true, "era fallback should expose the v41 sealed-world repair marker");
    equal(this.v41LastGenerationContract?.reason, "era-boundary-confident-answer", "the primary semantic rejection should remain observable after fallback recovery");
    ensure(Number(this.v37HumanDirectorStats?.voiceFallbacks || 0) >= 1, "v37 fallback counter must still record recovery");
    return { fallback: true, text: fallback[0]?.text, reason: this.v41LastGenerationContract?.reason };
  }

  configureLegacyHumanPlan(human, { answerFirst = false, validFallback = true } = {}) {
    this.contractBypassDirector = true;
    const answer = {
      speaker: "MetallicaFan",
      target: "Crateman",
      intent: "answer",
      topic: "general",
      meaning: "answer Crateman directly"
    };
    const side = {
      speaker: "SegaMan",
      target: "room",
      intent: "ambient",
      topic: "gaming",
      meaning: "make an unrelated Saturn comment"
    };
    this.contractBrainPlan = {
      provider: "phase2-legacy-brain",
      reason: "human-replan",
      subject: "legacy-human-replan",
      goal: "answer the human with optional room overlap",
      moves: answerFirst ? [answer, side] : [side, answer],
      createdAt: Date.now()
    };
    this.contractVoiceTexts = answerFirst
      ? ["yeah its cool", "saturn still rules tho"]
      : ["saturn still rules tho", "yeah its cool"];
    this.contractBuiltIn = validFallback
      ? [{ speaker: "MetallicaFan", target: "Crateman", text: "yeah maybe", source: "built-in", intent: "reply", topic: "general" }]
      : [{ speaker: "SegaMan", target: "room", text: "saturn rules", source: "built-in", intent: "ambient", topic: "gaming" }];
    this.history = [{ ...human }];
  }

  async contractHumanTailFailClosed() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "what do you think?",
      messageId: "m-human-tail",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan", "SegaMan"] });
    this.configureLegacyHumanPlan(human, { answerFirst: false, validFallback: true });

    equal(this.builtInHumanReply(human).length, 0, "test must simulate provider-aware dynamic built-in suppression");
    const result = await this.generateHumanReplan(human);
    equal(result.length, 1, "side-first human replan must collapse to one provider-independent validated fallback");
    equal(result[0]?.speaker, "MetallicaFan", "fallback must restore the required responder");
    equal(result[0]?.target, "Crateman", "fallback must target the human");
    equal(result[0]?.text, "yeah maybe", "discarded side chatter must not survive");
    equal(result[0]?._v41PrimaryFailClosed, true, "fallback should expose the Phase 2B fail-closed path");
    equal(this.v41LastHumanReplanContract?.reason, "required-responder-not-first", "diagnostic should identify the first-slot ownership failure");
    equal(this.v41LastHumanReplanContract?.discardedLines, 2, "both generated tail lines must be discarded together");
    equal(this.v41GenerationStats.humanReplanSideLinesDiscarded, 2, "discard counter should include the entire failed batch");
    equal(this.v41GenerationStats.humanReplanFallbacks, 1, "provider-independent deterministic fallback should be counted");
    return { failClosed: true, providerSuppressionBypassed: true, discarded: 2, text: result[0]?.text };
  }

  async contractHumanAnswerFirstPass() {
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "what do you think?",
      messageId: "m-human-answer-first",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan", "SegaMan"] });
    this.configureLegacyHumanPlan(human, { answerFirst: true, validFallback: true });

    const result = await this.generateHumanReplan(human);
    equal(result.length, 2, "correct primary answer may retain later natural room overlap");
    equal(result[0]?.speaker, "MetallicaFan", "required responder must own first slot");
    equal(result[0]?.target, "Crateman", "required first line must address the human");
    equal(result[1]?.speaker, "SegaMan", "side chatter may survive only after the required response");
    equal(this.v41GenerationStats.humanReplanPrimaryPassed, 1, "valid ordering should pass the Phase 2B contract");
    equal(this.v41GenerationStats.humanReplanFallbacks, 0, "valid ordering must not invoke fallback");
    return { accepted: true, lines: result.length };
  }

  async contractHumanBadFallbackReject() {
    const now = Date.now();
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "what do you think?",
      messageId: "m-human-bad-fallback",
      at: now,
      _replyDueAt: now - 1,
      _timingRecorded: true
    };
    this.reset({ history: [human], bots: ["MetallicaFan", "SegaMan"] });
    this.configureLegacyHumanPlan(human, { answerFirst: false, validFallback: false });
    this.pendingHumans = [human];

    const result = await this.handlePendingHumanWithAi(now);
    equal(result, "failed-closed", "invalid validated fallback should be consumed instead of entering the legacy provider retry loop");
    equal(this.pendingHumans.length, 0, "failed-closed human must not be requeued for another provider attempt");
    equal(this.v41GenerationStats.humanReplanFallbackRejects, 1, "bad deterministic fallback should be observable");
    equal(this.v41GenerationStats.humanReplanFailClosedConsumes, 1, "legacy retry suppression should be observable");
    equal(this.v41LastHumanReplanContract?.discardedLines, 2, "failed generated tail remains discarded even when fallback also fails");
    return { rejected: true, consumed: true, discarded: 2 };
  }

  async contractClarificationReject() {
    const now = Date.now();
    const anchor = {
      kind: "bot",
      from: "JennJenn",
      target: "Crateman",
      text: "the hotel night shift was nuts",
      messageId: "m-hotel",
      at: now - 1000
    };
    const human = {
      kind: "human",
      from: "Crateman",
      target: "JennJenn",
      text: "what do you mean by hotel?",
      replyTo: "m-hotel",
      messageId: "m-clarify",
      at: now
    };
    this.reset({ history: [anchor, human], bots: ["JennJenn"] });
    this.contractVoiceText = "that mtv video was weird";
    const plan = directPlan({
      speaker: "JennJenn",
      intent: "clarify",
      meaning: "explain what she meant about the hotel night shift"
    });
    const voiced = await this.voiceBrainPlan(plan, this.active("JennJenn"), human);
    equal(voiced.length, 0, "clarification tangent must fail closed");
    equal(this.v41LastGenerationContract?.reason, "clarification-ungrounded", "clarification rejection should be diagnosed");
    return { rejected: true, reason: this.v41LastGenerationContract?.reason };
  }

  async contractBackgroundUntouched() {
    this.reset({ bots: ["MetallicaFan"] });
    this.contractVoiceText = "nah";
    const plan = {
      ...directPlan({ meaning: "say whether he owns a Neo Geo and answer how much Neo Geo systems cost" }),
      reason: "background"
    };
    const voiced = await this.voiceBrainPlan(plan, this.active("MetallicaFan"), null);
    equal(voiced.length, 1, "Phase 2A semantic contract must not apply to background Voice");
    equal(this.v41GenerationStats.primaryVoiceContractsChecked, 0, "background Voice should not affect contract counters");
    return { untouched: true, text: voiced[0]?.text };
  }



  contractV37StackCharacterization() {
    const snapshot = this.v37Snapshot();

    equal(snapshot?.mode?.productionTurnSingleFlight, true, "v37 hotfix singleflight surface must remain visible");
    equal(snapshot?.mode?.humanOnlyModelBudget, false, "v37 human-only compatibility mode must remain visible");
    equal(snapshot?.mode?.extendedFreeProviderPool, true, "v37 extended-provider layer must remain visible");
    equal(snapshot?.mode?.directHumanDirectorAuthoritative, true, "v37 direct-human Director must remain authoritative");
    equal(snapshot?.mode?.livelyAmbientAi, true, "v37 lively ambient must remain authoritative");

    ensure(snapshot?.productionTurn?.gate, "v37 hotfix production-turn gate diagnostics must survive");
    ensure(snapshot?.providerFailover, "v37 provider failover diagnostics must survive");
    ensure(snapshot?.adaptiveAmbientAi, "v37 adaptive ambient compatibility diagnostics must survive");
    ensure(snapshot?.extendedFreeProviders, "v37 extended provider diagnostics must survive");
    ensure(snapshot?.humanDirector, "v37 human Director diagnostics must survive");
    ensure(snapshot?.livelyAmbientAi, "v37 lively ambient diagnostics must survive");

    ensure(Number.isFinite(Number(this.v37AmbientProviderCursor)), "human-only constructor state used by lively ambient must exist");
    ensure(typeof this.providerCapacityConstrained === "function", "live v37 capacity policy must remain callable");
    ensure(typeof this.callProvider === "function", "live v37 extended provider dispatch must remain callable");
    ensure(typeof this.generateHumanReplan === "function", "live v37 human Director path must remain callable");
    ensure(typeof this.generateBackgroundPlan === "function", "live v37 lively ambient path must remain callable");

    return {
      characterized: true,
      layers: ["hotfix", "human-only", "free-providers", "human-director", "lively-ambient"],
      productionTurnGate: true,
      providerFailover: true,
      humanDirector: true,
      livelyAmbient: true
    };
  }


  async contractRetiredV37LivelyCompatibility() {
    this.reset({ bots: ["SegaMan", "MetallicaFan"] });
    const beforeHumanSkips = Number(this.v37LivelyAmbientStats?.humanPrioritySkips || 0);
    const beforePauses = Number(this.v37LivelyAmbientStats?.naturalPauses || 0);

    this.pendingHumans.push({
      kind: "human",
      from: "Crateman",
      target: "SegaMan",
      text: "hold on",
      at: Date.now()
    });

    const plan = await this.generateBackgroundPlan();
    equal(plan.length, 0, "lively ambient must yield to a pending human without a provider call");
    equal(
      Number(this.v37LivelyAmbientStats?.humanPrioritySkips || 0),
      beforeHumanSkips + 1,
      "lively ambient human-priority skip counter must survive wrapper retirement"
    );
    equal(
      Number(this.v37LivelyAmbientStats?.naturalPauses || 0),
      beforePauses + 1,
      "lively ambient natural-pause counter must survive wrapper retirement"
    );

    const snapshot = this.v37Snapshot();
    equal(snapshot?.mode?.livelyAmbientAi, true, "v37 lively ambient authoritative mode must remain visible");
    equal(snapshot?.mode?.ambientLivelySingleCallAuthoritative, true, "single-call lively ambient authority flag must remain visible");
    ensure(snapshot?.livelyAmbientAi, "lively ambient diagnostics must survive wrapper retirement");
    equal(
      snapshot?.livelyAmbientAi?.humanPrioritySkips,
      Number(this.v37LivelyAmbientStats?.humanPrioritySkips || 0),
      "lively ambient snapshot must reflect live compatibility-owner counters"
    );

    return {
      retired: true,
      pendingHumanYield: true,
      livelyAmbientAuthoritative: true,
      humanPrioritySkips: snapshot?.livelyAmbientAi?.humanPrioritySkips
    };
  }


  async contractRetiredV38QualityCompatibility() {
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 8; i += 1) {
      history.push({
        kind: "bot",
        from: i % 2 ? "SegaMan" : "MetallicaFan",
        topic: "gaming",
        text: i % 2 ? "saturn again" : "playstation vs n64 again",
        sceneId: `game-${i % 3}`,
        at: now - 40000 + i * 1000
      });
    }
    for (let i = 0; i < 4; i += 1) {
      history.push({
        kind: "bot",
        from: "CoolChick17",
        topic: "school",
        text: "homework tonight",
        sceneId: `school-${i}`,
        at: now - 30000 + i * 1000
      });
    }
    this.reset({ history, bots: ["SegaMan", "MetallicaFan", "CoolChick17"] });

    ensure(this.v38TopicCooling instanceof Map, "3F.4 must initialize the v38 topic-cooling map without the retired quality constructor");
    ensure(this.v38QualityStats && typeof this.v38QualityStats === "object", "3F.4 must initialize legacy v38 quality counters");
    this.v38TopicCooling.clear();

    const detected = this.detectRoomTopicFatigue(now);
    equal(detected.topics.some((row) => row.topic === "gaming"), true, "3F.4 must preserve room-wide gaming fatigue detection");

    const originalSceneLifecycleAuthority = this.sceneLifecycleAuthority;
    let closeCalls = 0;
    let delegatedTopics = [];
    this.sceneLifecycleAuthority = () => ({
      closeTopicFatigueScenes: (rows) => {
        closeCalls += 1;
        delegatedTopics = rows.map((row) => row.topic);
        return [{ sceneId: "fatigue-scene", topic: "gaming", turns: 9 }];
      }
    });
    const beforeActivations = this.v38QualityStats.topicFatigueActivations;
    const beforeCloses = this.v38QualityStats.topicFatigueSceneCloses;
    this.applyRoomTopicFatigue(now);
    this.sceneLifecycleAuthority = originalSceneLifecycleAuthority;

    equal(closeCalls, 1, "3F.4 topic fatigue must continue delegating scene closure to the v41 coordinator");
    equal(delegatedTopics.includes("gaming"), true, "3F.4 coordinator delegation must receive the fatigued gaming topic");
    equal(this.v38QualityStats.topicFatigueActivations, beforeActivations + 1, "3F.4 must preserve topic-fatigue activation accounting");
    equal(this.v38QualityStats.topicFatigueSceneCloses, beforeCloses + 1, "3F.4 must preserve delegated fatigue-close accounting");
    equal(this.activeV38TopicCooling(now).some((row) => row.topic === "gaming"), true, "3F.4 must preserve the three-minute topic cooling map");

    const beforeBlocked = this.v38QualityStats.fatiguedBackgroundLinesBlocked;
    const beforeFiltered = this.v38QualityStats.backgroundPlansFiltered;
    this.queueScenePlan([
      { speaker: "SegaMan", target: "room", intent: "ambient", topic: "gaming", text: "saturn again" },
      { speaker: "CoolChick17", target: "room", intent: "ambient", topic: "school", text: "anyone finish homework" }
    ], "background");
    equal(this.v38QualityStats.fatiguedBackgroundLinesBlocked, beforeBlocked + 1, "3F.4 must filter fatigued topics from background plans");
    equal(this.v38QualityStats.backgroundPlansFiltered, beforeFiltered + 1, "3F.4 must preserve filtered-background-plan accounting");
    ensure(!(this.aiQueue || []).some((row) => row?.text === "saturn again"), "3F.4 fatigued gaming line must not reach the inherited queue");
    ensure((this.aiQueue || []).some((row) => row?.text === "anyone finish homework"), "3F.4 non-fatigued background line must survive");

    const blockedAfterBackground = this.v38QualityStats.fatiguedBackgroundLinesBlocked;
    const filteredAfterBackground = this.v38QualityStats.backgroundPlansFiltered;
    this.queueScenePlan([
      { speaker: "MetallicaFan", target: "Crateman", intent: "reply", topic: "gaming", text: "human path stays authoritative" }
    ], "human-replan");
    equal(this.v38QualityStats.fatiguedBackgroundLinesBlocked, blockedAfterBackground, "3F.4 topic filtering must remain background-only");
    equal(this.v38QualityStats.backgroundPlansFiltered, filteredAfterBackground, "3F.4 human replans must not increment the topic-filter counter");

    const snapshot = this.v38Snapshot(now);
    equal(snapshot.pass, "quality-guard-v38", "3F.4 must preserve v38 snapshot identity");
    equal(snapshot.policy?.backgroundTopicCoolingOnly, true, "3F.4 snapshot must preserve background-only cooling policy");
    equal(snapshot.policy?.directHumanPlansNeverFilteredForTopicFatigue, true, "3F.4 snapshot must preserve human-plan exemption");
    equal(snapshot.activeTopicCooling.some((row) => row.topic === "gaming"), true, "3F.4 snapshot must expose active cooling");
    equal(snapshot.detectedTopicFatigue.topics.some((row) => row.topic === "gaming"), true, "3F.4 snapshot must expose detected fatigue");

    const statusResponse = await this.fetch(new Request("https://room.internal/v38-status"));
    equal(statusResponse.status, 200, "3F.4 must preserve the internal v38 status endpoint");
    const status = await statusResponse.json();
    equal(status?.pass, "quality-guard-v38", "3F.4 status must retain legacy v38 pass identity");
    equal(status?.diagnostics?.policy?.backgroundTopicCoolingOnly, true, "3F.4 status must retain topic-cooling diagnostics");

    return {
      retiredV38Quality: true,
      detectedGamingFatigue: true,
      coordinatorCloseDelegated: true,
      backgroundFiltered: true,
      humanReplanExempt: true,
      statusPreserved: true
    };
  }

  async contractRetiredV39CoherenceCompatibility() {
    this.reset({ bots: ["SegaMan", "MetallicaFan"] });

    ensure(this.v39RecentBotLeaves instanceof Map, "3F.3 must initialize the legacy bot-leave map without the retired coherence constructor");
    ensure(this.v39PendingHumanDisconnects instanceof Map, "3F.3 must initialize the legacy reconnect map without the retired coherence constructor");
    ensure(this.v39Stats && typeof this.v39Stats === "object", "3F.3 must initialize legacy v39 counters");
    equal(this.v39LastTargetRepair, null, "3F.3 target-repair diagnostics must retain their legacy baseline");
    equal(this.v39LastCoherenceLock, null, "3F.3 coherence-lock diagnostics must retain their legacy baseline");

    const beforeBlocked = this.v39Stats.selfDialogueLinesBlocked;
    const beforeFiltered = this.v39Stats.backgroundPlansFiltered;
    this.queueScenePlan([
      { speaker: "SegaMan", target: "SegaMan", intent: "reply", topic: "gaming", text: "yeah SegaMan totally" },
      { speaker: "SegaMan", target: "room", intent: "ambient", topic: "gaming", text: "saturn is still my pick" },
      { speaker: "SegaMan", target: "room", intent: "react", topic: "gaming", text: "exactly what i just said" }
    ], "background");

    equal(this.v39Stats.selfDialogueLinesBlocked, beforeBlocked + 2, "3F.3 must preserve both v39 self-dialogue rejection modes");
    equal(this.v39Stats.backgroundPlansFiltered, beforeFiltered + 1, "3F.3 must preserve the legacy filtered-background-plan counter");
    ensure(
      !(this.aiQueue || []).some((row) => row?.text === "yeah SegaMan totally" || row?.text === "exactly what i just said"),
      "3F.3 blocked self-dialogue lines must not reach the inherited queue"
    );
    ensure(
      (this.aiQueue || []).some((row) => row?.text === "saturn is still my pick"),
      "3F.3 must retain a valid background line from the same filtered plan"
    );

    const blockedAfterBackground = this.v39Stats.selfDialogueLinesBlocked;
    const filteredAfterBackground = this.v39Stats.backgroundPlansFiltered;
    this.queueScenePlan([
      { speaker: "MetallicaFan", target: "MetallicaFan", intent: "reply", topic: "music", text: "direct path probe" }
    ], "human-replan");
    equal(this.v39Stats.selfDialogueLinesBlocked, blockedAfterBackground, "3F.3 self-dialogue filtering must remain background-only");
    equal(this.v39Stats.backgroundPlansFiltered, filteredAfterBackground, "non-background plans must not increment the v39 filter counter");

    const statusResponse = await this.fetch(new Request("https://room.internal/v39-status"));
    equal(statusResponse.status, 200, "3F.3 must preserve the internal v39 status endpoint");
    const status = await statusResponse.json();
    equal(status?.pass, "conversation-coherence-v39", "3F.3 status must retain the legacy v39 pass identity");
    equal(status?.diagnostics?.policy?.selfDialogueFilteringBackgroundOnly, true, "3F.3 status must preserve background-only policy diagnostics");
    equal(status?.diagnostics?.stats?.selfDialogueLinesBlocked, beforeBlocked + 2, "3F.3 status must expose the preserved self-dialogue counter");

    return {
      retiredV39Coherence: true,
      blocked: status?.diagnostics?.stats?.selfDialogueLinesBlocked,
      backgroundOnly: true,
      statusPreserved: true
    };
  }

  async contractRetiredV39PresenceCompatibility() {
    const now = Date.now();
    this.reset();

    ensure(this.v39HumanReplacementAt instanceof Map, "3F.2 must initialize the legacy replacement map without the retired presence constructor");
    ensure(this.v39PresenceFixStats && typeof this.v39PresenceFixStats === "object", "3F.2 must initialize legacy presence counters");
    ensure(this.v39CaptureFixStats && typeof this.v39CaptureFixStats === "object", "3F.2 must initialize legacy capture counters");

    const first = this.acceptContractHuman("Crateman");
    const second = this.acceptContractHuman("Crateman");
    equal(this.humanNames().length, 1, "3F.2 logical-human helper must dedupe same-name sockets");
    equal(this.humanNames()[0], "Crateman", "3F.2 logical-human helper must preserve the screen name");
    equal(this.activeHumanConnectionCount("Crateman"), 2, "3F.2 active connection count must still see both active sockets");

    const secondAttachment = second.deserializeAttachment();
    second.serializeAttachment({ ...secondAttachment, v39DisconnectPending: true, v39DisconnectPendingAt: now });
    equal(this.activeHumanConnectionCount("Crateman"), 1, "pending socket must be excluded from active logical connection count");
    equal(this.humanNames().length, 1, "one remaining active same-name socket must preserve one logical human");

    const beforeQuick = this.v39CaptureFixStats.legacyQuickBackgroundCallsSuppressed;
    const quick = await this.generateGroqBatch();
    equal(Array.isArray(quick), true, "3F.2 quick-background compatibility must return an array");
    equal(quick.length, 0, "3F.2 must keep legacy quick-background provider path disabled");
    equal(
      this.v39CaptureFixStats.legacyQuickBackgroundCallsSuppressed,
      beforeQuick + 1,
      "3F.2 must preserve the legacy quick-background suppression counter"
    );

    const snapshot = this.v39Snapshot(now);
    equal(snapshot.humanPresenceIdentity?.logicalHumanCount, 1, "3F.2 v39 snapshot must preserve logical-human diagnostics");
    equal(snapshot.humanPresenceIdentity?.rawSocketCount >= 2, true, "3F.2 v39 snapshot must expose raw socket count");
    equal(snapshot.humanPresenceIdentity?.pendingCloseSocketCount >= 1, true, "3F.2 v39 snapshot must expose pending-close sockets");
    equal(snapshot.captureFixPolicy?.legacyQuickBackgroundDisabled, true, "3F.2 v39 snapshot must preserve quick-background policy");
    equal(snapshot.captureFixPolicy?.explicitErrorChallengeRepair, true, "3F.2 v39 snapshot must preserve extracted error-repair compatibility flag");
    equal(snapshot.captureFixPolicy?.relativePublicDateClaimsValidated, true, "3F.2 v39 snapshot must preserve extracted relative-date compatibility flag");
    equal(snapshot.presenceFixStats?.humanSessionReplacements, 0, "3F.2 must preserve presence-fix counter surface");

    const hookOld = this.acceptContractHuman("HookUser");
    const replacementBefore = this.v39PresenceFixStats.humanSessionReplacements;
    const hookResponse = await this.fetch(new Request("https://room.internal/ws?name=HookUser", {
      headers: { Upgrade: "websocket" }
    }));
    equal(hookResponse.status, 101, "3F.2 /ws compatibility hook must still delegate into the base WebSocket admission path");
    ensure(hookOld.deserializeAttachment().v39Superseded, "3F.2 /ws hook must dynamically dispatch same-name replacement through Phase 3B");
    equal(
      this.v39PresenceFixStats.humanSessionReplacements,
      replacementBefore + 1,
      "3F.2 /ws hook must preserve the legacy replacement counter through the Phase 3B authority"
    );
    equal(
      this.humanNames().filter((name) => name === "HookUser").length,
      1,
      "3F.2 /ws replacement must leave exactly one logical HookUser"
    );

    first.close(1000, "contract cleanup");
    second.close(1000, "contract cleanup");
    return {
      retiredV39Presence: true,
      logicalHumans: snapshot.humanPresenceIdentity?.logicalHumanCount,
      quickBackgroundSuppressed: true
    };
  }

  async contractRetiredV39WorldDiagnostics() {
    const now = Date.now();
    this.reset({ bots: ["SegaMan"] });

    ensure(this.v39WorldGateStats && typeof this.v39WorldGateStats === "object", "3F.1 must initialize legacy v39 world-gate counters without the retired wrapper constructor");
    equal(this.v39WorldGateStats.futureGameProductLinesBlocked, 0, "3F.1 world-gate counter baseline must remain zero");

    const v39 = this.v39Snapshot(now);
    ensure(v39?.worldGateStats, "3F.1 must preserve v39 world-gate snapshot diagnostics");
    equal(v39.worldGatePolicy?.futureGameProductBoundary, true, "3F.1 must preserve the future-game world policy");
    equal(v39.worldGatePolicy?.auditedPublicClaimsBlockedBeforeDisplay, true, "3F.1 must preserve audited public-claim policy");
    equal(v39.worldGatePolicy?.ps1BackLabelNormalizedToPlayStation, true, "3F.1 must preserve console-label normalization policy");

    const v40 = this.v40Snapshot(now);
    equal(v40?.pass, "scene-continuity-v40", "3F.1 compatibility layer must preserve the legacy v40 snapshot identity");
    equal(v40?.policy?.legacyV40CounterSemanticsPreserved, true, "3F.1 must preserve legacy v40 counter semantics");
    equal(v40?.policy?.phase0ObservationCountersAreAdditiveOnly, true, "3F.1 must preserve Phase 0 observation semantics");

    const v41 = this.v41Snapshot(now);
    equal(v41.policy.worldDateGuardAuthority, true, "3F.1 retirement must leave Phase 3D authoritative");
    equal(v41.worldDateGuard?.authority, "v41-world-date-guard", "3F.1 retirement must retain the Phase 3D snapshot");

    return { retiredV39World: true, v39DiagnosticsPreserved: true, v40CompatibilityPreserved: true };
  }

  async contractBotRosterCooldownFiltering() {
    const now = Date.now();
    this.reset({ bots: ["SegaMan"] });
    this.v39RecentBotLeaves.set("CoolChick17", now - 1000);
    const authority = this.botRosterReentryAuthority();

    const filtered = authority.desiredRoster(now, () => ["CoolChick17", "SegaMan"]);
    equal(filtered.length, 1, "3E should filter an inactive bot still inside re-entry cooldown");
    equal(filtered[0], "SegaMan", "3E should preserve eligible roster members");

    this.activeBotNames = ["CoolChick17", "SegaMan"];
    const activePreserved = authority.desiredRoster(now, () => ["CoolChick17", "SegaMan"]);
    equal(activePreserved.length, 2, "3E must not evict a currently active bot merely because retained leave history is still inside cooldown");
    equal(this.v39ReentryRemaining("CoolChick17", now) > 0, true, "production v39ReentryRemaining must dispatch through 3E");
    return { filteredInactive: true, activePreserved: true };
  }

  async contractBotRosterLeaveBookkeeping() {
    const now = Date.now();
    this.reset({ bots: ["CoolChick17", "SegaMan"] });
    const authority = this.botRosterReentryAuthority();
    let delegated = 0;
    authority.announceBotLeave("CoolChick17", now, () => {
      delegated += 1;
      this.activeBotNames = ["SegaMan"];
      return true;
    });
    equal(delegated, 1, "3E leave bookkeeping must delegate exactly once");
    equal(this.v39RecentBotLeaves.get("CoolChick17"), now, "3E must remember a successful departure");
    equal(this.v39ReentryRemaining("CoolChick17", now + 1) > 0, true, "remembered departure must immediately activate cooldown");

    this.v39RecentBotLeaves.clear();
    this.history = [{ kind: "system", from: "", text: "CoolChick17 has left the room.", at: now }];
    equal(this.v39ReentryRemaining("CoolChick17", now + 1) > 0, true, "retained leave history must independently preserve cooldown");
    return { rememberedLeave: true, historyFallback: true };
  }

  async contractBotRosterBlockedReentry() {
    const now = Date.now();
    this.reset({ bots: ["SegaMan"] });
    this.v39RecentBotLeaves.set("CoolChick17", now - 1000);
    const before = this.v39Stats.botReentryBlocks;
    const result = this.announceBotEnter("CoolChick17", now);
    equal(result, false, "production 3E wrapper must reject re-entry inside cooldown");
    equal(this.activeBotNames.includes("CoolChick17"), false, "blocked bot must remain absent");
    equal(this.v39Stats.botReentryBlocks, before + 1, "legacy v39 bot-reentry counter must increment");

    const snapshot = this.v41Snapshot(now);
    equal(snapshot.botRosterReentry?.authority, "v41-bot-roster-reentry", "status must expose 3E roster authority");
    equal(snapshot.botRosterReentry?.cooldownMs, 180000, "3E must preserve the 3-minute cooldown");
    equal(snapshot.policy.botRosterReentryAuthority, true, "status must expose 3E production ownership");
    equal(snapshot.botRosterReentry?.recentlyDeparted?.some?.((row) => row.name === "CoolChick17"), true, "snapshot must expose blocked recent departure");
    return { blocked: true, cooldownMs: snapshot.botRosterReentry?.cooldownMs };
  }

  async contractWorldDateGuardOrder() {
    const now = Date.parse("2026-08-31T13:30:00-07:00");
    this.reset({ bots: ["SegaMan"] });

    const cases = [
      ["oh it was goldeneye for the n64", "future-game-product"],
      ["independence day got released last friday <g>", "historical-date-mismatch"],
      ["phoenix lights man yeah in ninety seven", "future-era-event"],
      ["playstation 4 looks better", "future-era-technology"]
    ];

    for (const [text, expectedKind] of cases) {
      const violation = this.lineViolation(text, now, "gaming movies news", "SegaMan");
      equal(violation?.kind, expectedKind, `3D must preserve guard precedence for ${text}`);
      this.noteViolation(violation, "pre-display", "SegaMan");
    }

    equal(this.v39WorldGateStats.futureGameProductLinesBlocked, 1, "future-game counter must remain legacy-compatible");
    equal(this.v39CaptureFixStats.historicalDateClaimsBlocked, 1, "relative-date counter must remain legacy-compatible");
    equal(this.v39Stats.futureEventLinesBlocked, 1, "future-event counter must remain legacy-compatible");
    equal(this.v38QualityStats.eraLinesBlocked, 1, "hard-era counter must remain legacy-compatible");

    const safe = this.lineViolation("playstation rules", now, "", "SegaMan");
    equal(safe, null, "period-safe PlayStation wording must still pass");
    return { ordered: true, kinds: cases.map((row) => row[1]) };
  }

  async contractWorldDateConsoleNormalization() {
    this.reset({ bots: ["SegaMan"] });
    const before = this.history.length;
    this.say("SegaMan", "PS1 has good games", "bot", "gemini", { topic: "gaming" });
    equal(this.history.length, before + 1, "bot normalization contract must emit one line");
    equal(this.history.at(-1)?.text, "playstation has good games", "3D must preserve the existing lower-pipeline surface after PS1 normalization");
    equal(this.v39WorldGateStats.consoleLabelsNormalized, 1, "legacy console-normalization counter must increment");

    this.say("Crateman", "PS1 has good games", "human", "human", { topic: "gaming" });
    equal(this.history.at(-1)?.text, "PS1 has good games", "human text must never be rewritten by console normalization");
    equal(this.v39WorldGateStats.consoleLabelsNormalized, 1, "human text must not affect normalization counter");
    return { normalizedBotOnly: true };
  }

  async contractWorldDateHistoricalAudit() {
    const now = Date.parse("2026-08-31T13:30:00-07:00");
    this.reset({
      bots: ["SegaMan"],
      history: [
        { kind: "bot", from: "SegaMan", text: "playstation 4 looks better", topic: "gaming", at: now - 4000 },
        { kind: "bot", from: "SegaMan", text: "phoenix lights man yeah in ninety seven", topic: "general", at: now - 3000 },
        { kind: "bot", from: "SegaMan", text: "independence day got released last friday <g>", topic: "movies", at: now - 2000 },
        { kind: "bot", from: "SegaMan", text: "oh it was goldeneye for the n64", topic: "gaming", at: now - 1000 }
      ]
    });
    const audit = this.historicalAudit(true);
    ensure(Number(audit.v38EraViolations || 0) >= 1, "3D combined audit must preserve v38 era violations");
    ensure(Number(audit.v39FutureEventViolations || 0) >= 1, "3D combined audit must preserve v39 future-event violations");
    ensure(Number(audit.v39HistoricalDateViolations || 0) >= 1, "3D combined audit must preserve v39 relative-date violations");
    ensure(Number(audit.v39FutureGameProductViolations || 0) >= 1, "3D combined audit must preserve v39 future-game violations");
    ensure(Number(audit.blockers || 0) >= 4, "3D combined audit must accumulate layered blockers");
    const snapshot = this.v41Snapshot(now);
    equal(snapshot.worldDateGuard?.authority, "v41-world-date-guard", "status must expose 3D world/date authority");
    equal(snapshot.policy.layeredWorldDateOrderPreserved, true, "status must expose preserved guard ordering");
    return { audit: true, blockers: audit.blockers };
  }

  async contractCoherenceTargetRepair() {
    const now = Date.now();
    this.reset({
      bots: ["MoonChild", "RaveChick", "SegaMan"],
      history: [
        { kind: "bot", from: "MoonChild", text: "aint heard it yet, is it seriously that bad", target: "room", messageId: "m1", at: now - 18000 },
        { kind: "bot", from: "RaveChick", text: "haha yeah we had that at our hotel last week ;)", target: "room", messageId: "m2", at: now - 5000 }
      ]
    });
    this.pendingHumanReplyTo?.clear?.();
    const target = this.resolveDirectTarget("had what at your hotel?", "Crateman");
    equal(target, "RaveChick", "3C should preserve clarification target repair");
    equal(this.pendingHumanReplyTo?.get?.("Crateman"), "m2", "3C repair should preserve reply anchor");
    equal(this.v39Stats.clarificationTargetRepairs, 1, "legacy clarification counter should increment");
    equal(this.v39LastTargetRepair?.repairedTarget, "RaveChick", "legacy last-target diagnostic should be preserved");

    const explicit = this.resolveDirectTarget("SegaMan, had what at your hotel?", "Crateman");
    equal(explicit, "SegaMan", "explicit bot mention must outrank semantic repair");
    equal(this.v39Stats.clarificationTargetRepairs, 1, "explicit target must not increment repair counter");
    return { repaired: target, explicit };
  }

  async contractCoherenceVoiceLock() {
    const now = Date.now();
    const anchor = { kind: "bot", from: "JennJenn", target: "Crateman", text: "the hotel night shift was nuts", messageId: "m-hotel-lock", at: now - 1000 };
    const human = { kind: "human", from: "Crateman", target: "JennJenn", text: "what do you mean by hotel?", replyTo: "m-hotel-lock", messageId: "m-human-lock", at: now };
    this.reset({ history: [anchor, human], bots: ["JennJenn"] });
    this.contractVoiceText = "i meant the hotel night shift was chaotic";
    const plan = {
      provider: "gemini",
      reason: "v37-human-director",
      subject: "hotel clarification",
      goal: "clarify the hotel wording",
      moves: [{ speaker: "JennJenn", target: "Crateman", intent: "clarify", topic: "general", meaning: "explain what she meant about the hotel night shift" }]
    };
    const voiced = await this.voiceBrainPlan(plan, this.active("JennJenn"), human);
    equal(voiced.length, 1, "3C coherence-locked Voice should survive a grounded clarification");
    equal(this.v39Stats.coherenceVoiceLocks, 1, "legacy coherence-lock counter should increment");
    equal(this.v39LastCoherenceLock?.mode, "clarify", "legacy lock mode should remain clarify");
    equal(this.v39LastCoherenceLock?.anchorFrom, "JennJenn", "exact reply anchor should be retained");
    equal(this.v39CaptureFixStats.explicitErrorChallengesRepaired, 0, "normal clarification must not count as error challenge");
    return { locked: true, mode: this.v39LastCoherenceLock?.mode };
  }

  async contractExplicitErrorChallengeRepair() {
    const now = Date.now();
    const anchor = { kind: "bot", from: "SegaMan", target: "Crateman", text: "saturn is definitely a video", messageId: "m-bad-claim", at: now - 1000 };
    const human = { kind: "human", from: "Crateman", target: "SegaMan", text: "you got that wrong, you just said it was a video", replyTo: "m-bad-claim", messageId: "m-error-challenge", at: now };
    this.reset({ history: [anchor, human], bots: ["SegaMan"] });
    this.contractVoiceText = "my bad, saturn isnt a video, i mixed that up";
    const plan = {
      provider: "gemini",
      reason: "v37-human-director",
      subject: "error challenge",
      goal: "respond to the human challenge",
      moves: [{ speaker: "SegaMan", target: "Crateman", intent: "clarify", topic: "gaming", meaning: "acknowledge and correct the mistake" }]
    };
    const voiced = await this.voiceBrainPlan(plan, this.active("SegaMan"), human);
    equal(voiced.length, 1, "3C explicit error repair should produce one accepted response");
    equal(this.v39Stats.coherenceVoiceLocks, 1, "challenge should still pass through coherence lock");
    equal(this.v39CaptureFixStats.explicitErrorChallengesRepaired, 1, "legacy explicit-error repair counter should increment");
    equal(this.v39LastCoherenceLock?.mode, "challenge", "challenge mode should remain visible in legacy diagnostics");
    return { repaired: true, mode: this.v39LastCoherenceLock?.mode };
  }

  async contractReconnectAuthorityQuick() {
    this.reset();
    const oldSocket = this.acceptContractHuman("Crateman");
    equal(this.humanNames().length, 1, "accepted socket should count as one logical human");

    this.webSocketClose(oldSocket, 1006, "network changed", false);
    ensure(oldSocket.deserializeAttachment().v39DisconnectPending, "3B close must mark the old socket pending immediately");
    equal(this.humanNames().length, 0, "pending old socket must immediately leave logical presence");
    ensure(this.v39PendingHumanDisconnects.has("Crateman"), "3B authority must own the pending grace token");

    this.acceptContractHuman("Crateman");
    const before = this.history.length;
    const result = this.system("Crateman has entered the room.");
    equal(result, false, "quick reconnect must suppress duplicate enter");
    equal(this.history.length, before, "quick reconnect must not add a system enter line");
    equal(this.humanNames().length, 1, "replacement socket must restore exactly one logical human");
    ensure(!this.v39PendingHumanDisconnects.has("Crateman"), "quick reconnect must clear the pending close");
    equal(this.v39Stats.transientHumanReconnects, 1, "legacy transient reconnect counter must be preserved");

    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.policy.humanReconnectLifecycleAuthority, true, "status must expose 3B reconnect authority");
    equal(snapshot.policy.legacyV39ReconnectOverridesBypassedInV41Production, true, "status must expose v39 reconnect bypass");
    equal(snapshot.humanReconnectLifecycle?.authority, "v41-human-reconnect-lifecycle", "snapshot must identify the 3B authority");
    return { quickReconnect: true, logicalHumans: 1, transient: this.v39Stats.transientHumanReconnects };
  }

  async contractReconnectSameNameReplacement() {
    this.reset();
    const oldSocket = this.acceptContractHuman("Crateman");
    equal(this.replaceExistingHumanSessions("Crateman", Date.now()), 1, "new session must supersede one active same-name socket");
    ensure(oldSocket.deserializeAttachment().v39Superseded, "old same-name socket must be marked superseded");
    equal(this.v39PresenceFixStats.humanSessionReplacements, 1, "legacy replacement counter must be preserved");

    this.webSocketClose(oldSocket, 4001, "replaced by newer session", true);
    ensure(!this.v39PendingHumanDisconnects.has("Crateman"), "superseded close must not enter reconnect grace");
    ensure(this.v39PresenceFixStats.supersededCloseCallbacksIgnored >= 1, "superseded close callback must be ignored");

    this.acceptContractHuman("Crateman");
    const before = this.history.length;
    const result = this.system("Crateman has entered the room.");
    equal(result, false, "same-name replacement must suppress duplicate enter");
    equal(this.history.length, before, "replacement must not create a duplicate enter system line");
    equal(this.v39PresenceFixStats.duplicateEnterAnnouncementsSuppressed, 1, "legacy duplicate-enter counter must be preserved");
    return { replaced: true, duplicateEnterSuppressed: true };
  }

  async contractReconnectCommittedClose() {
    this.reset();
    const oldSocket = this.acceptContractHuman("Crateman");
    const before = this.history.length;
    this.webSocketClose(oldSocket, 1006, "gone", false);
    ensure(this.v39PendingHumanDisconnects.has("Crateman"), "committed-close contract must begin inside grace");

    await new Promise((resolve) => setTimeout(resolve, 5200));

    ensure(!this.v39PendingHumanDisconnects.has("Crateman"), "expired grace token must be removed");
    equal(this.v39Stats.humanDisconnectsCommitted, 1, "expired disconnect must commit exactly once");
    const leaveLines = this.history.slice(before).filter((row) =>
      row?.kind === "system" && row?.text === "Crateman has left the room."
    );
    equal(leaveLines.length, 1, "expired disconnect must emit exactly one leave line");
    return { committed: true, leaveLines: leaveLines.length };
  }

  contractStatus() {
    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.phase, "2B", "production snapshot should expose Phase 2B");
    equal(snapshot.policy.primaryHumanVoiceSemanticContract, true, "status should expose Phase 2A semantic authority beneath 2B");
    equal(snapshot.policy.requiredHumanReplanPrimaryResponseMustBeFirst, true, "status should expose Phase 2B first-slot authority");
    equal(snapshot.policy.missingRequiredHumanReplanResponseDropsEntireTail, true, "status should expose whole-tail fail-closed behavior");
    equal(snapshot.policy.failedHumanReplanUsesProviderIndependentV14Fallback, true, "status should expose provider-independent Phase 2B fallback");
    equal(snapshot.policy.invalidValidatedFallbackConsumesLegacyRetry, true, "status should expose retry-loop suppression for failed-closed humans");
    equal(snapshot.policy.semanticCompletenessDefersToSealed1996World, true, "status should expose the finding-94 semantic/world bridge");
    equal(snapshot.policy.deterministicFallbackDefersToSealed1996World, true, "status should expose the finding-95 fallback/world bridge");
    equal(snapshot.policy.phase1DOwnershipPolicyUnchanged, true, "Phase 1D ownership remains frozen beneath Phase 2");
    equal(snapshot.policy.botRosterReentryAuthority, true, "Phase 3E bot roster/re-entry authority must remain active beneath Phase 2");
    equal(snapshot.botRosterReentry?.cooldownMs, 180000, "Phase 3E must preserve the 3-minute bot re-entry cooldown");
    equal(snapshot.policy.worldDateGuardAuthority, true, "Phase 3D world/date authority must remain active beneath Phase 2");
    equal(snapshot.worldDateGuard?.authority, "v41-world-date-guard", "Phase 3D snapshot must identify the world/date authority");
    equal(snapshot.policy.humanReconnectLifecycleAuthority, true, "Phase 3B reconnect authority must remain active beneath Phase 2");
    equal(snapshot.policy.legacyV39ReconnectOverridesBypassedInV41Production, true, "production v41 must bypass the two legacy reconnect overrides");
    equal(snapshot.humanReconnectLifecycle?.graceMs, 5000, "Phase 3B must preserve the 5-second reconnect grace");
    equal(snapshot.policy.noAdditionalProviderCall, true, "Phase 2 must not add a judge-model call");
    return { phase: snapshot.phase, pass: snapshot.pass };
  }

  async runContract(name) {
    if (name === "semantic-reject") return this.contractSemanticReject();
    if (name === "semantic-scoped-reject") return this.contractScopedEvidenceReject();
    if (name === "semantic-polarity-scope-reject") return this.contractPolarityScopeReject();
    if (name === "semantic-pass") return this.contractSemanticPass();
    if (name === "human-fallback") return this.contractFullHumanFallback();
    if (name === "era-primary-reject") return this.contractEraPrimaryReject();
    if (name === "era-fallback-safe") return this.contractEraFallbackSafe();
    if (name === "human-tail-fail-closed") return this.contractHumanTailFailClosed();
    if (name === "human-answer-first-pass") return this.contractHumanAnswerFirstPass();
    if (name === "human-bad-fallback-reject") return this.contractHumanBadFallbackReject();
    if (name === "clarification-reject") return this.contractClarificationReject();
    if (name === "background-untouched") return this.contractBackgroundUntouched();
    if (name === "v37-stack-characterization") return this.contractV37StackCharacterization();
    if (name === "wrapper-retirement-v37-lively") return this.contractRetiredV37LivelyCompatibility();
    if (name === "wrapper-retirement-v38-quality") return this.contractRetiredV38QualityCompatibility();
    if (name === "wrapper-retirement-v39-coherence") return this.contractRetiredV39CoherenceCompatibility();
    if (name === "wrapper-retirement-v39-presence") return this.contractRetiredV39PresenceCompatibility();
    if (name === "wrapper-retirement-v39-world") return this.contractRetiredV39WorldDiagnostics();
    if (name === "bot-roster-cooldown-filtering") return this.contractBotRosterCooldownFiltering();
    if (name === "bot-roster-leave-bookkeeping") return this.contractBotRosterLeaveBookkeeping();
    if (name === "bot-roster-blocked-reentry") return this.contractBotRosterBlockedReentry();
    if (name === "world-date-guard-order") return this.contractWorldDateGuardOrder();
    if (name === "world-date-console-normalization") return this.contractWorldDateConsoleNormalization();
    if (name === "world-date-historical-audit") return this.contractWorldDateHistoricalAudit();
    if (name === "coherence-target-repair") return this.contractCoherenceTargetRepair();
    if (name === "coherence-voice-lock") return this.contractCoherenceVoiceLock();
    if (name === "explicit-error-challenge-repair") return this.contractExplicitErrorChallengeRepair();
    if (name === "reconnect-authority-quick") return this.contractReconnectAuthorityQuick();
    if (name === "reconnect-same-name-replacement") return this.contractReconnectSameNameReplacement();
    if (name === "reconnect-committed-close") return this.contractReconnectCommittedClose();
    if (name === "status") return this.contractStatus();
    throw new Error(`unknown generation contract: ${name}`);
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
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd", phase: "2B" });
    if (!url.pathname.startsWith("/contract/")) return new Response("generation contract only", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    const id = env.CONTRACT_ROOMS.idFromName(`v41-generation-${name}`);
    return env.CONTRACT_ROOMS.get(id).fetch(new Request(`https://room.internal/contract/${encodeURIComponent(name)}`));
  }
};