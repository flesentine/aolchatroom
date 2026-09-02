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

const maybePriceOnly = evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("maybe 600 bucks")
});
assert.equal(maybePriceOnly.ok, false, "price uncertainty must not double as the ownership answer");
assert.equal(maybePriceOnly.reason, "missing-polarity");

for (const surface of ["not sure what it costs", "no idea what it goes for", "i don't know what it costs"]) {
  const priceUncertaintyOnly = evaluatePrimaryHumanVoice({ plan: neoPlan, human: neoHuman, lines: line(surface) });
  assert.equal(priceUncertaintyOnly.ok, false, `${surface} must not leak uncertainty words into the ownership clause`);
  assert.equal(priceUncertaintyOnly.reason, "missing-polarity");
}

const genericALot = evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("yeah i like it a lot")
});
assert.equal(genericALot.ok, false, "generic 'a lot' must not masquerade as a price answer in multipart output");
assert.equal(genericALot.reason, "missing-price");

assert.equal(evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("maybe i own one, around 600 bucks")
}).ok, true, "ownership-scoped uncertainty plus a price should remain valid");

const ownershipUncertainOnly = evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("not sure if i still own it")
});
assert.equal(ownershipUncertainOnly.ok, false);
assert.equal(ownershipUncertainOnly.reason, "missing-price");

for (const surface of ["yeah i bought it in 1995", "yeah i paid for it in 1995"]) {
  const yearOnly = evaluatePrimaryHumanVoice({ plan: neoPlan, human: neoHuman, lines: line(surface) });
  assert.equal(yearOnly.ok, false, `${surface} must not masquerade as a price answer`);
  assert.equal(yearOnly.reason, "missing-price");
}

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
assert.equal(evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("yeah i own one, it was like 600")
}).ok, true, "an approximate non-year number can be price evidence when phrased as an amount");

const uncertainPrice = evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("nah i dont own one and idk what they cost")
});
assert.equal(uncertainPrice.ok, true, "price-scoped uncertainty addresses the price obligation instead of silently dropping it");
assert.equal(evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("yeah i own one but no idea what they go for")
}).ok, true, "another price-scoped uncertainty form should be accepted");
assert.equal(evaluatePrimaryHumanVoice({
  plan: neoPlan,
  human: neoHuman,
  lines: line("not sure what it costs but yes")
}).ok, true, "an explicit polarity answer outside the uncertainty phrase should remain usable");

const countPricePlan = directPlan({
  meaning: "say how many Neo Geo systems he owns and how much they cost"
});
const countPriceHuman = {
  from: "Crateman",
  target: "MetallicaFan",
  text: "how many neo geo systems do you own and how much do they cost?"
};
const priceWithoutCount = evaluatePrimaryHumanVoice({
  plan: countPricePlan,
  human: countPriceHuman,
  lines: line("they go for about 600 bucks")
});
assert.equal(priceWithoutCount.ok, false);
assert.equal(priceWithoutCount.reason, "missing-quantity");
assert.equal(evaluatePrimaryHumanVoice({
  plan: countPricePlan,
  human: countPriceHuman,
  lines: line("i have 2, they go for about 600 bucks")
}).ok, true);

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
assert.equal(evaluatePrimaryHumanVoice({
  plan: zeldaPlan,
  human: { from: "Crateman", target: "SegaMan", text: "do you like zelda?" },
  lines: line("maybe", { speaker: "SegaMan" })
}).ok, true, "a short maybe remains valid for a single yes/no question");

const pricePlan = directPlan({ meaning: "answer what the Neo Geo costs" });
const priceHuman = { from: "Crateman", target: "MetallicaFan", text: "what does a neo geo cost?" };
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("lol") }).ok, false);
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("600") }).ok, true);
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("like 600 bucks") }).ok, true);
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("a lot") }).ok, true, "a lot remains a valid compact answer when price is the only obligation");
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("idk") }).ok, true);
assert.equal(evaluatePrimaryHumanVoice({ plan: pricePlan, human: priceHuman, lines: line("1995") }).ok, false, "a bare year must not be accepted as a price");

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

const background = evaluatePrimaryHumanVoice({
  plan: { ...neoPlan, reason: "background" },
  human: null,
  lines: line("nah")
});
assert.equal(background.enforced, false);
assert.equal(background.ok, true);

const wrapper = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");
assert.ok(wrapper.includes('from "./index_v41_scene_coordinator.js"'));
assert.ok(wrapper.includes('from "./index_v14.js"'));
assert.ok(wrapper.includes("evaluatePrimaryHumanVoice"));
assert.ok(wrapper.includes("ContinuityFallbackChatRoom.prototype.builtInHumanReply.call"), "Phase 2B must bypass provider-aware built-in suppression");
assert.ok(wrapper.includes("return [];"));
assert.ok(wrapper.includes('phase: "2B"'));
assert.ok(!wrapper.includes("callProvider("), "Phase 2 must not add a provider/judge call");

console.log("v41 Phase 2A primary Voice semantic-contract checks passed beneath Phase 2B");
