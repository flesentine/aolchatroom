import assert from "node:assert/strict";
import fs from "node:fs";
import { structuralShadowMove } from "../src/conversation_director.js";
import { contextualHumanMoveType, contextualStructuralMove } from "../src/human_move_context_v37.js";

function packet(text, { replyText = "closing shifts at the mall are the worst", sceneId = "s-capture", replyTo = "m-bot" } = {}) {
  return {
    triggerMessageId: "m-human",
    trigger: {
      messageId: "m-human",
      kind: "human",
      from: "Crateman",
      target: "JennJenn",
      text,
      replyTo,
      sceneId
    },
    exactReplyTo: {
      messageId: replyTo,
      kind: "bot",
      from: "JennJenn",
      target: "JerseyGirl",
      text: replyText,
      sceneId
    },
    onlineBots: ["JennJenn", "JerseyGirl", "CyberDude"],
    obligation: {
      speaker: "JennJenn",
      target: "Crateman",
      replyTo: "m-human",
      locked: true,
      reason: "direct-human-target"
    },
    activeScene: null,
    previousScene: null,
    openHumanQuestion: null,
    recentReferents: [],
    lines: [
      { messageId: "m-1", kind: "bot", from: "JerseyGirl", target: "room", text: "work was brutal today", sceneId },
      { messageId: replyTo, kind: "bot", from: "JennJenn", target: "JerseyGirl", text: replyText, sceneId },
      { messageId: "m-human", kind: "human", from: "Crateman", target: "JennJenn", text, replyTo, sceneId }
    ]
  };
}

for (const text of [
  "we talking about closing shfits again",
  "are we seriously talking about this again",
  "this again?"
]) {
  const p = packet(text);
  const contextual = contextualHumanMoveType(p);
  assert.equal(contextual.moveType, "pivot", `must infer contextual fatigue for: ${text}`);
  const move = contextualStructuralMove(p, structuralShadowMove(p));
  assert.equal(move.complete, true);
  assert.equal(move.speaker, "JennJenn");
  assert.equal(move.target, "Crateman");
  assert.equal(move.replyTo, "m-human");
  assert.equal(move.moveType, "pivot");
  assert.equal(move.sceneAction, "replace");
}

for (const text of [
  "are you still working tonight?",
  "do you still like green day?"
]) {
  const p = packet(text, { replyText: "yeah work was busy" });
  assert.notEqual(contextualHumanMoveType(p).moveType, "pivot", `ordinary question must not become pivot: ${text}`);
}

const runtime = fs.readFileSync(new URL("../src/index_v37_human_director.js", import.meta.url), "utf8");
assert.ok(runtime.includes("this.repairHumanTarget?.(human, Date.now())"), "target repair must happen before Director packet construction");
assert.ok(runtime.includes("legacyBrainBypasses"), "direct-human cutover must expose legacy Brain bypass diagnostics");
assert.ok(runtime.includes("legacyBrainGetsSecondVoteOnDirectHuman: false"), "old Brain must not get a second vote on authoritative direct-human turns");
assert.ok(runtime.includes("this.closeLegacySceneForPivot(human, move)"), "pivot must close the old legacy scene");
assert.ok(runtime.includes("this.clearSceneCarryPlan?.(planId)"), "pivot must break inherited scene carry");
assert.ok(runtime.includes("voiced.slice(0, 1)"), "one Director move must render as one surface line in this cutover");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wrangler.includes('"main": "src/index_v37_human_director.js"'), "production entrypoint must use the human Director wrapper");

console.log("v37 direct-human Director cutover regression checks passed");
