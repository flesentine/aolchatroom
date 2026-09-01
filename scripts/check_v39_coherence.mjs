import assert from "node:assert/strict";
import fs from "node:fs";
import {
  V39_BOT_REENTRY_COOLDOWN_MS,
  filterSelfDialogueLines,
  futureEventViolation,
  humanCoherenceConstraint,
  inferClarificationTarget,
  reentryCooldownRemaining,
  withCoherenceConstraint
} from "../src/coherence_guard_v39.js";

const NOW = Date.parse("2026-08-30T13:30:00-07:00");

const phoenix = futureEventViolation("phoenix lights man yeah in ninety seven", NOW);
assert.equal(phoenix?.kind, "future-era-event");
assert.equal(phoenix?.event, "Phoenix Lights");
assert.equal(phoenix?.notBefore, "1997-03-13");
assert.equal(futureEventViolation("phoenix is way too hot today", NOW), null);
assert.equal(futureEventViolation("maybe something weird happens in phoenix next year", NOW), null);

function bot(from, text, atOffsetMs, extra = {}) {
  return {
    kind: "bot",
    from,
    text,
    target: "room",
    messageId: `m-${from}-${Math.abs(atOffsetMs)}`,
    at: NOW + atOffsetMs,
    ...extra
  };
}

const hotelHistory = [
  bot("MoonChild", "aint heard it yet, is it seriously that bad", -18000),
  bot("RaveChick", "haha yeah we had that at our hotel last week ;)", -5000)
];
const hotelRepair = inferClarificationTarget(hotelHistory, "had what at your hotel?", "Crateman", ["MoonChild", "RaveChick"], NOW);
assert.equal(hotelRepair?.name, "RaveChick");
assert.equal(hotelRepair?.messageId, hotelHistory[1].messageId);

const browserHistory = [
  bot("CyberDude", "lol that ps is slow, netcape's faster", -16000),
  bot("SegaMan", "yeah netcape is cool but saturn rules 2d", -4000)
];
const browserRepair = inferClarificationTarget(
  browserHistory,
  "what does netscape have anything to do with saturn? not even the same topic.",
  "Crateman",
  ["CyberDude", "SegaMan"],
  NOW
);
assert.equal(browserRepair?.name, "SegaMan");

const whoHistory = [
  bot("MoonChild", "call of the ktulu is pretty weird", -15000),
  bot("MetallicaFan", "dude seriously stop trying to ruin metallica for people", -3000)
];
const whoRepair = inferClarificationTarget(whoHistory, "who me?", "Crateman", ["MoonChild", "MetallicaFan"], NOW);
assert.equal(whoRepair?.name, "MetallicaFan");

assert.equal(
  inferClarificationTarget(hotelHistory, "RaveChick had what at your hotel?", "Crateman", ["MoonChild", "RaveChick"], NOW),
  null
);

const human = {
  kind: "human",
  from: "Crateman",
  text: "that makes no sense, you just said it was a video",
  target: "Sk8rGuy16",
  replyTo: "m-skate",
  messageId: "m-human",
  at: NOW
};
const coherenceHistory = [
  bot("Sk8rGuy16", "the frame rate drops when it renders the textures", -8000, { messageId: "m-skate", target: "Crateman" }),
  human
];
const lock = humanCoherenceConstraint(coherenceHistory, human);
assert.equal(lock.mode, "challenge");
assert.equal(lock.anchor?.from, "Sk8rGuy16");
assert.match(lock.text, /Exact referenced line: Sk8rGuy16/);
assert.match(lock.text, /Acknowledge\/correct the mismatch plainly/i);
assert.match(lock.text, /Do not jump to an unrelated artist/i);

const wrapped = withCoherenceConstraint({
  goal: "Explain what was meant.",
  moves: [{ speaker: "Sk8rGuy16", target: "Crateman", intent: "clarify", meaning: "Clarify the wording." }]
}, coherenceHistory, human);
assert.match(wrapped.plan.goal, /V39 COHERENCE LOCK/);
assert.match(wrapped.plan.moves[0].meaning, /Exact referenced line/);

const selfDialogue = filterSelfDialogueLines([
  { speaker: "TexTom", target: "room", intent: "ambient", text: "yall ever hear the one about the abandoned asylums" },
  { speaker: "TexTom", target: "room", intent: "reply", text: "abandoned asylums? i heard about one in Dallas" },
  { speaker: "JerseyGirl", target: "TexTom", intent: "reply", text: "that sounds creepy" },
  { speaker: "SegaMan", target: "SegaMan", intent: "reply", text: "yeah me too" }
]);
assert.equal(selfDialogue.blocked.length, 2);
assert.deepEqual(selfDialogue.blocked.map((row) => row._v39SelfDialogueReason), ["consecutive-self-reaction", "self-target"]);
assert.equal(selfDialogue.kept.length, 2);

const leaveHistory = [{ kind: "system", from: "", text: "CoolChick17 has left the room.", at: NOW - 10000 }];
const remaining = reentryCooldownRemaining(leaveHistory, "CoolChick17", NOW);
assert.ok(remaining > 0);
assert.ok(remaining <= V39_BOT_REENTRY_COOLDOWN_MS);
assert.equal(reentryCooldownRemaining(leaveHistory, "CoolChick17", NOW + V39_BOT_REENTRY_COOLDOWN_MS + 1), 0);

const runtime = fs.readFileSync(new URL("../src/index_v39_coherence.js", import.meta.url), "utf8");
assert.ok(runtime.includes('from "./index_v38_quality_guard.js"'));
assert.ok(runtime.includes("futureEventViolation(text, now)"));
assert.ok(runtime.includes("this.pendingHumanReplyTo.set(sender, repair.messageId)"));
assert.ok(runtime.includes("withCoherenceConstraint(plan, this.history || [], human)"));
assert.ok(runtime.includes("if (reason !== \"background\") return super.queueScenePlan"), "self-dialogue filtering must be background-only");
assert.ok(runtime.includes("this.v39ReentryRemaining(name, now)"));
assert.ok(runtime.includes('url.pathname === "/v39-status"'));
assert.ok(runtime.includes("diagnostics?.inheritedV38"), "v39 should repair the nullable top-level v38 diagnostics path");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const directV39 = wrangler.includes('"main": "src/index_v39_coherence.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"');
const presenceWrapper = fs.readFileSync(new URL("../src/index_v39_presence_fix.js", import.meta.url), "utf8");
const wrappedV39 = wrangler.includes('"main": "src/index_v39_presence_fix.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"')
  && presenceWrapper.includes('from "./index_v39_coherence.js"');
const worldWrapper = fs.readFileSync(new URL("../src/index_v39_world_gate.js", import.meta.url), "utf8");
const wrappedV39World = wrangler.includes('"main": "src/index_v39_world_gate.js"')
  && wrangler.includes('"DEPLOY_VERSION": "39"')
  && worldWrapper.includes('from "./index_v39_presence_fix.js"')
  && presenceWrapper.includes('from "./index_v39_coherence.js"');
const v40Wrapper = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
const wrappedByV40 = wrangler.includes('"main": "src/index_v40_scene_continuity.js"')
  && wrangler.includes('"DEPLOY_VERSION": "40"')
  && v40Wrapper.includes('from "./index_v39_world_gate.js"')
  && worldWrapper.includes('from "./index_v39_presence_fix.js"')
  && presenceWrapper.includes('from "./index_v39_coherence.js"');
assert.ok(directV39 || wrappedV39 || wrappedV39World || wrappedByV40, "production must deploy v39 coherence directly or through the additive v39/v40 wrappers");

console.log("v39 conversation-coherence regression checks passed");
