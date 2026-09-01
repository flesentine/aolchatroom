import { subjectForText } from "./continuity.js";

export const V41_DIRECT_ASSOCIATION_THRESHOLD = 48;
export const V41_ROOM_ASSOCIATION_THRESHOLD = 46;
export const V41_AMBIGUITY_MARGIN = 6;
export const V41_ASSOCIATION_HISTORY_MS = 3 * 60 * 1000;

const CONTEXTLESS_REACTION = /^(?:seriously\??|really\??|what\??|huh\??|why\??|maybe|no way|lol really|lol|yeah|nah|wow|ugh|heh|same)$/i;
const CONTINUATION_INTENTS = new Set([
  "reply", "answer", "continue", "continuation", "followup", "follow-up", "reaction",
  "agree", "disagree", "question", "clarify", "clarification", "joke", "tease"
]);
const NEW_TOPIC_INTENTS = new Set(["ambient", "starter", "new-topic", "new_topic", "announce", "announcement"]);
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "do", "for", "from", "had",
  "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my",
  "of", "on", "or", "our", "she", "so", "that", "the", "their", "them", "they", "this", "to",
  "u", "was", "we", "were", "what", "with", "you", "your", "yeah", "yes", "no", "lol", "omg"
]);

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sceneClosed(scene) {
  return Boolean(scene?.closedAt || scene?.status === "closed");
}

function topicOf(message) {
  return clean(message?.topic || subjectForText(message?.text, "general")) || "general";
}

function tokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/^'+|'+$/g, ""))
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

function overlapCount(a, b) {
  if (!a.size || !b.size) return 0;
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function namesInRow(row) {
  return new Set([row?.from, row?.speaker, row?.target].filter((name) => name && name !== "room"));
}

function rowSceneId(row) {
  return String(row?.sceneId || row?._continuitySceneId || row?.scenePlanId || row?.threadId || "");
}

function recentSceneRows(history, sceneId, now) {
  return (history || [])
    .filter((row) => rowSceneId(row) === sceneId && Number(now || 0) - Number(row?.at || 0) <= V41_ASSOCIATION_HISTORY_MS)
    .slice(-8);
}

function recencyScore(scene, now) {
  const age = Math.max(0, Number(now || 0) - Number(scene?.lastAt || 0));
  if (age <= 20000) return 18;
  if (age <= 60000) return 14;
  if (age <= 110000) return 9;
  return 4;
}

function sceneTextTokens(scene, rows) {
  const values = [scene?.lastText, scene?.openQuestion?.text, ...(rows || []).slice(-4).map((row) => row?.text)];
  return tokens(values.filter(Boolean).join(" "));
}

function openQuestionOwnership(scene, from, target) {
  const question = scene?.openQuestion || null;
  if (!question) return false;
  if (question.target && question.target !== "room") {
    return question.target === from && (!target || target === "room" || target === question.from);
  }
  return Boolean(question.from && target && target !== "room" && target === question.from);
}

function recentPairEvidence(rows, from, target) {
  if (!from || !target || target === "room") return { exactPair: false, addressedSpeaker: false };
  let exactPair = false;
  let addressedSpeaker = false;
  for (const row of rows || []) {
    const rowFrom = row?.from || row?.speaker || "";
    const rowTarget = row?.target || "room";
    if ((rowFrom === from && rowTarget === target) || (rowFrom === target && rowTarget === from)) exactPair = true;
    if (rowFrom === target && rowTarget === from) addressedSpeaker = true;
  }
  return { exactPair, addressedSpeaker };
}

function recentSpeakerEvidence(rows, from) {
  if (!from) return false;
  return (rows || []).some((row) => {
    const names = namesInRow(row);
    return names.has(from);
  });
}

function reasonFor(features, direct) {
  if (features.openQuestionOwned) return "open-question";
  if (direct && features.exactPair) return "direct-pair";
  if (features.speakerParticipant && features.lexicalOverlap > 0) return "participant-context";
  if (features.speakerParticipant && features.continuationIntent) return "participant-continuation";
  if (features.sameTopic && features.lexicalOverlap > 0) return "topic-context";
  if (direct && features.targetParticipant) return "target-context";
  return "weak-context";
}

export function scoreSceneCandidate(scene, message, history = [], now = Date.now()) {
  if (!scene || sceneClosed(scene)) return null;
  const from = clean(message?.from || message?.speaker);
  const target = clean(message?.target || "room") || "room";
  const direct = target !== "room";
  const participants = new Set((scene?.participants || []).filter(Boolean));
  const rows = recentSceneRows(history, scene.id, now);
  const messageTokens = tokens(message?.text);
  const candidateTokens = sceneTextTokens(scene, rows);
  const lexicalOverlap = overlapCount(messageTokens, candidateTokens);
  const topic = topicOf(message);
  const sameTopic = topic !== "general" && clean(scene?.topic) === topic;
  const intent = clean(message?.intent).toLowerCase();
  const continuationIntent = CONTINUATION_INTENTS.has(intent);
  const newTopicIntent = NEW_TOPIC_INTENTS.has(intent);
  const reaction = CONTEXTLESS_REACTION.test(clean(message?.text));
  const pair = recentPairEvidence(rows, from, target);
  const speakerParticipant = Boolean(from && participants.has(from));
  const targetParticipant = Boolean(direct && participants.has(target));
  const openQuestionOwned = openQuestionOwnership(scene, from, target);
  const speakerRecentlyPresent = recentSpeakerEvidence(rows, from);

  let score = recencyScore(scene, now);
  if (sameTopic) score += 14;
  if (lexicalOverlap >= 2) score += 18;
  else if (lexicalOverlap === 1) score += messageTokens.size <= 2 ? 14 : 10;
  if (openQuestionOwned) score += 28;

  if (direct) {
    if (speakerParticipant && targetParticipant) score += 38;
    else {
      if (speakerParticipant) score += 20;
      if (targetParticipant) score += 18;
    }
    if (pair.exactPair) score += 24;
    if (pair.addressedSpeaker) score += 10;
    if (continuationIntent) score += 6;
  } else {
    if (speakerParticipant) score += 26;
    if (speakerRecentlyPresent) score += 10;
    if (continuationIntent) score += 8;
    if (reaction && speakerParticipant) score += 14;
    if (newTopicIntent && lexicalOverlap === 0 && !openQuestionOwned) score -= 30;
  }

  const features = {
    direct,
    sameTopic,
    lexicalOverlap,
    speakerParticipant,
    targetParticipant,
    exactPair: pair.exactPair,
    addressedSpeaker: pair.addressedSpeaker,
    openQuestionOwned,
    continuationIntent,
    newTopicIntent,
    reaction,
    recencyMs: Math.max(0, Number(now || 0) - Number(scene?.lastAt || 0))
  };

  return {
    sceneId: scene.id,
    score,
    reason: reasonFor(features, direct),
    strongOwnership: Boolean(openQuestionOwned || pair.exactPair || (speakerParticipant && lexicalOverlap >= 2)),
    features
  };
}

export function selectSceneAssociation({ message, scenes = [], history = [], now = Date.now() } = {}) {
  if (!message) return { sceneId: "", reason: "no-message", score: 0, candidates: [] };
  if (message?._v37ForceNewScene) return { sceneId: "", reason: "forced-new-scene", score: 0, candidates: [] };

  const direct = clean(message?.target || "room") !== "room";
  const threshold = direct ? V41_DIRECT_ASSOCIATION_THRESHOLD : V41_ROOM_ASSOCIATION_THRESHOLD;
  const candidates = (scenes || [])
    .map((scene) => scoreSceneCandidate(scene, message, history, now))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(a.features?.recencyMs || 0) - Number(b.features?.recencyMs || 0));

  const top = candidates[0] || null;
  if (!top || top.score < threshold) {
    return {
      sceneId: "",
      reason: top ? "below-threshold" : "no-candidate",
      score: top?.score || 0,
      candidates: candidates.slice(0, 3)
    };
  }

  const second = candidates[1] || null;
  if (second && top.score - second.score <= V41_AMBIGUITY_MARGIN && !top.strongOwnership) {
    return {
      sceneId: "",
      reason: "ambiguous",
      score: top.score,
      candidates: candidates.slice(0, 3)
    };
  }

  return {
    sceneId: top.sceneId,
    reason: top.reason,
    score: top.score,
    candidates: candidates.slice(0, 3)
  };
}
