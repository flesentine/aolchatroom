import { eraWorldViolation } from "./era_world.js";
import { simulatedCutoff } from "./historical_knowledge_v27.js";

export const V38_TOPIC_WINDOW_MS = 4 * 60 * 1000;
export const V38_TOPIC_MAX_ROWS = 36;
export const V38_TOPIC_MIN_COUNT = 6;
export const V38_TOPIC_MIN_SHARE = 0.20;
export const V38_TOPIC_COOLDOWN_MS = 3 * 60 * 1000;

const GENERIC_TOPICS = new Set(["", "general", "greeting"]);
const GAMING_TEXT = /\b(?:playstation|ps1|ps2|ps3|ps4|ps5|n64|nintendo 64|saturn|dreamcast|gamecube|xbox|wii|switch|sega|sonic|ridge racer|console)\b/i;
const METAL_TEXT = /\b(?:metallica|hetfield|load\s+(?:album|tour|record|is|was|still|has)|reload)\b/i;
const XFILES_TEXT = /\bx-?files?\b/i;

function compact(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeTopic(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function canonicalRoomTopic(row = {}) {
  const raw = normalizeTopic(row?.topic);
  const text = String(row?.text || "");

  if (raw === "gaming" || raw === "games" || GAMING_TEXT.test(text)) return "gaming";
  if (raw === "metal" || METAL_TEXT.test(text)) return "metal";
  if (raw === "xfiles" || raw === "x-files" || XFILES_TEXT.test(text)) return "xfiles";
  if (!GENERIC_TOPICS.has(raw)) return raw;
  return "";
}

export function roomTopicFatigue(history = [], now = Date.now(), options = {}) {
  const windowMs = Number(options.windowMs || V38_TOPIC_WINDOW_MS);
  const maxRows = Number(options.maxRows || V38_TOPIC_MAX_ROWS);
  const minCount = Number(options.minCount || V38_TOPIC_MIN_COUNT);
  const minShare = Number(options.minShare || V38_TOPIC_MIN_SHARE);

  const recent = (history || [])
    .filter((row) => row?.kind === "bot" && Number(row?.at || 0) >= Number(now || 0) - windowMs)
    .slice(-maxRows);

  const buckets = new Map();
  for (const row of recent) {
    const topic = canonicalRoomTopic(row);
    if (!topic) continue;
    const bucket = buckets.get(topic) || { topic, count: 0, scenes: new Set(), lastAt: 0 };
    bucket.count += 1;
    bucket.lastAt = Math.max(bucket.lastAt, Number(row?.at || 0));
    const sceneKey = row?.sceneId || row?.threadId || `${topic}:${Math.floor(Number(row?.at || 0) / 30000)}`;
    if (sceneKey) bucket.scenes.add(sceneKey);
    buckets.set(topic, bucket);
  }

  const denominator = Math.max(1, recent.length);
  const topics = [...buckets.values()]
    .map((bucket) => ({
      topic: bucket.topic,
      count: bucket.count,
      share: bucket.count / denominator,
      sceneCount: bucket.scenes.size,
      lastAt: bucket.lastAt
    }))
    .filter((bucket) =>
      bucket.count >= minCount
      && bucket.share >= minShare
      && (bucket.sceneCount >= 2 || bucket.count >= 9)
    )
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);

  return {
    rowsConsidered: recent.length,
    windowMs,
    topics
  };
}

export function filterFatiguedBackgroundLines(lines = [], fatiguedTopics = []) {
  const blockedTopics = new Set((fatiguedTopics || []).map((row) => typeof row === "string" ? row : row?.topic).filter(Boolean));
  const kept = [];
  const blocked = [];

  for (const row of lines || []) {
    const topic = canonicalRoomTopic(row);
    if (topic && blockedTopics.has(topic)) blocked.push({ ...row, _v38FatiguedTopic: topic });
    else kept.push(row);
  }

  return { kept, blocked };
}

export function topicFatiguePromptNote(fatigue = { topics: [] }) {
  const topics = (fatigue?.topics || []).map((row) => row.topic).filter(Boolean);
  if (!topics.length) return "";
  return `V38 ROOM-WIDE TOPIC COOLDOWN: ${topics.join(", ")} have dominated the recent room. Do not discuss, reply into, revive, or tangent back to those subjects in this burst. Start something genuinely different from character life, ordinary 1996 chatter, or a quieter recent thread.`;
}

export function hardEraViolation(text, now = Date.now()) {
  const value = compact(text);
  if (!value) return null;
  const dateKey = simulatedCutoff(Number(now || Date.now())).dateKey;
  const code = eraWorldViolation(value, dateKey);
  if (!code || code === "empty") return null;
  return {
    kind: "future-era-technology",
    reason: `1996 era boundary blocked ${code}`,
    eraViolation: code,
    dateKey,
    text: value
  };
}

export function auditEraHistory(history = [], floor = 0) {
  const examples = [];
  let checkedBotLines = 0;

  for (const row of history || []) {
    if (row?.kind !== "bot" || Number(row?.at || 0) < Number(floor || 0)) continue;
    checkedBotLines += 1;
    const violation = hardEraViolation(row?.text || "", Number(row?.at || Date.now()));
    if (!violation) continue;
    examples.push({
      at: row.at,
      from: row.from,
      text: compact(row.text),
      claimType: "era-boundary",
      severity: "block",
      reason: violation.reason,
      eraViolation: violation.eraViolation,
      messageId: row.messageId || ""
    });
  }

  return {
    checkedBotLines,
    violations: examples.length,
    blockers: examples.length,
    examples: examples.slice(-8)
  };
}
