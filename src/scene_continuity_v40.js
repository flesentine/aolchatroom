import { subjectForText } from "./continuity.js";

export const V40_MOMENTUM_WINDOW_MS = 85 * 1000;
export const V40_RECENT_HUMAN_SCENE_MS = 90 * 1000;
export const V40_TARGET_SCENE_TURNS = 4;
export const V40_MAX_SCENE_TURNS = 7;

const EXIT_OR_PIVOT = /\b(?:brb|bbl|gtg|gotta go|gotta run|later|cya|bye|ttyl|goodnight|nite|new topic|different topic|change the subject|talk about something else|something else|enough about|lets talk about|let's talk about|moving on)\b/i;
const REPLY_INTENT = /\b(?:reply|thread|continue|follow|react|agree|disagree|answer|clarif|question|tease|joke)\b/i;

function compact(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sceneIdOf(row = {}) {
  return String(row.sceneId || row._continuitySceneId || row.scenePlanId || row.threadId || "");
}

function topicOf(row = {}) {
  const explicit = String(row.topic || "").trim().toLowerCase();
  if (explicit && explicit !== "general" && explicit !== "greeting") return explicit;
  return String(subjectForText(row.text || "", "general") || "general").toLowerCase();
}

function conversational(row) {
  return row?.kind === "bot" || row?.kind === "human" || Boolean(row?.speaker && row?.text);
}

function participantNames(rows = [], limit = Infinity) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    for (const name of [row?.from || row?.speaker, row?.target]) {
      const value = String(name || "").trim();
      if (!value || value === "room" || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
  }
  return Number.isFinite(limit) ? out.slice(0, Math.max(0, limit)) : out;
}

function participantsFor(rows = []) {
  return participantNames(rows, 8);
}

function dominantTopic(rows = []) {
  const counts = new Map();
  let latest = "general";
  for (const row of rows) {
    const topic = topicOf(row);
    if (!topic || topic === "general" || topic === "greeting") continue;
    latest = topic;
    counts.set(topic, Number(counts.get(topic) || 0) + 1);
  }
  if (!counts.size) return latest;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function recentHumanNames(history = [], now = Date.now(), activeHumanNames = []) {
  const names = new Set(
    (activeHumanNames || [])
      .map((name) => String(name || "").trim())
      .filter(Boolean)
  );

  for (const row of history || []) {
    if (row?.kind !== "human") continue;
    const at = Number(row.at || 0);
    if (!at || Number(now || 0) - at > V40_RECENT_HUMAN_SCENE_MS) continue;
    const name = String(row.from || "").trim();
    if (name) names.add(name);
  }
  return names;
}

export function sceneHasHumanParticipant(history = [], sceneRows = [], now = Date.now(), activeHumanNames = []) {
  const humans = recentHumanNames(history, now, activeHumanNames);
  if (!humans.size) return false;
  return participantNames(sceneRows).some((name) => humans.has(name));
}

function momentumCandidate(history = [], now = Date.now()) {
  const rows = (history || []).filter(conversational);
  if (!rows.length) return null;

  const latest = rows[rows.length - 1];
  const sceneId = sceneIdOf(latest);
  if (!sceneId) return null;
  const ageMs = Math.max(0, Number(now || 0) - Number(latest.at || 0));
  if (ageMs > V40_MOMENTUM_WINDOW_MS) return null;
  if (latest.kind === "human" && EXIT_OR_PIVOT.test(String(latest.text || ""))) return null;

  const recentSceneRows = rows.filter((row) =>
    sceneIdOf(row) === sceneId
    && Number(now || 0) - Number(row.at || 0) <= V40_MOMENTUM_WINDOW_MS
  );
  if (!recentSceneRows.length) return null;

  const turns = rows.filter((row) => sceneIdOf(row) === sceneId).length;
  if (turns >= V40_MAX_SCENE_TURNS) return null;

  const participants = participantsFor(recentSceneRows);
  if (participants.length < 2) return null;

  const topic = dominantTopic(recentSceneRows);
  const phase = turns < V40_TARGET_SCENE_TURNS ? "building" : turns <= 5 ? "live" : "aging";
  return {
    rows,
    recentSceneRows,
    momentum: {
      sceneId,
      topic,
      turns,
      ageMs,
      phase,
      participants,
      lastFrom: String(latest.from || latest.speaker || ""),
      lastTarget: String(latest.target || "room"),
      lastText: compact(latest.text, 180)
    }
  };
}

// Phase 1A needs the same momentum shape before human-ownership filtering so the
// SceneCoordinator can become the single authority for ownership decisions. The
// legacy inferSceneMomentum export below retains its exact v40 behavior.
export function inferSceneMomentumCandidate(history = [], now = Date.now()) {
  return momentumCandidate(history, now)?.momentum || null;
}

export function inferSceneMomentum(history = [], now = Date.now(), activeHumanNames = []) {
  const candidate = momentumCandidate(history, now);
  if (!candidate) return null;
  const { rows, recentSceneRows, momentum } = candidate;

  // Direct human scenes already have a dedicated carry/replan mechanism. Ambient
  // generation should not pile onto a human conversation just to improve cohesion.
  // Keep the exact-scene check, then also reject by participant identity because a
  // bot reply can legitimately receive a fresh sceneId while still targeting a human.
  const recentHuman = recentSceneRows.find((row) =>
    row.kind === "human"
    && Number(now || 0) - Number(row.at || 0) <= V40_RECENT_HUMAN_SCENE_MS
  );
  if (recentHuman) return null;
  if (sceneHasHumanParticipant(rows, recentSceneRows, now, activeHumanNames)) return null;
  return momentum;
}

export function sceneMomentumPrompt(momentum) {
  if (!momentum?.sceneId) return "";
  const people = (momentum.participants || []).join(", ") || "the people already talking";
  const topic = momentum.topic && momentum.topic !== "general" ? momentum.topic : "the current subject";

  if (momentum.phase === "building") {
    return `V40 SCENE MOMENTUM LOCK: scene ${momentum.sceneId} is only ${momentum.turns} sends old and is still forming around ${topic}. Do not abandon it for a fresh room topic. Make at least the first 2-3 sends continue, answer, tease, question, or naturally develop what ${people} are already discussing. One small side comment is fine, but do not replace the main exchange.`;
  }
  if (momentum.phase === "aging") {
    return `V40 SCENE MOMENTUM LOCK: scene ${momentum.sceneId} has ${momentum.turns} sends on ${topic}. Give it at most one or two genuinely new continuation beats if they add something; then it may resolve or tangent naturally. Do not restart the same point and do not jump to an unrelated topic merely for variety.`;
  }
  return `V40 SCENE MOMENTUM LOCK: scene ${momentum.sceneId} is a live ${topic} exchange among ${people}. Keep the majority of this burst in that exchange while it still has a fresh angle. At most one small side exchange may start. Do not create multiple unrelated room-topic starters.`;
}

function isClearNewTopicStarter(line, momentum) {
  const lineTopic = topicOf(line);
  const differentTopic = momentum?.topic && momentum.topic !== "general"
    && lineTopic !== "general"
    && lineTopic !== momentum.topic;
  const target = String(line?.target || "room");
  const intent = String(line?.intent || "").toLowerCase();
  return Boolean(differentTopic && target === "room" && !REPLY_INTENT.test(intent));
}

export function continuationScore(line, momentum) {
  if (!line || !momentum?.sceneId) return -999;
  if (isClearNewTopicStarter(line, momentum)) return -6;

  const people = new Set(momentum.participants || []);
  const speaker = String(line.speaker || line.from || "");
  const target = String(line.target || "room");
  const intent = String(line.intent || "").toLowerCase();
  const lineTopic = topicOf(line);
  let score = 0;

  if (momentum.topic && momentum.topic !== "general" && lineTopic === momentum.topic) score += 5;
  if (people.has(speaker)) score += 2;
  if (people.has(target)) score += 2;
  if (target !== "room") score += 1;
  if (REPLY_INTENT.test(intent)) score += 2;
  if (target === momentum.lastFrom) score += 1;
  return score;
}

export function selectSceneCarryIndices(lines = [], momentum = null) {
  if (!momentum?.sceneId || !Array.isArray(lines) || !lines.length) return [];
  const remaining = Math.max(0, V40_MAX_SCENE_TURNS - Number(momentum.turns || 0));
  if (!remaining) return [];

  const ranked = lines.map((line, index) => ({
    index,
    score: continuationScore(line, momentum),
    clearNewTopic: isClearNewTopicStarter(line, momentum)
  }));

  const selected = ranked
    .filter((row) => !row.clearNewTopic && row.score >= 3)
    .sort((a, b) => a.index - b.index)
    .slice(0, remaining);

  const minimum = momentum.phase === "building" ? Math.min(2, remaining, lines.length) : 1;
  if (selected.length < minimum) {
    const used = new Set(selected.map((row) => row.index));
    const fallbacks = ranked
      .filter((row) => !row.clearNewTopic && !used.has(row.index) && row.score >= 1)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    while (selected.length < minimum && fallbacks.length && selected.length < remaining) {
      selected.push(fallbacks.shift());
    }
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .slice(0, remaining)
    .map((row) => row.index);
}
