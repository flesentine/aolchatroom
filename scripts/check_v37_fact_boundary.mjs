import assert from "node:assert/strict";
import fs from "node:fs";
import { createConversationState } from "../src/conversation_state.js";
import {
  buildContextPacket,
  directorPrompt,
  inferHumanMoveType,
  packetContainsRequiredContext
} from "../src/conversation_director.js";
import {
  hasInternalChatMetadata,
  stripInternalChatMetadata
} from "../src/output_hygiene_v37.js";

const bots = ["MetallicaFan", "JerseyGirl", "CyberDude", "SoCalGuy"];
const history = [
  { messageId: "r0", at: 1000, kind: "bot", from: "MetallicaFan", target: "Crateman", text: "country music in a rock chat dude", topic: "music" },
  { messageId: "r1", at: 1010, kind: "bot", from: "JerseyGirl", target: "Crateman", text: "omg no way that is so not my thing", topic: "music" },
  { messageId: "r2", at: 1020, kind: "human", from: "Crateman", target: "MetallicaFan", text: "is this actually a themed room?", topic: "general" }
];
const packet = buildContextPacket({
  history,
  state: createConversationState(900),
  triggerRow: history.at(-1),
  onlineBots: bots
});
assert.equal(packet.version, 2);
assert.equal(packet.room.name, "Town Square");
assert.equal(packet.room.kind, "general public chat room");
assert.equal(packetContainsRequiredContext(packet, { roomName: "Town Square", openHumanQuestion: false }), true);

const prompt = directorPrompt(packet);
assert.ok(prompt.includes("ROOM CONTEXT: Town Square — general public chat room"));
assert.ok(prompt.includes("current subject never redefines the room's identity"));
assert.ok(prompt.includes("Keep the goal fact-agnostic"));
assert.ok(prompt.includes("Do not infer a character's tastes, history, or stance from a screen name"));
assert.ok(prompt.includes("do not decide the stance or invent the anecdote yourself"));
assert.ok(prompt.includes("Room identity comes only from ROOM CONTEXT"));
assert.ok(prompt.includes("markup, IDs, or technical-looking text whose meaning is not established"));

// Real live paraphrases stay outside the cheap regex scaffold. The model path owns
// pragmatic interpretation; this regression prevents phrase-by-phrase patch growth.
assert.equal(inferHumanMoveType("are we seriously still on this?"), "answer");
assert.equal(inferHumanMoveType("oh good more work stories lol"), "respond");

// Internal thread/topic diagnostics are never visible bot dialogue.
const leaked = "wrong room if u want line dancing {t1178/general}";
assert.equal(hasInternalChatMetadata(leaked), true);
assert.equal(stripInternalChatMetadata(leaked), "wrong room if u want line dancing");
assert.equal(stripInternalChatMetadata("one {t1181/music} two {t1179/metal}"), "one two");
assert.equal(stripInternalChatMetadata("normal braces {whatever}"), "normal braces {whatever}");
assert.equal(hasInternalChatMetadata("normal braces {whatever}"), false);

const directorSource = fs.readFileSync(new URL("../src/conversation_director.js", import.meta.url), "utf8");
assert.equal(directorSource.includes("this is a rock chat?"), false);
assert.equal(directorSource.includes("anybody here ever go camping?"), false);
assert.equal(directorSource.includes("anyone here actually like country music?"), false);
assert.equal(directorSource.includes("oh good more work stories lol"), false);

const hotfixSource = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
assert.ok(hotfixSource.includes("stripInternalChatMetadata"));
assert.ok(hotfixSource.includes("internalMetadataStrips"));
assert.ok(hotfixSource.includes("internalMetadataOutputHygiene: true"));
assert.ok(hotfixSource.includes("productionTurnSingleFlight: true"));
assert.ok(hotfixSource.includes("liveAiShadowPausedForProviderStability: true"));
assert.ok(hotfixSource.includes("shadowPacketsStillRecordedWhileModelPaused: true"));
assert.ok(hotfixSource.includes("live-model-shadow-paused"));
assert.ok(hotfixSource.includes("maybeRunV37Shadow(now = Date.now())"));

console.log("v37 Director fact-boundary, output-hygiene, and provider-isolation regression checks passed");
