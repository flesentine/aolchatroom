import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildPrimaryHumanVoiceContract,
  evaluatePrimaryHumanVoice
} from "../src/generation_contract_v41.js";

function directPlan({ speaker = "MetallicaFan", target = "Crateman", intent = "answer", goal, meaning } = {}) {
  return {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "direct-human-test",
    goal: goal || meaning || "answer the human",
    moves: [{ speaker, target, intent, topic: "general", meaning: meaning || goal || "answer the human" }]
  };
}

function line(text, { speaker = "MetallicaFan", target = "Crateman" } = {}) {
  return [{ speaker, target, intent: "answer", topic: "general", text, source: "gemini" }];
}

// Phase 0 characterized this exact deficiency: one contextless polarity word was
// allowed to surface despite two semantic obligations (ownership + price).
const neoPlan = directPlan({
  goal: "Answer both parts of the human question",
  meaning: "say whether he owns a Neo Geo and answer how much Neo Geo systems cost"
});
const neoHuman = {
  kind: "human",
  from: "Crateman",
  target: "MetallicaFan",
  text: "do you own a neo geo and how much do they cost?",
  messageId: "m-human"
};
const neoContract = buildPrimaryHumanVoiceContract({ plan: neoPlan, human: neoHuman });
assert.equal(neoContract.enforced, true);
assert.equal(neoContract.multiPart, true);
assert.deepEqual(new Set(neoContract.requirements), new Set(["price", "polarity"]));

const thinNeo = evaluatePrimaryHumanVoice({ plan: neoPlan, human: neoHuman, lines: line("nah") });
assert.equal(thinNeo.ok, false, "a polarity-only surface must not satisfy ownership + price");
assert.equal(thinNeo.reason, "missing-price");

const priceOnlyNeo = evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("they go for like 600 bucks")
});
assert.equal(priceOnlyNeo.ok, false, "topic overlap plus a price must not silently satisfy the separate yes/no obligation");
assert.equal(priceOnlyNeo.reason, "missing-polarity");

const completeNeo = evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("nah i dont own one, they go for like 600 bucks tho")
});
assert.equal(completeNeo.ok, true, "one short line may satisfy both obligations when both are present");
assert.equal(evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("i own one, they go for like 600 bucks")
}).ok, true, "an explicit ownership statement plus price must satisfy hard multipart polarity coverage");

const uncertainPrice = evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("nah i dont own one and idk what they cost")
});
assert.equal(uncertainPrice.ok, true, "explicit uncertainty still addresses the price obligation instead of silently dropping it");

// Do not overfit ordinary AOL brevity. A single yes/no or opinion question can
// still be answered naturally without parroting topic keywords.
const zeldaPlan = directPlan({
  speaker: "SegaMan",
  intent: "answer",
  meaning: "say whether he likes Zelda"
});
const zelda = evaluatePrimaryHumanVoice({
  plan: zeldaPlan,
  human: { from: "Crateman", target: "SegaMan", text: "do you like zelda?" },
  lines: line("yeah it rules", { speaker: "SegaMan" })
});
assert.equal(zelda.ok, true);
assert.equal(zelda.coverage.find((row) => row.kind === "polarity")?.hard, false, "single polarity questions remain conservative/advisory");

// Price is a high-confidence obligation even when it is the only question.
const pricePlan = directPlan({ meaning: "answer what the Neo Geo costs" });
const priceHuman = { from: "Crateman", target: "MetallicaFan", text: "what does a neo geo cost?" };
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("lol") }).ok, false);
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("like 600 bucks") }).ok, true);
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("idk, no idea what they go for") }).ok, true);

// Clarification/repair turns must remain tied to the referenced exchange rather
// than becoming a random room tangent.
const clarificationPlan = directPlan({
  speaker: "JennJenn",
  intent: "clarify",
  meaning: "explain what she meant about the hotel night shift"
});
const history = [{
  kind: "bot",
  from: "JennJenn",
  target: "Crateman",
  text: "the hotel night shift was nuts",
  messageId: "m-hotel",
  at: 1
}];
const clarificationHuman = {
  kind: "human",
  from: "Crateman",
  target: "JennJenn",
  text: "what do you mean by hotel?",
  replyTo: "m-hotel"
};
const tangent = evaluatePrimaryHumanVoice({
  plan: clarificationPlan,
  human: clarificationHuman,
  history,
  lines: line("that mtv video was weird", { speaker: "JennJenn" })
});
assert.equal(tangent.ok, false);
assert.equal(tangent.reason, "clarification-ungrounded");
assert.equal(evaluatePrimaryHumanVoice({
  plan: clarificationPlan,
  human: clarificationHuman,
  history,
  lines: line("i meant the hotel night shift was nuts", { speaker: "JennJenn" })
}).ok, true);

// Intentional pivots are supposed to change subject and must not be rejected for
// low lexical overlap with the old conversation.
const pivotPlan = directPlan({
  speaker: "JennJenn",
  intent: "pivot",
  meaning: "briefly acknowledge repetition fatigue then introduce a different casual subject"
});
const pivot = evaluatePrimaryHumanVoice({
  plan: pivotPlan,
  human: { from: "Crateman", target: "JennJenn", text: "are we seriously talking about this again" },
  lines: line("yeah ok lol... anyone catch mtv last night?", { speaker: "JennJenn" })
});
assert.equal(pivot.ok, true);
assert.equal(pivot.reason, "pivot-semantic-shift-allowed");

// Background Voice remains outside the Phase 2A direct-human contract.
const background = evaluatePrimaryHumanVoice({
  plan: { ...neoPlan, reason: "background" },
  human: null,
  lines: line("nah")
});
assert.equal(background.enforced, false);
assert.equal(background.ok, true);

// Production wiring: Phase 2A remains the semantic sub-contract inside the 2B
// wrapper, and a semantic reject still returns [] into v37's established fallback.
const wrapper = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
assert.ok(wrapper.includes('from "./index_v41_scene_coordinator.js"'));
assert.ok(wrapper.includes("evaluatePrimaryHumanVoice"));
assert.ok(wrapper.includes("return [];"));
assert.ok(wrapper.includes('phase: "2B"'));
assert.ok(!wrapper.includes("callProvider("), "Phase 2 must not add a provider/judge call");

console.log("v41 Phase 2A primary Voice semantic-contract checks passed beneath Phase 2B");
