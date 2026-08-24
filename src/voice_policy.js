const LOL_CUE = /\b(?:lol|lolol|lolz)\b/i;
const LOL_REPLACE = /\b(?:lol|lolol|lolz)\b/ig;
const META_LOL = /(?:\b(?:what does|what's|means?|stands? for|term|acronym|abbreviation|type|typed|typing)\b.{0,24}\blol\b|\blol\b.{0,24}\b(?:means?|stands? for|acronym|abbreviation)\b)/i;
const PERIOD_ALTERNATIVES = ["haha", "heh", ":)", "<g>", ""];
const REPEATABLE_HABITS = [
  { key: "btw", re: /(?:^|\s)btw(?:\s|$)/i, strip: /\s*\bbtw\b\s*/ig },
  { key: "omg", re: /^\s*omg\b/i, strip: /^\s*omg\b[ ,.!-]*/i },
  { key: "seriously", re: /^\s*seriously\b/i, strip: /^\s*seriously\b[ ,.!-]*/i },
  { key: "whatever", re: /^\s*whatever\b/i, strip: /^\s*whatever\b[ ,.!-]*/i },
  { key: "ugh", re: /^\s*ugh\b/i, strip: /^\s*ugh\b[ ,.!-]*/i },
  { key: "dude", re: /\bdude\b/i, strip: /\s*\bdude\b\s*/i }
];

function compact(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function hasLol(value) { return LOL_CUE.test(String(value || "")); }

export function moderateVoiceHabits(text, options = {}) {
  const original = String(text || "");
  let value = original;
  const ownRecent = (options.ownRecent || []).map((row) => typeof row === "string" ? row : row?.text || "");
  const roomRecent = (options.roomRecent || []).map((row) => typeof row === "string" ? row : row?.text || "");
  const configured = new Set((options.configuredHabits || []).map((v) => String(v).toLowerCase()));
  const changes = [];

  if (hasLol(value) && !META_LOL.test(value)) {
    const ownWindow = configured.has("lol") || configured.has("lolol") || configured.has("lolz") ? 4 : 6;
    const ownTooSoon = ownRecent.slice(-ownWindow).some(hasLol);
    const roomSaturated = roomRecent.slice(-18).filter(hasLol).length >= 3;
    if (ownTooSoon || roomSaturated) {
      const seed = `${options.speaker || "bot"}:${options.seed || roomRecent.length}:${value}`;
      const replacement = PERIOD_ALTERNATIVES[hashString(seed) % PERIOD_ALTERNATIVES.length];
      value = compact(value.replace(LOL_REPLACE, replacement)).replace(/\s+([,.!?])/g, "$1");
      changes.push({ key: "lol", reason: ownTooSoon ? "speaker-repeat" : "room-saturation", replacement });
    }
  }

  for (const habit of REPEATABLE_HABITS) {
    if (!habit.re.test(value)) continue;
    const recentlyUsed = ownRecent.slice(-2).some((prior) => habit.re.test(prior));
    if (!recentlyUsed) continue;
    const adjusted = compact(value.replace(habit.strip, " "));
    if (adjusted.length < 2) continue;
    value = adjusted;
    changes.push({ key: habit.key, reason: "speaker-repeat", replacement: "" });
  }

  return { text: value, changed: value !== original, changes };
}

export function voicePolicyPrompt(recentRows = []) {
  const lolCount = (recentRows || []).filter((row) => hasLol(row?.text || row || "")).length;
  return [
    "1996 CHARACTER VOICE POLICY:",
    "- Slang, emoticons, typos, and catchphrases are fingerprints, not mandatory punctuation.",
    "- Do not repeat a signature filler in consecutive sends. Plain lines are normal.",
    "- lol/LOL is authentic, but use it as actual laughter rather than a generic sentence ending; alternatives like haha, heh, :), and <g> are also period-appropriate.",
    `- Recent room lol usage: ${lolCount}/${recentRows.length || 0} bot lines.`
  ].join("\n");
}
