import { getCharacter } from "./characters.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function isQuestion(text) {
  return /\?|\b(who|what|when|where|why|how|anyone|anybody|does|do|did|is|are|can|could|would|should)\b/i.test(String(text || ""));
}

export function botWordsPerMinute(name) {
  const character = getCharacter(name);
  const typoRate = Number(character?.typing?.typoRate || 0.05);
  const seed = hashString(name || "bot");
  const baseline = 52 + (seed % 31); // 52-82 wpm, believable keyboard spread.
  const fastMessyBonus = typoRate >= 0.10 ? 10 : typoRate >= 0.07 ? 5 : 0;
  const carefulPenalty = typoRate <= 0.03 ? 5 : 0;
  return clamp(baseline + fastMessyBonus - carefulPenalty, 42, 98);
}

export function firstHumanReplyDelay(human, options = {}) {
  const target = human?.target || "room";
  const direct = target !== "room";
  const question = isQuestion(human?.text);
  const words = wordCount(human?.text);
  const occupancy = Number(options.occupancy || 20);

  // Notice/read/think time. Directly addressing somebody gets noticed sooner;
  // a random room comment can hang there for a while before anybody bites.
  let delay = direct
    ? randomBetween(2200, 4800)
    : question
      ? randomBetween(3200, 6800)
      : randomBetween(4200, 9000);

  delay += clamp(words * randomBetween(45, 95), 0, 1800);

  // In a crowded room there is a better chance someone is already watching.
  if (occupancy >= 20) delay *= randomBetween(0.82, 0.98);

  // Sometimes somebody simply notices the line late.
  if (Math.random() < 0.14) delay += randomBetween(2200, 6200);

  return Math.round(clamp(delay, 2400, 14500));
}

function typingMsFor(item) {
  const words = Math.max(1, wordCount(item?.text));
  const wpm = botWordsPerMinute(item?.speaker);
  return (words / wpm) * 60000;
}

export function queuedMessageDelay(next, previous = null, options = {}) {
  if (!next) return ambientRoomDelay(options);

  const words = wordCount(next.text);
  const sameSpeaker = Boolean(previous?.from && previous.from === next.speaker);
  const sameScene = Boolean(previous?.sceneId && next.sceneId && previous.sceneId === next.sceneId);
  const directed = next.target && next.target !== "room";
  const intent = String(next.intent || "");

  let typing = typingMsFor(next) * randomBetween(0.72, 1.02);
  let reaction = directed || /reply|direct|follow|pile|scene|thread/.test(intent)
    ? randomBetween(650, 1900)
    : randomBetween(1400, 3600);

  // Different people may already have been typing while the previous line appeared.
  if (!sameSpeaker && (sameScene || /reply|scene|thread/.test(intent)) && Math.random() < 0.28) {
    typing *= randomBetween(0.40, 0.68);
    reaction *= randomBetween(0.55, 0.85);
  }

  // Very short reactions can genuinely arrive almost on top of another message.
  if (!sameSpeaker && words <= 3 && Math.random() < 0.22) {
    return Math.round(randomBetween(850, 2200));
  }

  if (sameSpeaker) reaction += randomBetween(500, 1700);

  const occupancy = Number(options.occupancy || 20);
  const crowdFactor = occupancy >= 22 ? 0.90 : occupancy <= 10 ? 1.18 : 1;
  const delay = (typing + reaction) * crowdFactor;
  return Math.round(clamp(delay, 1100, 11800));
}

export function ambientRoomDelay(options = {}) {
  const occupancy = Number(options.occupancy || 20);
  const mood = String(options.mood || "chatty");
  let min = 4300;
  let max = 11800;

  if (occupancy >= 22) { min = 3000; max = 8500; }
  if (occupancy <= 12) { min = 6500; max = 16000; }
  if (mood === "late-night") { min *= 1.25; max *= 1.35; }
  if (mood === "scattered" || mood === "chatty") { min *= 0.85; max *= 0.92; }
  if (mood === "argumentative") { min *= 0.78; max *= 0.90; }

  return Math.round(randomBetween(min, max));
}

export function quietRetryDelay() {
  return Math.round(randomBetween(2600, 6200));
}

export function coalescePendingHumans(queue = []) {
  if (!Array.isArray(queue) || queue.length < 2) return queue;
  const first = queue[0];
  const merged = [first];
  let lastAt = Number(first?.at || 0);

  for (let i = 1; i < Math.min(queue.length, 4); i += 1) {
    const next = queue[i];
    const closeInTime = Number(next?.at || 0) - lastAt <= 6000;
    const sameHuman = next?.from === first?.from;
    const compatibleTarget = (next?.target || "room") === (first?.target || "room");
    if (!closeInTime || !sameHuman || !compatibleTarget) break;
    merged.push(next);
    lastAt = Number(next?.at || lastAt);
  }

  if (merged.length === 1) return queue;
  const combined = {
    ...merged[merged.length - 1],
    from: first.from,
    target: first.target,
    at: first.at,
    text: merged.map((row) => row.text).join(" / ").slice(0, 320)
  };
  return [combined, ...queue.slice(merged.length)];
}
