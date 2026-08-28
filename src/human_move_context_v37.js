import { inferHumanMoveType } from "./conversation_director.js";

const REPETITION_CUE = /\b(?:again|still|same|repeat(?:ing|ed)?|keeps?|kept|already|another)\b/i;
const META_CUE = /\b(?:talk(?:ing)?|topic|subject|conversation|this|that|it)\b/i;
const STOP = new Set([
  "about", "again", "already", "also", "another", "been", "being", "conversation", "does", "from", "have",
  "into", "just", "keep", "keeps", "kept", "like", "more", "really", "same", "still", "subject", "talk", "talking",
  "that", "them", "then", "there", "these", "they", "this", "those", "topic", "what", "when", "where", "which", "with",
  "would", "your", "youre"
]);

function words(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

function overlapCount(a, b) {
  const aa = new Set(words(a));
  const bb = new Set(words(b));
  let overlap = 0;
  for (const word of aa) if (bb.has(word)) overlap += 1;
  return overlap;
}

export function conversationFatigueEvidence(packet) {
  const trigger = packet?.trigger;
  const text = String(trigger?.text || "");
  if (!trigger || trigger.kind !== "human" || !REPETITION_CUE.test(text) || !META_CUE.test(text)) {
    return { fatigue: false, reason: "no-contextual-repetition-signal", overlap: 0, sameSceneLines: 0 };
  }

  const triggerId = String(trigger.messageId || packet?.triggerMessageId || "");
  const prior = (packet?.lines || []).filter((row) => String(row?.messageId || "") !== triggerId && row?.kind !== "human");
  const exact = packet?.exactReplyTo || null;
  const sceneId = String(trigger.sceneId || exact?.sceneId || "");
  const sameSceneLines = sceneId ? prior.filter((row) => String(row?.sceneId || "") === sceneId).length : 0;
  const overlap = prior.reduce((best, row) => Math.max(best, overlapCount(text, row?.text || "")), 0);
  const anchored = Boolean(exact?.text) || sameSceneLines >= 2;

  // This is an observation about interaction structure, not a topic keyword rule:
  // a human uses repetition/meta language while anchored to recent conversation.
  // Meaningful lexical overlap strengthens the signal but is not required when
  // reply/scene linkage already establishes what "this/again" refers to.
  const fatigue = anchored && (overlap >= 1 || sameSceneLines >= 2 || Boolean(exact?.text));
  return {
    fatigue,
    reason: fatigue ? "human-meta-repetition-anchored-to-recent-exchange" : "repetition-not-anchored",
    overlap,
    sameSceneLines,
    anchorMessageId: String(exact?.messageId || "")
  };
}

export function contextualHumanMoveType(packet) {
  const base = inferHumanMoveType(packet?.trigger?.text || "");
  if (base === "pivot") return { moveType: "pivot", evidence: { fatigue: true, reason: "explicit-pivot-cue" } };
  const evidence = conversationFatigueEvidence(packet);
  if (evidence.fatigue) return { moveType: "pivot", evidence };
  return { moveType: base, evidence };
}

export function contextualStructuralMove(packet, structuralMove) {
  if (!structuralMove) return null;
  const contextual = contextualHumanMoveType(packet);
  if (contextual.moveType !== "pivot") return { ...structuralMove, contextEvidence: contextual.evidence };
  return {
    ...structuralMove,
    moveType: "pivot",
    sceneAction: "replace",
    goal: `Briefly acknowledge ${packet?.trigger?.from || "the human"}'s repetition fatigue, then introduce a genuinely different casual subject using only the speaker's established character context.`,
    contextEvidence: contextual.evidence
  };
}
