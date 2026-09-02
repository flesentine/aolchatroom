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
  }

  orderedReadyProviders() {
    return ["gemini"];
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
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "what do you think?",
      messageId: "m-human-bad-fallback",
      at: Date.now()
    };
    this.reset({ history: [human], bots: ["MetallicaFan", "SegaMan"] });
    this.configureLegacyHumanPlan(human, { answerFirst: false, validFallback: false });

    const result = await this.generateHumanReplan(human);
    equal(result.length, 0, "invalid fallback must fail closed to no output instead of restoring discarded side chatter");
    equal(this.v41GenerationStats.humanReplanFallbackRejects, 1, "bad deterministic fallback should be observable");
    equal(this.v41LastHumanReplanContract?.discardedLines, 2, "failed generated tail remains discarded even when fallback also fails");
    return { rejected: true, discarded: 2 };
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

  contractStatus() {
    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.phase, "2B", "production snapshot should expose Phase 2B");
    equal(snapshot.policy.primaryHumanVoiceSemanticContract, true, "status should expose Phase 2A semantic authority beneath 2B");
    equal(snapshot.policy.requiredHumanReplanPrimaryResponseMustBeFirst, true, "status should expose Phase 2B first-slot authority");
    equal(snapshot.policy.missingRequiredHumanReplanResponseDropsEntireTail, true, "status should expose whole-tail fail-closed behavior");
    equal(snapshot.policy.failedHumanReplanUsesProviderIndependentV14Fallback, true, "status should expose provider-independent Phase 2B fallback");
    equal(snapshot.policy.phase1DOwnershipPolicyUnchanged, true, "Phase 1D ownership remains frozen beneath Phase 2");
    equal(snapshot.policy.noAdditionalProviderCall, true, "Phase 2 must not add a judge-model call");
    return { phase: snapshot.phase, pass: snapshot.pass };
  }

  async runContract(name) {
    if (name === "semantic-reject") return this.contractSemanticReject();
    if (name === "semantic-scoped-reject") return this.contractScopedEvidenceReject();
    if (name === "semantic-polarity-scope-reject") return this.contractPolarityScopeReject();
    if (name === "semantic-pass") return this.contractSemanticPass();
    if (name === "human-fallback") return this.contractFullHumanFallback();
    if (name === "human-tail-fail-closed") return this.contractHumanTailFailClosed();
    if (name === "human-answer-first-pass") return this.contractHumanAnswerFirstPass();
    if (name === "human-bad-fallback-reject") return this.contractHumanBadFallbackReject();
    if (name === "clarification-reject") return this.contractClarificationReject();
    if (name === "background-untouched") return this.contractBackgroundUntouched();
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
