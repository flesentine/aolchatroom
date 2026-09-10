import baseWorker, { RuntimeGenerationContractRoom as BaseRuntimeGenerationContractRoom } from "./runtime_generation_contract_worker.js";
import { ChatRoom as PublicFactProductionChatRoom } from "../src/index_v41_public_fact_grounding.js";
import { WikidataPublicFactResolver } from "../src/public_fact_grounding_v41.js";
import { makeFakeWikidataFetch } from "./public_fact_wikidata_fixture.js";
import { getCharacter } from "../src/characters.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function directPlan({ speaker, subject, target = "Crateman", intent = "answer", meaning = "answer the factual question" }) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject,
    goal: meaning,
    moves: [{ speaker, target, intent, topic: "general", meaning }]
  };
}

export class RuntimeGenerationContractRoom extends BaseRuntimeGenerationContractRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.publicFactFixtureCalls = [];
    this.installPublicFactRuntime();
  }

  installPublicFactRuntime() {
    this.v41PublicFactResolver = new WikidataPublicFactResolver({
      fetcher: makeFakeWikidataFetch({ calls: this.publicFactFixtureCalls }),
      timeoutMs: 500
    });
    this.v41PublicFactStats = {
      requestsDetected: 0,
      sourceResolved: 0,
      sourceUnresolved: 0,
      sourceUnavailable: 0,
      providerSurfacesAccepted: 0,
      providerSurfacesRejected: 0,
      groundedFallbacks: 0,
      uncertaintyFallbacks: 0,
      challengeRationalizationsBlocked: 0
    };
    this.v41LastPublicFactScope = null;
    this.v41LastPublicFactGrounding = null;
  }

  reset(options = {}) {
    super.reset(options);
    this.v41LastPublicFactScope = null;
    this.v41LastPublicFactGrounding = null;
  }

  v41EraDateKey() {
    return PublicFactProductionChatRoom.prototype.v41EraDateKey.call(this);
  }

  async v41ResolvePublicFactScope(plan, human) {
    return PublicFactProductionChatRoom.prototype.v41ResolvePublicFactScope.call(this, plan, human);
  }

  v41PublicFactScopeMatchesHuman(scope, human) {
    return PublicFactProductionChatRoom.prototype.v41PublicFactScopeMatchesHuman.call(this, scope, human);
  }

  notePublicFactGrounding(scope, evaluation, surface = "", fallback = null) {
    return PublicFactProductionChatRoom.prototype.notePublicFactGrounding.call(this, scope, evaluation, surface, fallback);
  }

  async voiceBrainPlan(plan, active, human = null) {
    return PublicFactProductionChatRoom.prototype.voiceBrainPlan.call(this, plan, active, human);
  }

  v41DeterministicHumanFallback(human) {
    if (Array.isArray(this.contractBuiltIn)) return this.contractBuiltIn.map((row) => ({ ...row }));
    return PublicFactProductionChatRoom.prototype.v41DeterministicHumanFallback.call(this, human);
  }

  v41Snapshot(now = Date.now()) {
    return PublicFactProductionChatRoom.prototype.v41Snapshot.call(this, now);
  }

  async contractPublicFactGrounding() {
    const skater = getCharacter("Sk8rGuy16");
    const metal = getCharacter("MetallicaFan");
    const game = getCharacter("GameDude") || skater;
    ensure(skater && metal, "public-fact contract needs known room characters");

    const movieLine = {
      kind: "bot",
      from: "MacAddict",
      target: "Crateman",
      text: "Independence Day is still pulling in crowds",
      messageId: "fact-movie-context",
      at: Date.now() - 3000
    };
    const castHuman = {
      kind: "human",
      from: "Crateman",
      target: "Sk8rGuy16",
      text: "who stars in that",
      messageId: "fact-cast-question",
      at: Date.now() - 2000
    };
    this.reset({ history: [movieLine, castHuman], bots: ["MacAddict", "Sk8rGuy16"] });
    this.contractVoiceText = "keanu reeves and al pacino";
    const castPlan = directPlan({
      speaker: "Sk8rGuy16",
      subject: "Independence Day",
      meaning: "answer who stars in the movie from recent chat"
    });
    const wrongCast = await this.voiceBrainPlan(castPlan, [skater], castHuman);
    equal(wrongCast.length, 0, "wrong movie cast must fail closed before display");
    equal(this.v41LastGenerationContract?.reason, "public-fact-cast-ungrounded", "wrong cast must be attributed to generic public-fact gate");
    equal(this.v41LastPublicFactScope?.source, "wikidata", "production scope must identify structured source");
    equal(this.v41LastPublicFactScope?.sourceEntityId, "QID4", "relation-aware resolution must select film over same-label holiday");

    const castFallback = this.v41DeterministicHumanFallback(castHuman);
    equal(castFallback.length, 1, "grounded cast fallback must occupy required primary slot");
    equal(castFallback[0]?.speaker, "Sk8rGuy16", "grounded fallback must preserve responder");
    equal(castFallback[0]?.target, "Crateman", "grounded fallback must preserve human target");
    ensure(/will smith/i.test(castFallback[0]?.text || ""), "generic fallback must include Will Smith fixture fact");
    ensure(/jeff goldblum/i.test(castFallback[0]?.text || ""), "generic fallback must include Jeff Goldblum fixture fact");
    ensure(/bill pullman/i.test(castFallback[0]?.text || ""), "generic fallback must include Bill Pullman fixture fact");

    const wrongAnswer = {
      kind: "bot",
      from: "Sk8rGuy16",
      target: "Crateman",
      text: "keanu reeves and al pacino",
      messageId: "fact-wrong-answer",
      at: Date.now() - 1000
    };
    const challenge = {
      kind: "human",
      from: "Crateman",
      target: "Sk8rGuy16",
      text: "i think that's wrong",
      messageId: "fact-challenge",
      at: Date.now()
    };
    this.history.push(wrongAnswer, challenge);
    this.contractVoiceText = "dude i meant another movie";
    const challengePlan = directPlan({
      speaker: "Sk8rGuy16",
      subject: "Independence Day",
      intent: "correct",
      meaning: "repair the challenged factual answer"
    });
    const rationalized = await this.voiceBrainPlan(challengePlan, [skater], challenge);
    equal(rationalized.length, 0, "inventing a replacement subject must not escape factual repair");
    equal(this.v41LastGenerationContract?.reason, "public-fact-challenge-rationalization", "rationalization must have generic rejection reason");
    const correction = this.v41DeterministicHumanFallback(challenge);
    equal(correction.length, 1, "challenge must have grounded correction fallback");
    ensure(/you(?:'re| are) right/i.test(correction[0]?.text || ""), "correction must acknowledge human challenge");
    ensure(/independence day/i.test(correction[0]?.text || ""), "correction must stay on original subject");

    // Same production authority, different domain: music performer.
    const songHuman = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "who sings Enter Sandman",
      messageId: "fact-song",
      at: Date.now()
    };
    this.reset({ history: [songHuman], bots: ["MetallicaFan"] });
    this.contractVoiceText = "megadeth";
    const songPlan = directPlan({ speaker: "MetallicaFan", subject: "Enter Sandman" });
    const wrongSong = await this.voiceBrainPlan(songPlan, [metal], songHuman);
    equal(wrongSong.length, 0, "wrong song performer must fail through same generic authority");
    equal(this.v41LastGenerationContract?.reason, "public-fact-performer-ungrounded", "music rejection must use generic relation reason");
    const songFallback = this.v41DeterministicHumanFallback(songHuman);
    equal(songFallback.length, 1, "song fact must receive grounded fallback");
    ensure(/metallica/i.test(songFallback[0]?.text || ""), "song fallback must use structured performer fact");

    // Same production authority, another domain: video-game developer.
    const gameHuman = {
      kind: "human",
      from: "Crateman",
      target: "Sk8rGuy16",
      text: "who developed Quake",
      messageId: "fact-game",
      at: Date.now()
    };
    this.reset({ history: [gameHuman], bots: ["Sk8rGuy16"] });
    this.contractVoiceText = "sega";
    const gamePlan = directPlan({ speaker: "Sk8rGuy16", subject: "Quake" });
    const wrongGame = await this.voiceBrainPlan(gamePlan, [game], gameHuman);
    equal(wrongGame.length, 0, "wrong game developer must fail through same generic authority");
    const gameFallback = this.v41DeterministicHumanFallback(gameHuman);
    ensure(/id software/i.test(gameFallback[0]?.text || ""), "game fallback must use structured developer fact");

    // Mutable/current relations are blocked instead of pulling modern state into 1996.
    const currentHuman = {
      kind: "human",
      from: "Crateman",
      target: "Sk8rGuy16",
      text: "who is the current CEO of Apple",
      messageId: "fact-current-role",
      at: Date.now()
    };
    this.reset({ history: [currentHuman], bots: ["Sk8rGuy16"] });
    const callsBeforeUnsafe = this.publicFactFixtureCalls.length;
    this.contractVoiceText = "steve jobs";
    const currentPlan = directPlan({ speaker: "Sk8rGuy16", subject: "Apple" });
    const unsafe = await this.voiceBrainPlan(currentPlan, [skater], currentHuman);
    equal(unsafe.length, 0, "recognized current-role fact must fail closed");
    equal(this.publicFactFixtureCalls.length, callsBeforeUnsafe, "unsupported mutable fact must not query modern structured source");
    const uncertain = this.v41DeterministicHumanFallback(currentHuman);
    ensure(/not sure|dont wanna make that up/i.test(uncertain[0]?.text || ""), "unsafe fact must fall back to uncertainty");

    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.policy?.directPublicFactsUseStructuredGrounding, true, "status must expose generic structured grounding");
    equal(snapshot.policy?.recognizedUnsupportedPublicFactsFailClosedToUncertainty, true, "status must expose mutable-fact fail-closed boundary");
    equal(snapshot.publicFactGrounding?.resolver?.source, "wikidata", "status must expose generic fact source");
    ensure(snapshot.publicFactGrounding?.resolver?.supportedRelations?.includes("cast"), "status must expose cast relation");
    ensure(snapshot.publicFactGrounding?.resolver?.supportedRelations?.includes("performer"), "status must expose music relation");
    ensure(snapshot.publicFactGrounding?.resolver?.supportedRelations?.includes("developer"), "status must expose game relation");

    return {
      movieRegressionBlocked: true,
      movieFallback: castFallback[0]?.text || "",
      replacementSubjectBlocked: true,
      musicGrounded: songFallback[0]?.text || "",
      gameGrounded: gameFallback[0]?.text || "",
      currentRoleFailsClosed: true,
      structuredSource: snapshot.publicFactGrounding?.resolver?.source || "",
      supportedRelations: snapshot.publicFactGrounding?.resolver?.supportedRelations?.length || 0
    };
  }

  async runContract(name) {
    if (name === "public-fact-grounding") return this.contractPublicFactGrounding();
    return super.runContract(name);
  }
}

export default baseWorker;
