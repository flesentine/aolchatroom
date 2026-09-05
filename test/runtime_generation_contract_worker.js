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