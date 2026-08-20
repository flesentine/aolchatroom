import { getCharacter } from "./characters.js";
import { calendarContext } from "./calendar.js";

const MODERN_CHAT_SLANG = /\b(lowkey|highkey|no cap|fr fr|deadass|rizz|yeet|sus|based|goated|slay|stan|simp|ghosted|ghosting|slide into|dm me|dms|vibing|vibes? check|cringe(?:y)?|fire emoji|ratioed|ratio|touch grass)\b/i;
const SIMPLE_GREETING = /^\s*(hi|hey|hello|yo|sup|hiya|hey ppl|hi ppl|anyone here|anybody here)[!?. ]*$/i;
const ROOM_QUESTION = /\?|\b(anyone|anybody|who|what|when|where|why|how|does|do|did|is|are|can|could|would|should)\b/i;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function normalize1996Text(input) {
  return String(input || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\bdm me\b/gi, "im me")
    .replace(/\bDM\b/g, "IM")
    .replace(/\btext me\b/gi, "im me")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function eraLanguageAllowed(input) {
  return !MODERN_CHAT_SLANG.test(String(input || ""));
}

export function splitAolSend(input, maxChars = 108) {
  const text = normalize1996Text(input);
  if (!text || text.length <= maxChars) return text ? [text] : [];

  const chunks = [];
  let rest = text;
  while (rest.length > maxChars && chunks.length < 2) {
    let cut = Math.max(
      rest.lastIndexOf(". ", maxChars),
      rest.lastIndexOf("? ", maxChars),
      rest.lastIndexOf("! ", maxChars),
      rest.lastIndexOf(", ", maxChars),
      rest.lastIndexOf(" ", maxChars)
    );
    if (cut < 42) cut = maxChars;
    const chunk = rest.slice(0, cut + (/[.!?,]$/.test(rest.slice(0, cut + 1)) ? 1 : 0)).trim();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(cut + 1).trim();
  }
  if (rest && chunks.length < 3) chunks.push(rest.slice(0, maxChars).trim());
  return chunks.filter(Boolean);
}

export function activityRole(name, now = Date.now()) {
  const character = getCharacter(name);
  const sociability = Number(character?.personality?.sociability || 0.5);
  const block = Math.floor(now / (22 * 60 * 1000));
  const noise = (hashString(`${name}:${block}`) % 1000) / 1000;
  const score = sociability * 0.66 + noise * 0.34;
  if (score < 0.38) return "lurker";
  if (score < 0.62) return "occasional";
  return "talker";
}

export function chooseAuthenticParticipants(characters = [], recentNames = [], max = 7, now = Date.now()) {
  const recent = new Set((recentNames || []).slice(-6));
  return [...characters]
    .map((character) => {
      const role = activityRole(character.name, now);
      let weight = Number(character?.personality?.sociability || 0.5) * 40 + Math.random() * 24;
      if (role === "talker") weight += 32;
      if (role === "occasional") weight += 10;
      if (role === "lurker") weight -= 24;
      if (recent.has(character.name)) weight += 22;
      return { character, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
    .map((row) => row.character);
}

function recentConversationWithHuman(history = [], humanName, now = Date.now()) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (!row || now - Number(row.at || 0) > 30000) break;
    if (row.kind === "bot" && row.target === humanName) return true;
    if (row.kind === "human" && row.from === humanName && i < history.length - 1) {
      const after = history.slice(i + 1);
      if (after.some((m) => m.kind === "bot" && m.target === humanName)) return true;
    }
  }
  return false;
}

export function humanEngagementDecision(human, options = {}) {
  const text = String(human?.text || "");
  const direct = Boolean(human?.target && human.target !== "room");
  const question = ROOM_QUESTION.test(text);
  const greeting = SIMPLE_GREETING.test(text);
  const queueLength = Number(options.queueLength || 0);
  const occupancy = Number(options.occupancy || 20);
  const recent = recentConversationWithHuman(options.history || [], human?.from, options.now || Date.now());

  let chance = direct ? 0.96 : recent ? 0.89 : question ? 0.70 : greeting ? 0.28 : 0.43;
  if (!direct && queueLength >= 4) chance -= 0.18;
  else if (!direct && queueLength >= 2) chance -= 0.08;
  if (occupancy >= 21) chance += 0.04;
  if (text.length > 120 && !direct) chance -= 0.08;
  if (/\b(asl|a\/s\/l)\b/i.test(text)) chance += 0.08;
  chance = clamp(chance, 0.16, 0.98);

  return { respond: Math.random() < chance, chance };
}

export function roomRealityPrompt(now = Date.now()) {
  const c = calendarContext(now, "PT");
  const afterFlatRate = c.month > 12 || (c.month === 12 && c.day >= 1);
  const buddyAvailable = c.month > 6 || (c.month === 6 && c.day >= 13);
  const billing = afterFlatRate
    ? "AOL's new $19.95 unlimited plan exists now. Busy signals, overloaded access numbers, lag, and getting kicked off are becoming common complaints."
    : "AOL is still metered for many members: a common plan is $9.95 for five hours, then about $2.95 per extra hour. Heavy chatters may worry about using up hours or their parents seeing the bill.";
  const buddy = buddyAvailable
    ? "AOL 3.0 has a Buddy List. Some regulars notice when friends sign on and may follow them into chat or IM them. AIM as a separate Internet product does NOT exist yet."
    : "Do not mention Buddy List or AIM yet.";

  return `1996 AOL PUBLIC-ROOM REALITY:\n- Hard room capacity is 23 people. A full public room normally spills newcomers into numbered/similar rooms.\n- A general room is NOT one coherent conversation. Several exchanges overlap; some people lurk; greetings and questions can scroll past unanswered.\n- AOL chat entry allowed only about two display lines at a time, so people type short fragments, corrections, and follow-ups instead of polished paragraphs.\n- Public chat is a party/party-line, not a help desk. Nobody treats the newest human as the center of the room.\n- People address screen names, say hi/wb/brb/bbl/ttyl, ask asl sometimes, tease regulars, miss context, and sometimes say 'who r u talking to?'\n- People often move a one-to-one exchange to Instant Message: 'im me', 'check ur im', 'go private?' Public chat and IM are different things.\n- Regulars know one another, have inside jokes, remember old arguments, and sometimes greet each other on arrival. Strangers get much less attention.\n- Many occupants are silent for minutes. A lurker can suddenly post one line and disappear again.\n- Messages cross in flight. Someone may answer an earlier line after two unrelated lines have appeared. Questions are not guaranteed answers.\n- Use only ASCII-era punctuation/emoticons like :) :( ;) :P <g>. No emoji. Avoid modern social-media slang.\n- Do not keep announcing that it is 1996; everybody simply lives there.\n- ${billing}\n- ${buddy}`;
}

export function authenticRoomTarget() {
  return 18 + Math.floor(Math.random() * 6); // 18-23, never above AOL's real room cap.
}

export function nextAbruptDropAt(now = Date.now()) {
  return now + Math.round(randomBetween(150000, 330000));
}

export function shouldAbruptDrop(activeCount = 0) {
  return activeCount >= 10 && Math.random() < 0.72;
}

export function simpleEntryLine(entrant, familiar = false) {
  if (familiar) return [
    `hey ${entrant}`,
    `wb ${entrant}`,
    `sup ${entrant}`,
    `there u are ${entrant}`,
    `hey hey ${entrant}`
  ][Math.floor(Math.random() * 5)];
  return Math.random() < 0.28 ? "asl?" : `hey ${entrant}`;
}

export function simpleLeaveLine(name) {
  return [
    `later ${name}`,
    `cya ${name}`,
    `bye ${name}`,
    `later` 
  ][Math.floor(Math.random() * 4)];
}
