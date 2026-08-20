import { getCharacter } from "./characters.js";

const FOCUS_WINDOW_MS = 165000;
const LANE_WINDOW_MS = 105000;

const ROOM_ADDRESS = /\b(?:anyone|anybody|everyone|everybody|you guys|u guys|guys|room|ppl|people here|all of you|yall|y'all)\b/i;
const FOCUS_BREAK = /\b(?:brb|bbl|gtg|gotta go|gotta run|later|cya|bye|ttyl|goodnight|nite)\b/i;

const SUBJECTS = [
  ["friends-tv", /\b(?:friends episode|watch(?:ed|ing)? friends|ross|rachel|joey|chandler|monica|phoebe)\b/i],
  ["xfiles-tv", /\b(?:x[- ]?files|mulder|scully)\b/i],
  ["tv", /\b(?:tv|television|episode|seinfeld|daily show|mtv|taped it|tape it)\b/i],
  ["movies", /\b(?:movie|movies|theater|vhs|video store|rent(?:ed|ing)?|twister|independence day|tin cup|escape from l\.?a\.?|jack)\b/i],
  ["music", /\b(?:music|band|cd|cassette|album|song|radio|concert|metallica|nirvana|oasis|green day|no doubt|pumpkins|pearl jam|tori amos)\b/i],
  ["gaming", /\b(?:game|gaming|playstation|psx|saturn|n64|nintendo|quake|doom|arcade|tekken|mario)\b/i],
  ["computers", /\b(?:computer|pc|mac|windows|modem|netscape|html|geocities|bbs|download|aol|internet|web)\b/i],
  ["sports", /\b(?:sports?|baseball|football|basketball|nba|nfl|mlb|yankees|knicks|bulls|lakers|celtics|49ers|cowboys|jordan|rodman|pippen)\b/i],
  ["work", /\b(?:work|job|boss|manager|coworker|co-worker|shift|customer|office|store|closing shift|payday)\b/i],
  ["school", /\b(?:school|college|class|homework|campus|teacher|professor|quiz|studying|study)\b/i],
  ["dating", /\b(?:date|dating|single|boyfriend|girlfriend|crush|call him|call her|coffee\?|go out|asking out)\b/i],
  ["money-shopping", /\b(?:money|broke|rich|paycheck|paid|cost|bucks|dollars|mall|shopping|bought|buy|shoes|shirt|late fee)\b/i],
  ["food", /\b(?:food|hungry|pizza|tacos|fries|burger|coffee|soda|restaurant|dinner|lunch|breakfast)\b/i],
  ["cars-driving", /\b(?:car|truck|drive|driving|traffic|gas|freeway|highway|parking|license|wreck)\b/i],
  ["family-home", /\b(?:mom|dad|mother|father|parents?|brother|sister|roommate|house|apartment|neighbor|family)\b/i],
  ["weekend-social", /\b(?:weekend|tonight|party|plans|going out|hang out|hanging out|friday|saturday|sunday)\b/i],
  ["location-weather", /\b(?:where.*from|what part|city|weather|hot|cold|rain|snow|beach|lakewood|california|new york|texas|florida)\b/i]
];

const BROAD_TOPIC_POOL = [
  "work / a dumb customer / boss / coworker",
  "school / classes / homework / campus",
  "dating / crushes / calling somebody / being single",
  "friends / roommates / family / neighbors",
  "money / payday / mall / something somebody bought",
  "food / late-night snacks / restaurants",
  "cars / driving / traffic / gas / parking",
  "weekend plans / parties / boredom",
  "music / radio / CDs / bands",
  "sports",
  "movies or TV — but only occasionally, and not the same show repeatedly",
  "games / computers / modem / AOL",
  "local weather / where people are from",
  "some small weird thing that happened today"
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function recentRows(history = [], limit = 42) {
  return history.filter((row) => row && row.kind !== "system").slice(-limit);
}

export function messageAddressesRoom(text) {
  return ROOM_ADDRESS.test(String(text || ""));
}

export function messageBreaksFocus(text) {
  return FOCUS_BREAK.test(String(text || ""));
}

export function stickyTargetFromHistory(history = [], sender, activeBots = [], now = Date.now()) {
  if (!sender) return "";
  const active = new Set(activeBots || []);
  const rows = recentRows(history, 60);
  let latestExplicit = null;
  let latestReply = null;

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const age = now - Number(row.at || 0);
    if (age > FOCUS_WINDOW_MS) break;

    if (row.kind === "human" && row.from === sender) {
      if (messageAddressesRoom(row.text) || messageBreaksFocus(row.text)) break;
      if (row.target && row.target !== "room" && active.has(row.target)) {
        latestExplicit = row.target;
        break;
      }
    }

    if (!latestReply && row.kind === "bot" && row.target === sender && active.has(row.from)) {
      latestReply = row.from;
    }
  }

  return latestExplicit || latestReply || "";
}

export function pairTranscript(history = [], humanName, botName, limit = 10, now = Date.now()) {
  if (!humanName || !botName) return "";
  const rows = [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (!row || row.kind === "system") continue;
    if (now - Number(row.at || 0) > 5 * 60 * 1000) break;
    const pair = (row.from === humanName && row.target === botName) || (row.from === botName && row.target === humanName);
    if (!pair) continue;
    rows.push(`${row.from}: ${row.text}`);
    if (rows.length >= limit) break;
  }
  return rows.reverse().join("\n");
}

export function subjectForText(text, fallback = "general") {
  const value = String(text || "");
  for (const [subject, re] of SUBJECTS) if (re.test(value)) return subject;
  return fallback || "general";
}

export function recentSubjectCounts(history = [], limit = 36) {
  const counts = {};
  for (const row of recentRows(history, limit)) {
    const subject = subjectForText(row.text, row.topic || "general");
    counts[subject] = (counts[subject] || 0) + 1;
  }
  return counts;
}

function recentMentions(history, re, limit = 28) {
  return recentRows(history, limit).filter((row) => re.test(String(row.text || ""))).length;
}

export function topicFatigueAllowed(item, history = []) {
  const text = String(item?.text || "");
  const intent = String(item?.intent || "");
  const target = String(item?.target || "room");
  const continuing = target !== "room" || /reply|continue|follow|react|agree|disagree|thread|answer/.test(intent);
  if (continuing) return true;

  if (/\b(?:friends episode|watch(?:ed|ing)? friends|ross|rachel|joey|chandler|monica|phoebe)\b/i.test(text) && recentMentions(history, /\b(?:friends episode|watch(?:ed|ing)? friends|ross|rachel|joey|chandler|monica|phoebe)\b/i) >= 2) return false;
  if (/\b(?:x[- ]?files|mulder|scully)\b/i.test(text) && recentMentions(history, /\b(?:x[- ]?files|mulder|scully)\b/i) >= 2) return false;

  const subject = subjectForText(text, item?.topic || "general");
  const counts = recentSubjectCounts(history, 32);
  if (subject === "tv" && (counts.tv || 0) >= 4) return false;
  if (subject !== "general" && (counts[subject] || 0) >= 6) return false;
  return true;
}

export function diversityPrompt(history = []) {
  const counts = recentSubjectCounts(history, 36);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const saturated = [];
  if (recentMentions(history, /\b(?:friends episode|watch(?:ed|ing)? friends|ross|rachel|joey|chandler|monica|phoebe)\b/i) >= 2) saturated.push("Friends TV chatter");
  if (recentMentions(history, /\b(?:x[- ]?files|mulder|scully)\b/i) >= 2) saturated.push("X-Files chatter");
  for (const [subject, count] of ranked) if (count >= 6 && !saturated.includes(subject)) saturated.push(subject);

  return `TOPIC BALANCE:\nRecent mix: ${ranked.length ? ranked.map(([k, v]) => `${k}=${v}`).join(", ") : "room just started"}.\n${saturated.length ? `Saturated right now: ${saturated.join(", ")}. Do NOT start another new thread about these unless a human explicitly brings it up.` : "No major topic is saturated."}\nBroad ordinary-life pool to draw from when a NEW subject is genuinely needed: ${BROAD_TOPIC_POOL.join("; ")}.\nNamed TV shows are one small part of life, not the default conversation starter. Most new subjects should be ordinary daily life, music, work, school, dating, money, food, driving, friends/family, weekend plans, sports, games/computers, or local stuff.`;
}

export function primaryLane(threads = [], activeNames = [], humanNames = [], now = Date.now()) {
  const active = new Set(activeNames || []);
  const humans = new Set(humanNames || []);
  const candidates = (threads || []).filter((thread) => {
    if (!thread || now - Number(thread.lastAt || 0) > LANE_WINDOW_MS) return false;
    if (Number(thread.turns || 0) < 2) return false;
    const liveBots = (thread.participants || []).filter((name) => active.has(name));
    if (!liveBots.length) return false;
    // Human one-to-one lanes are handled separately; don't make background chatter hijack them.
    const hasHuman = (thread.participants || []).some((name) => humans.has(name));
    return !hasHuman;
  });

  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const ar = Math.max(0, 100 - Math.floor((now - a.lastAt) / 1000)) + Math.min(30, a.turns * 5);
    const br = Math.max(0, 100 - Math.floor((now - b.lastAt) / 1000)) + Math.min(30, b.turns * 5);
    return br - ar;
  })[0];
}

export function lanePrompt(lane) {
  if (!lane) return "No established room subject currently has enough momentum; start ONE ordinary-life subject, then let several people react before changing it.";
  return `Primary live lane: ${lane.id}, topic=${lane.topic}, participants=${(lane.participants || []).join(", ")}, turns=${lane.turns}, last=\"${lane.lastText || ""}\". Continue this subject for several locally coherent sends before allowing a new subject.`;
}

function genericLocationClaim(character, text) {
  if (!character) return true;
  const match = String(text || "").match(/\b(?:i live in|i'm from|im from|i am from)\s+([a-z][a-z .'-]{1,35})/i);
  if (!match) return true;
  const claimed = normalize(match[1].split(/\b(?:but|and|lol|haha|man|dude)\b/i)[0]);
  const actual = normalize(character.location || "");
  const actualCity = normalize(String(character.location || "").split(",")[0]);
  const stateCode = String(character.location || "").match(/,\s*([A-Z]{2})\b/)?.[1]?.toLowerCase() || "";
  if (!claimed) return true;
  if (actual.includes(claimed) || claimed.includes(actualCity)) return true;
  if (stateCode && new RegExp(`\\b${stateCode}\\b`, "i").test(match[1])) return true;
  return false;
}

export function continuityLineAllowed(item, history = []) {
  if (!genericLocationClaim(getCharacter(item?.speaker), item?.text)) return false;
  return topicFatigueAllowed(item, history);
}

export function safeContinuationText(recent) {
  const text = String(recent?.text || "");
  const subject = subjectForText(text, recent?.topic || "general");
  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  if (/\?$/.test(text.trim())) return pick(["i dunno", "maybe", "depends", "nah", "yeah probably"]);
  if (subject === "music") return pick(["which song", "what cd", "is it any good", "nah not my thing", "i heard that too"]);
  if (subject === "movies" || subject === "tv" || subject === "friends-tv" || subject === "xfiles-tv") return pick(["was it any good", "i missed that", "worth seeing?", "lol really", "what happened"]);
  if (subject === "gaming") return pick(["what system", "is it any good", "rent it first lol", "i wanna try that", "nah"]);
  if (subject === "computers") return pick(["did it crash", "how long did that take", "what modem", "lol figures", "mine does that too"]);
  if (subject === "sports") return pick(["no way", "who u got", "nah they suck", "maybe", "lol"]);
  if (subject === "work") return pick(["what happened", "that sucks", "quit lol", "same here", "your boss sounds nuts"]);
  if (subject === "school") return pick(["what class", "ugh", "i should be studying too", "when do u start", "that sucks"]);
  if (subject === "dating") return pick(["call them", "dont call lol", "how long", "no way", "do it"]);
  if (subject === "money-shopping") return pick(["how much", "thats too much", "im broke", "lol why", "worth it?"]);
  if (subject === "food") return pick(["now im hungry", "whatd u get", "sounds good", "gross lol", "save me some"]);
  if (subject === "cars-driving") return pick(["what happened", "traffic sucks", "how bad", "ugh", "same here"]);
  if (subject === "family-home") return pick(["lol what", "what happened", "that would drive me nuts", "same here", "no way"]);
  if (subject === "weekend-social") return pick(["where u going", "sounds good", "i got no plans", "who with", "nice"]);
  if (subject === "location-weather") return pick(["what part", "how hot", "ugh", "same here", "nice"]);
  return pick(["lol", "what", "no way", "how come", "seriously?"]);
}
