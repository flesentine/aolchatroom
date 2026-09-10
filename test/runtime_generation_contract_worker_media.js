import baseWorker, { RuntimeGenerationContractRoom as BaseRuntimeGenerationContractRoom } from "./runtime_generation_contract_worker.js";
import { getCharacter } from "../src/characters.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function directPlan({ speaker, target = "Crateman", intent = "answer", goal, meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "public-media-fact",
    goal: goal || meaning || "answer the human",
    moves: [{
      speaker,
      target,
      intent,
      topic: "movies",
      meaning: meaning || goal || "answer the human"
    }]
  };
}

export class RuntimeGenerationContractRoom extends BaseRuntimeGenerationContractRoom {
  async contractPublicMediaFactGrounding() {
    const movieLine = {
      kind: "bot",
      from: "MacAddict",
      target: "Crateman",
      text: "independence day is still pulling in crowds",
      messageId: "media-movie",
      at: Date.now() - 3000
    };
    const human = {
      kind: "human",
      from: "Crateman",
      target: "Sk8rGuy16",
      text: "who stars in that",
      messageId: "media-question",
      at: Date.now() - 2000
    };
    this.reset({ history: [movieLine, human], bots: ["MacAddict", "Sk8rGuy16"] });
    const skater = getCharacter("Sk8rGuy16");
    ensure(skater, "public-media contract needs Sk8rGuy16");

    this.contractVoiceText = "keanu reaves and al pacino";
    const plan = directPlan({
      speaker: "Sk8rGuy16",
      goal: "answer who stars in the movie",
      meaning: "answer the cast question about the movie in recent chat"
    });
    const wrong = await this.voiceBrainPlan(plan, [skater], human);
    equal(wrong.length, 0, "wrong Independence Day cast must fail closed before display");
    equal(this.v41LastGenerationContract?.reason, "public-media-cast-ungrounded", "wrong cast rejection must be attributed to public-media grounding");

    const fallback = this.v41DeterministicHumanFallback(human);
    equal(fallback.length, 1, "grounded cast fallback must occupy the required primary slot");
    equal(fallback[0]?.speaker, "Sk8rGuy16", "grounded fallback must preserve the required responder");
    equal(fallback[0]?.target, "Crateman", "grounded fallback must preserve the human target");
    ensure(/will smith/i.test(fallback[0]?.text || ""), "grounded fallback must name Will Smith");
    ensure(/jeff goldblum/i.test(fallback[0]?.text || ""), "grounded fallback must name Jeff Goldblum");
    ensure(/bill pullman/i.test(fallback[0]?.text || ""), "grounded fallback must name Bill Pullman");

    const wrongAnswer = {
      kind: "bot",
      from: "Sk8rGuy16",
      target: "Crateman",
      text: "keanu reaves and al pacino",
      messageId: "media-wrong",
      at: Date.now() - 1000
    };
    const challenge = {
      kind: "human",
      from: "Crateman",
      target: "Sk8rGuy16",
      text: "i think that's wrong",
      messageId: "media-challenge",
      at: Date.now()
    };
    this.reset({ history: [movieLine, human, wrongAnswer, challenge], bots: ["MacAddict", "Sk8rGuy16"] });
    this.contractVoiceText = "dude i meant devil's advocate wtf";
    const challengePlan = directPlan({
      speaker: "Sk8rGuy16",
      intent: "correct",
      goal: "respond to the human factual correction",
      meaning: "acknowledge and repair the cast answer"
    });
    const rationalized = await this.voiceBrainPlan(challengePlan, [skater], challenge);
    equal(rationalized.length, 0, "inventing a different movie must not escape a factual challenge");
    equal(this.v41LastGenerationContract?.reason, "public-media-challenge-rationalization", "invented title switch must have a specific rejection reason");

    const correction = this.v41DeterministicHumanFallback(challenge);
    equal(correction.length, 1, "factual challenge must have a grounded correction fallback");
    ensure(/you(?:'re| are) right/i.test(correction[0]?.text || ""), "repair fallback must acknowledge the correction");
    ensure(/independence day/i.test(correction[0]?.text || ""), "repair fallback must stay on the actual movie");
    ensure(/will smith/i.test(correction[0]?.text || ""), "repair fallback must restore a trusted cast fact");

    const unknown = {
      kind: "human",
      from: "Crateman",
      target: "Sk8rGuy16",
      text: "who stars in mystery movie xyz?",
      messageId: "media-unknown",
      at: Date.now()
    };
    this.reset({ history: [unknown], bots: ["Sk8rGuy16"] });
    this.contractVoiceText = "tom hanks and nic cage";
    const unknownPlan = directPlan({
      speaker: "Sk8rGuy16",
      goal: "answer the movie cast question",
      meaning: "answer who stars in the named movie"
    });
    const unverified = await this.voiceBrainPlan(unknownPlan, [skater], unknown);
    equal(unverified.length, 0, "unverified public movie detail must not be guessed confidently");
    equal(this.v41LastGenerationContract?.reason, "public-media-unverified-confident-answer", "unknown public facts must fail with explicit attribution");
    const uncertain = this.v41DeterministicHumanFallback(unknown);
    equal(uncertain.length, 1, "unknown movie detail must fall back to natural uncertainty");
    ensure(/not sure|dont wanna make that up/i.test(uncertain[0]?.text || ""), "unknown fact fallback must not invent a cast");

    const snapshot = this.v41Snapshot(Date.now());
    equal(snapshot.policy?.directPublicMediaFactsMustBeGrounded, true, "status must expose grounded public-media policy");
    equal(snapshot.policy?.factualChallengeCannotInventReplacementTitle, true, "status must expose no-rationalization policy");
    ensure(snapshot.publicMediaFactGrounding?.stats?.providerSurfacesRejected >= 3, "public-media reject telemetry must be visible");
    ensure(snapshot.publicMediaFactGrounding?.stats?.groundedFallbacks >= 3, "public-media fallback telemetry must be visible");

    return {
      wrongCastBlocked: true,
      groundedFallback: fallback[0]?.text || "",
      titleSwitchBlocked: true,
      groundedCorrection: correction[0]?.text || "",
      unknownFactFailsToUncertainty: true,
      stats: snapshot.publicMediaFactGrounding?.stats || null
    };
  }

  async runContract(name) {
    if (name === "public-media-fact-grounding") return this.contractPublicMediaFactGrounding();
    return super.runContract(name);
  }
}

export default baseWorker;
