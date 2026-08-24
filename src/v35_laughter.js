const LOL_CUE = /\b(?:lol|lolol|lolz)\b/i;
const LOL_REPLACE = /\b(?:lol|lolol|lolz)\b/ig;
const META_LOL = /(?:\b(?:what does|what's|means?|stands? for|term|acronym|abbreviation|type|typed|typing)\b.{0,24}\blol\b|\blol\b.{0,24}\b(?:means?|stands? for|acronym|abbreviation)\b)/i;
const PERIOD_ALTERNATIVES = ["haha", "heh", ":)", "<g>", ""];

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hasLol(value) {
  return LOL_CUE.test(String(value || ""));
}

export function moderate1996Lol(text, options = {}) {
  const value = String(text || "");
  if (!hasLol(value) || META_LOL.test(value)) {
    return { text: value, softened: false, reason: "" };
  }

  const ownRecent = (options.ownRecent || []).map((row) => typeof row === "string" ? row : row?.text || "");
  const roomRecent = (options.roomRecent || []).map((row) => typeof row === "string" ? row : row?.text || "");
  const configuredLol = Boolean(options.configuredLol);
  const ownWindow = configuredLol ? 4 : 6;
  const ownTooSoon = ownRecent.slice(-ownWindow).some(hasLol);
  const roomLolCount = roomRecent.slice(-18).filter(hasLol).length;
  const roomSaturated = roomLolCount >= 3;

  if (!ownTooSoon && !roomSaturated) {
    return { text: value, softened: false, reason: "" };
  }

  const seed = `${options.speaker || "bot"}:${options.seed || roomRecent.length}:${value}`;
  const replacement = PERIOD_ALTERNATIVES[hashString(seed) % PERIOD_ALTERNATIVES.length];
  let out = value.replace(LOL_REPLACE, replacement);
  out = compact(out).replace(/\s+([,.!?])/g, "$1");

  return {
    text: out,
    softened: out !== value,
    reason: ownTooSoon ? "speaker-repeat" : "room-saturation",
    replacement
  };
}
