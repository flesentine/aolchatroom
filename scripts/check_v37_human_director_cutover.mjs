import assert from "node:assert/strict";
import fs from "node:fs";
import { structuralShadowMove } from "../src/conversation_director.js";
import {
  contextualHumanMoveType,
  contextualStructuralMove,
  hasConversationFatigueCue
} from "../src/human_move_context_v37.js";

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
  "this again?",
  "are we still talking about this?",
  "we already talked about this before"
]) {
  assert.equal(hasConversationFatigueCue(text), true, `must recognize actual conversation fatigue: ${text}`);
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
  "do you still like green day?",
  "do you still have it?",
  "is that still happening?",
  "did you already see it?",
  "is that the same?",
  "can you play it again?"
]) {
  assert.equal(hasConversationFatigueCue(text), false, `ordinary grammar must not count as fatigue: ${text}`);
  const p = packet(text, { replyText: "yeah work was busy" });
  assert.notEqual(contextualHumanMoveType(p).moveType, "pivot", `ordinary question must not become pivot: ${text}`);
}

const runtime = fs.readFileSync(new URL("../src/index_v37_human_director.js", import.meta.url), "utf8");
assert.ok(runtime.includes("this.repairHumanTarget?.(human, Date.now())"), "target repair must happen before Director packet construction");
assert.ok(runtime.includes("legacyBrainBypasses"), "direct-human cutover must expose legacy Brain bypass diagnostics");
assert.ok(runtime.includes("legacyBrainGetsSecondVoteOnDirectHuman: false"), "old Brain must not get a second vote on authoritative direct-human turns");
assert.ok(runtime.includes("this.closeLegacySceneForPivot(human, move)"), "pivot must close the old legacy scene");
assert.ok(runtime.includes("this.clearSceneCarryPlan?.(planId)"), "pivot must break inherited scene carry");
assert.ok(runtime.includes('_v37ForceNewScene: move.sceneAction === "replace"'), "pivot output must carry an explicit fresh-scene marker");
assert.ok(runtime.includes("if (message?._v37ForceNewScene) return null"), "legacy scene lookup must refuse inheritance for pivot replacement lines");
assert.ok(runtime.includes("item._v37ForceNewScene = true"), "queue normalization must preserve the fresh-scene marker");
assert.ok(runtime.includes("pivotForcesFreshLegacyScene: true"), "fresh-scene pivot behavior must be exposed in diagnostics");
assert.ok(runtime.includes("voiced.slice(0, 1)"), "one Director move must render as one surface line in this cutover");

const production = fs.readFileSync(new URL("../src/index_v37_lively_ambient.js", import.meta.url), "utf8");
assert.ok(production.includes('from "./index_v37_human_director.js"'), "production ambient layer must preserve authoritative direct-human routing");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const directV37 = wrangler.includes('"main": "src/index_v37_lively_ambient.js"');
const v38Url = new URL("../src/index_v38_quality_guard.js", import.meta.url);
const v39Url = new URL("../src/index_v39_coherence.js", import.meta.url);
const v39PresenceUrl = new URL("../src/index_v39_presence_fix.js", import.meta.url);
const v39WorldUrl = new URL("../src/index_v39_world_gate.js", import.meta.url);
const v40Url = new URL("../src/index_v40_scene_continuity.js", import.meta.url);
const v41Url = new URL("../src/index_v41_scene_coordinator.js", import.meta.url);
const v38Entrypoint = fs.existsSync(v38Url) ? fs.readFileSync(v38Url, "utf8") : "";
const wrappedV38 = wrangler.includes('"main": "src/index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39Entrypoint = fs.existsSync(v39Url) ? fs.readFileSync(v39Url, "utf8") : "";
const wrappedV39 = wrangler.includes('"main": "src/index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39PresenceEntrypoint = fs.existsSync(v39PresenceUrl) ? fs.readFileSync(v39PresenceUrl, "utf8") : "";
const wrappedV39Presence = wrangler.includes('"main": "src/index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v39WorldEntrypoint = fs.existsSync(v39WorldUrl) ? fs.readFileSync(v39WorldUrl, "utf8") : "";
const wrappedV39World = wrangler.includes('"main": "src/index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v40Entrypoint = fs.existsSync(v40Url) ? fs.readFileSync(v40Url, "utf8") : "";
const wrappedV40 = wrangler.includes('"main": "src/index_v40_scene_continuity.js"')
  && v40Entrypoint.includes('from "./index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
const v41Entrypoint = fs.existsSync(v41Url) ? fs.readFileSync(v41Url, "utf8") : "";
const wrappedV41 = wrangler.includes('"main": "src/index_v41_scene_coordinator.js"')
  && v41Entrypoint.includes('from "./index_v40_scene_continuity.js"')
  && v40Entrypoint.includes('from "./index_v39_world_gate.js"')
  && v39WorldEntrypoint.includes('from "./index_v39_presence_fix.js"')
  && v39PresenceEntrypoint.includes('from "./index_v39_coherence.js"')
  && v39Entrypoint.includes('from "./index_v38_quality_guard.js"')
  && v38Entrypoint.includes('from "./index_v37_lively_ambient.js"');
assert.ok(directV37 || wrappedV38 || wrappedV39 || wrappedV39Presence || wrappedV39World || wrappedV40 || wrappedV41, "production entrypoint must retain human Director through an explicit v37/v38/v39/v40/v41 wrapper chain");

console.log("v37 direct-human Director cutover regression checks passed");
