import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createConversationState,
  observeConversationMessage,
  reconstructConversationState,
  recordReferents,
  applySceneObservation,
  RECENT_REFERENT_LIMIT
} from "../src/conversation_state.js";
import {
  buildContextPacket,
  directorPrompt,
  packetContainsRequiredContext,
  structuralShadowMove,
  inferHumanMoveType,
  parseDirectorMove,
  attributeDirectorFailure
} from "../src/conversation_director.js";

const bots = ["JennJenn", "TexTom", "Sk8rGuy16", "MoonChild"];

let state = createConversationState(1000);
state = observeConversationMessage(state, {
  messageId: "h1", at: 1100, kind: "human", from: "Crateman", target: "TexTom", text: "what tags"
});
assert.equal(state.openHumanQuestion?.messageId, "h1");
assert.equal(state.openHumanQuestion?.target, "TexTom");
state = observeConversationMessage(state, {
  messageId: "b1", at: 1200, kind: "bot", from: "TexTom", target: "Crateman", replyTo: "h1", text: "the clothing tags she meant"
});
assert.equal(state.openHumanQuestion, null);

state = recordReferents(state, ["Mulder", "The X-Files", "aliens", "UFOs", "MoonChild", "extra"], 1300);
assert.equal(state.recentReferents.length, RECENT_REFERENT_LIMIT);
assert.equal(state.recentReferents[0].value, "Mulder");

state = applySceneObservation(state, { subject: "late-night radio", sceneAction: "replace", sceneId: "s1", participants: ["MoonChild"], lastMessageId: "r1", now: 1400 });
state = applySceneObservation(state, { subject: "Quake multiplayer", sceneAction: "replace", sceneId: "s2", participants: ["TexTom"], lastMessageId: "q1", now: 1500 });
assert.equal(state.activeScene.subject, "Quake multiplayer");
assert.equal(state.previousScene.subject, "late-night radio");
assert.equal(state.recentReferents.length, 0);
state = applySceneObservation(state, { subject: "late-night radio", sceneAction: "revive", participants: ["MoonChild"], lastMessageId: "r2", now: 1600 });
assert.equal(state.activeScene.subject, "late-night radio");

const reconstructed = reconstructConversationState([
  null,
  { messageId: "h2", at: 2000, kind: "human", from: "Crateman", target: "Sk8rGuy16", text: "who is he" }
]);
assert.equal(reconstructed.openHumanQuestion?.target, "Sk8rGuy16");

const tagsHistory = [
  { messageId: "t0", at: 3000, kind: "bot", from: "JennJenn", target: "room", text: "people leave tags and hangers under the dressing room bench", topic: "friends" },
  { messageId: "t1", at: 3100, kind: "bot", from: "GothicRose", target: "JennJenn", text: "if i saw any tags under a bench i'd call it a crime" },
  { messageId: "t2", at: 3200, kind: "human", from: "Crateman", target: "TexTom", text: "what tags" }
];
const tagsState = reconstructConversationState(tagsHistory);
const tagsPacket = buildContextPacket({ history: tagsHistory, state: tagsState, triggerRow: tagsHistory.at(-1), onlineBots: bots });
assert.equal(packetContainsRequiredContext(tagsPacket, { referentText: "tags under a bench", openHumanQuestion: true }), true);
const tagsMove = structuralShadowMove(tagsPacket);
assert.equal(tagsMove.speaker, "TexTom");
assert.equal(tagsMove.target, "Crateman");
assert.equal(tagsMove.replyTo, "t2");
assert.equal(tagsMove.moveType, "clarify");

const mulderHistory = [
  { messageId: "m0", at: 4000, kind: "bot", from: "Sk8rGuy16", target: "MoonChild", text: "chill out before he calls mulder on you dude" },
  { messageId: "m1", at: 4100, kind: "human", from: "Crateman", target: "Sk8rGuy16", text: "who is he" }
];
const mulderState = reconstructConversationState(mulderHistory);
const mulderPacket = buildContextPacket({ history: mulderHistory, state: mulderState, triggerRow: mulderHistory.at(-1), onlineBots: bots });
assert.equal(packetContainsRequiredContext(mulderPacket, { referentText: "mulder", openHumanQuestion: true }), true);
const mulderMove = structuralShadowMove(mulderPacket);
assert.equal(mulderMove.speaker, "Sk8rGuy16");
assert.equal(mulderMove.moveType, "clarify");

for (const text of [
  "can we change the subject",
  "enough about closing time",
  "lol you guys are still talking about that",
  "you guys love talking about closing time"
]) assert.equal(inferHumanMoveType(text), "pivot");

// Real probe paraphrases deliberately remain outside the cheap regex scaffold.
// Their semantic interpretation belongs to the model Director, not a growing phrase list.
for (const text of [
  "you all complain a lot about the same stuff",
  "so I guess we are back on the same complaints",
  "does anybody care about a different subject"
]) assert.equal(inferHumanMoveType(text), text.endsWith("subject") ? "answer" : "respond");

const probeHistory = [
  { messageId: "p0", at: 4500, kind: "bot", from: "JennJenn", target: "room", text: "closing shifts are exhausting" },
  { messageId: "p1", at: 4600, kind: "bot", from: "Sk8rGuy16", target: "JennJenn", text: "dealing with customers all day is brutal" },
  { messageId: "p2", at: 4700, kind: "human", from: "Crateman", target: "room", text: "so I guess we are back on the same complaints" }
];
const probePacket = buildContextPacket({ history: probeHistory, state: reconstructConversationState(probeHistory), triggerRow: probeHistory.at(-1), onlineBots: bots });
const probePrompt = directorPrompt(probePacket);
assert.ok(probePrompt.includes("ONLINE BOTS: JennJenn, TexTom, Sk8rGuy16, MoonChild"));
assert.ok(probePrompt.includes("Choose speaker EXACTLY"));
assert.ok(probePrompt.includes("Boredom, repetition complaints, sarcasm"));
assert.ok(probePrompt.includes("do NOT invent one"));
assert.ok(probePrompt.includes("do not blindly copy a stale subject"));
assert.ok(probePrompt.includes("Broad topic labels are diagnostic only"));

const unknownCauseHistory = [
  { messageId: "d0", at: 4800, kind: "bot", from: "JennJenn", target: "Crateman", text: "i work at a clothing store in the mall" },
  { messageId: "d1", at: 4810, kind: "bot", from: "JennJenn", target: "Crateman", text: "i work at a clothing store in the mall" },
  { messageId: "d2", at: 4820, kind: "human", from: "Crateman", target: "JennJenn", text: "why did you say that twice" }
];
const unknownCausePacket = buildContextPacket({ history: unknownCauseHistory, state: reconstructConversationState(unknownCauseHistory), triggerRow: unknownCauseHistory.at(-1), onlineBots: bots });
const unknownCausePrompt = directorPrompt(unknownCausePacket);
assert.ok(unknownCausePrompt.includes("If the human asks why something happened and the packet does not establish a cause"));
assert.ok(unknownCausePrompt.includes("Do not invent public or private facts"));

const wrongTopicHistory = [
  { messageId: "w0", at: 5000, kind: "bot", from: "DaBomb96", target: "room", text: "gwen is all over the radio", topic: "food" },
  { messageId: "w1", at: 5100, kind: "human", from: "Crateman", target: "room", text: "late night radio is better" }
];
const wrongTopicPacket = buildContextPacket({ history: wrongTopicHistory, state: reconstructConversationState(wrongTopicHistory), triggerRow: wrongTopicHistory.at(-1), onlineBots: bots });
assert.ok(wrongTopicPacket.lines.some((row) => row.text.includes("gwen") && row.topic === "food"));
assert.equal(wrongTopicPacket.activeScene, null);

const valid = parseDirectorMove(JSON.stringify({
  speaker: "TexTom", target: "Crateman", replyTo: "t2", subject: "dressing room tags", moveType: "clarify", goal: "explain what tags referred to", sceneAction: "continue"
}), { onlineBots: bots, humans: ["Crateman"], obligation: tagsPacket.obligation });
assert.equal(valid.ok, true);
const badLock = parseDirectorMove(JSON.stringify({
  speaker: "JennJenn", target: "Crateman", replyTo: "t2", subject: "dressing room tags", moveType: "clarify", goal: "explain it", sceneAction: "continue"
}), { onlineBots: bots, humans: ["Crateman"], obligation: tagsPacket.obligation });
assert.equal(badLock.ok, false);
assert.equal(badLock.error, "violates-routing-lock");
const badRoomSpeaker = parseDirectorMove(JSON.stringify({
  speaker: "OfflineBot", target: "Crateman", replyTo: "p2", subject: "repetitive complaints", moveType: "pivot", goal: "move to a different subject", sceneAction: "replace"
}), { onlineBots: bots, humans: ["Crateman"] });
assert.equal(badRoomSpeaker.ok, false);
assert.equal(badRoomSpeaker.error, "invalid-speaker");

assert.equal(attributeDirectorFailure({ packetOk: false }), "context/state");
assert.equal(attributeDirectorFailure({ providerError: true }), "provider");
assert.equal(attributeDirectorFailure({ parsedOk: false }), "director");
assert.equal(attributeDirectorFailure({ voiceOk: false }), "voice");
assert.equal(attributeDirectorFailure({ validatorOk: false }), "validator");
assert.equal(attributeDirectorFailure({}), "");

const directorSource = fs.readFileSync(new URL("../src/conversation_director.js", import.meta.url), "utf8");
assert.equal(directorSource.includes('from "./director.js"'), false);
assert.equal(directorSource.includes("FALLBACK_SCENES"), false);
assert.equal(directorSource.includes("you guys whine a lot about work and stuff"), false);
assert.equal(directorSource.includes("ok back to talking about work complaints"), false);

const runtimeSource = fs.readFileSync(new URL("../src/index_v37.js", import.meta.url), "utf8");
assert.equal(runtimeSource.includes('from "./director.js"'), false);
assert.equal(runtimeSource.includes("this.callProvider(provider, prompt"), true);
assert.equal(runtimeSource.includes("this.noteProviderFailure("), false);
assert.equal(runtimeSource.includes("this.noteProviderSuccess("), false);
assert.equal(runtimeSource.includes("this.noteOutputReject("), false);
assert.equal(runtimeSource.includes("visibleRoutingChanges: false"), true);
assert.equal(runtimeSource.includes("legacyPlannerAuthoritative: true"), true);

console.log("v37 conversation-state and director-shadow regression checks passed");
