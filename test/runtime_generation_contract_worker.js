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
  }

  orderedReadyProviders() {
    return ["gemini"];
  }

  async callProvider(provider, prompt, maxTokens) {
    if (this.contractVoiceText !== "") {
      return {
        ok: true,
        status: 200,
        model: "phase2-contract-model",
        content: JSON.stringify({ messages: [{ text: this.contractVoiceText }] })
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
    equal(voiced.length, 1, "Phase 2A must not apply the direct-human contract to background Voice");
    equal(this.v41GenerationStats.primaryVoiceContractsChecked, 0, "background Voice should not affect contract counters");
    return { untouched: true, text: voiced[0]?.text };
  }

  contractStatus() {
    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.phase, "2A", "production snapshot should expose Phase 2A");
    equal(snapshot.policy.primaryHumanVoiceSemanticContract, true, "status should expose semantic contract authority");
    equal(snapshot.policy.phase1DOwnershipPolicyUnchanged, true, "Phase 1D ownership remains frozen beneath Phase 2A");
    equal(snapshot.policy.noAdditionalProviderCall, true, "Phase 2A must not add a judge-model call");
    return { phase: snapshot.phase, pass: snapshot.pass };
  }

  async runContract(name) {
    if (name === "semantic-reject") return this.contractSemanticReject();
    if (name === "semantic-pass") return this.contractSemanticPass();
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
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd", phase: "2A" });
    if (!url.pathname.startsWith("/contract/")) return new Response("generation contract only", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice("/contract/".length));
    const id = env.CONTRACT_ROOMS.idFromName(`v41-generation-${name}`);
    return env.CONTRACT_ROOMS.get(id).fetch(new Request(`https://room.internal/contract/${encodeURIComponent(name)}`));
  }
};
