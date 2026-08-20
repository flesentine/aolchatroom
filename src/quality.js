import { getCharacter } from "./characters.js";
import { inferConversationTopic } from "./social.js";

const STATE_NAMES = {
  CA: "california", OR: "oregon", WA: "washington", AZ: "arizona", NM: "new mexico",
  TX: "texas", ID: "idaho", CO: "colorado", MN: "minnesota", IL: "illinois",
  OH: "ohio", NJ: "new jersey", NY: "new york", MA: "massachusetts", FL: "florida", UT: "utah"
};

const CITY_RULES = [
  ["los angeles", /\b(?:los angeles|l\.a\.)\b/i],
  ["san diego", /\bsan diego\b/i],
  ["orange county", /\borange county\b/i],
  ["riverside", /\briverside\b/i],
  ["sacramento", /\bsacramento\b/i],
  ["portland", /\bportland\b/i],
  ["seattle", /\bseattle\b/i],
  ["phoenix", /\bphoenix\b/i],
  ["albuquerque", /\balbuquerque\b/i],
  ["austin", /\baustin\b/i],
  ["boise", /\bboise\b/i],
  ["denver", /\bdenver\b/i],
  ["chicago", /\bchicago\b/i],
  ["cleveland", /\bcleveland\b/i],
  ["columbus", /\bcolumbus\b/i],
  ["newark", /\bnewark\b/i],
  ["queens", /\bqueens\b/i],
  ["boston", /\bboston\b/i],
  ["tampa", /\btampa\b/i],
  ["miami", /\bmiami\b/i]
];

const CANONICAL_TOPICS = new Set([
  "general", "greeting", "asl", "location", "work", "school", "food", "weekend",
  "pumpkins", "metal", "oasis", "friends", "xfiles", "movies", "gaming", "web",
  "computers", "sports", "music", "moderation"
]);

const RAW_TOPIC_MAP = {
  concert: "music", concerts: "music", tv: "movies", tech: "computers", technology: "computers",
  game: "gaming", games: "gaming", n64: "gaming", psx: "gaming", saturn: "gaming",
  pcgames: "gaming", localbusiness: "general", mall: "general", money: "general", animal: "general",
  dog: "general", dating: "general", relationship: "general"
};

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function locationParts(character) {
  const location = String(character?.location || "").toLowerCase();
  const stateMatch = String(character?.location || "").match(/,\s*([A-Z]{2})\b/);
  const stateCode = stateMatch?.[1] || "";
  return { location, stateCode, stateName: STATE_NAMES[stateCode] || "" };
}

export function canonicalConversationTopic(text, rawTopic = "") {
  const inferred = inferConversationTopic(text);
  if (inferred && inferred !== "general") return inferred;
  const raw = String(rawTopic || "").toLowerCase().trim();
  const mapped = RAW_TOPIC_MAP[raw] || raw;
  return CANONICAL_TOPICS.has(mapped) ? mapped : "general";
}

export function personaClaimAllowed(speaker, text) {
  const character = getCharacter(speaker);
  if (!character) return true;
  const value = String(text || "");
  const explicitLocationClaim = /\b(?:i live in|i'm in|im in|i am in|i'm from|im from|i am from|here in)\b/i.test(value);
  if (!explicitLocationClaim) return true;

  const loc = locationParts(character);
  for (const [city, re] of CITY_RULES) {
    if (re.test(value) && !loc.location.includes(city)) return false;
  }

  for (const [code, stateName] of Object.entries(STATE_NAMES)) {
    const stateRe = new RegExp(`\\b${stateName.replace(/ /g, "\\s+")}\\b`, "i");
    if (stateRe.test(value) && loc.stateCode !== code) return false;
  }
  return true;
}

function tvFeedHas(context, showPattern) {
  return (context?.tv || []).some((row) => showPattern.test(String(row?.show || "")));
}

function mirrorMonth(context) {
  const match = String(context?.dateKey || "").match(/^1996-(\d{2})-/);
  return match ? Number(match[1]) : 0;
}

export function cultureSemanticsAllowed(text, context) {
  const value = String(text || "");
  const dateKey = String(context?.dateKey || "1996-01-01");
  const month = mirrorMonth(context);

  if (dateKey < "1996-09-29" && /\b(n64|nintendo 64|mario 64|wave race)\b/i.test(value)) {
    if (/\b(i|we|you|u|anyone|anybody|guys)\b.{0,35}\b(got|get|have|has|bought|buy|own|playing|played|find|found|controller|cartridge)\b|\b(got|get|have|bought|buy|own|playing|played|find|found)\b.{0,35}\b(n64|nintendo 64|mario 64|wave race)\b/i.test(value)) return false;
  }

  if (dateKey > "1996-08-11" && /\bknebworth\b/i.test(value)) {
    if (/\b(on saturday|this saturday|this weekend|going|gonna|go to|ticket for|tickets? for|was there|i was at|been to|after ?party|play there|playing there)\b/i.test(value)) return false;
  }

  if (/\bescape from l\.?a\.?\b/i.test(value) && /\b(concert|band|after ?party|mosh|skateboarder|guitar set)\b/i.test(value)) return false;

  if (/\bread about\b.{0,45}\bepisode\b|\bread about the (new|latest)\b/i.test(value)) return false;

  const xfilesRecent = tvFeedHas(context, /x[- ]?files/i);
  if (!xfilesRecent && /\bx[- ]?files\b/i.test(value) && /\b(new episode|latest episode|on tonight|last night|last episode|this week's episode|this weeks episode)\b/i.test(value)) return false;

  const friendsRecent = tvFeedHas(context, /^friends$/i);
  if (!friendsRecent && /\bfriends\b/i.test(value) && /\b(new episode|on tonight|last night|this week's|this weeks)\b/i.test(value)) return false;

  const seinfeldRecent = tvFeedHas(context, /seinfeld/i);
  if (!seinfeldRecent && /\bseinfeld\b/i.test(value) && /\b(new episode|on tonight|last night|this week's|this weeks)\b/i.test(value)) return false;

  if (month >= 7 && month <= 9 && /\b(bulls|knicks|celtics|lakers|nba)\b/i.test(value) && /\b(today|tonight|right now)\b/i.test(value) && /\b(game|playing|winning|losing|up by|down by|beat|beating)\b/i.test(value)) return false;

  if (/\b(just reissued|new .* remix|just dropped .* remix|just released .* remix|they drop stuff on the waves|on the waves|vibes? (?:are|is|were) legit)\b/i.test(value)) return false;
  return true;
}

export function conversationalQualityAllowed(item, options = {}) {
  const text = String(item?.text || "");
  if (!text) return false;
  if (!personaClaimAllowed(item?.speaker, text)) return false;
  if (!cultureSemanticsAllowed(text, options.culture)) return false;

  if (/\b(i hope nobody got hurt|stay safe|be careful out there|that sounds frustrating|that sounds tough|thanks for sharing|i can imagine)\b/i.test(text)) return false;
  if (/\blos angeles\b.*\bbeach town\b/i.test(text)) return false;

  const humans = (options.humanNames || []).map((name) => String(name).toLowerCase());
  if (humans.includes("dog")) {
    const recentDogTalk = (options.history || []).slice(-8).some((row) => row?.kind === "human" && String(row?.from || "").toLowerCase() === "dog" && /\b(dog|puppy|breed|pet)\b/i.test(String(row?.text || "")));
    if (!recentDogTalk && /\b(what kind of dog|what breed|golden retriever|is it a dog|puppy)\b/i.test(text)) return false;
  }
  return true;
}

function chooseByLocation(characters, requested) {
  const wanted = requested.toLowerCase();
  const direct = characters.filter((character) => String(character.location || "").toLowerCase().includes(wanted));
  if (direct.length) return randomOf(direct);

  if (wanted === "los angeles") {
    const nearby = characters.filter((character) => /Orange County|Riverside|San Diego/i.test(character.location || ""));
    return nearby.length ? randomOf(nearby) : null;
  }
  return null;
}

function requestedPlace(text) {
  for (const [city, re] of CITY_RULES) if (re.test(text)) return city;
  if (/\bcalifornia\b/i.test(text)) return "california";
  if (/\bnew york\b/i.test(text)) return "new york";
  if (/\btexas\b/i.test(text)) return "texas";
  return "";
}

function truthfulLocationLine(character, requested) {
  const location = String(character.location || "");
  const city = location.split(",")[0];
  if (requested && location.toLowerCase().includes(requested.toLowerCase())) {
    return randomOf([`yeah ${city} here`, `im in ${city}`, `${city} here`]);
  }
  return randomOf([`${city} here`, `nah im in ${city}`, `im over in ${city}`]);
}

function activityLine(character) {
  const job = String(character?.occupation || "").toLowerCase();
  if (/student|college/.test(job)) return randomOf(["avoiding homework", "supposed to be studying", "nothing, just killing time"]);
  if (/store|clerk|cashier|retail|mall/.test(job)) return randomOf(["just got off work", "trying not to think about work", "nothing, work sucked today"]);
  if (/movie|projection|video rental/.test(job)) return randomOf(["just got home from work", "watching tv and wasting time", "nothing much"]);
  if (/computer|technician|administrator|support/.test(job)) return randomOf(["messing with my computer", "waiting on a download", "nothing much"]);
  if (/delivery|pizza/.test(job)) return randomOf(["just got off work", "eating finally", "nothing much"]);
  return randomOf(["nothing much", "just hanging out", "waiting for somebody to call"]);
}

export function fallbackHumanReply(human, characters = []) {
  const text = String(human?.text || "");
  const active = characters.filter(Boolean);
  if (!active.length) return null;

  const place = requestedPlace(text);
  if (place && /\b(anyone|anybody|who|live|from|in)\b/i.test(text)) {
    const character = chooseByLocation(active, place) || randomOf(active);
    return { speaker: character.name, text: truthfulLocationLine(character, place), target: human.from, intent: "reply", topic: "location" };
  }

  if (/\b(anyone|anybody|who).{0,15}\brich\b|\banyone rich\b/i.test(text)) {
    const character = randomOf(active);
    return { speaker: character.name, text: randomOf(["LOL not me", "i wish", "im broke", "not on what i make"]), target: human.from, intent: "reply", topic: "general" };
  }

  if (/\bwhat (are|r) (you|u) guys up to|whats everyone doing|what is everyone doing\b/i.test(text)) {
    const character = randomOf(active);
    return { speaker: character.name, text: activityLine(character), target: human.from, intent: "reply", topic: "general" };
  }

  if (/\b(barfed|puked|threw up)\b.*\b(cop|police)\b/i.test(text)) {
    const character = randomOf(active);
    return { speaker: character.name, text: randomOf(["LOL what happened", "wtf how", "no way did u get arrested", "HAHA how did that happen"]), target: human.from, intent: "reply", topic: "general" };
  }

  if (/^\s*(hi|hello|hey|yo|sup)[!?. ]*$/i.test(text)) {
    const character = randomOf(active);
    return { speaker: character.name, text: randomOf(["hey", "sup", `hey ${human.from}`, "yo"]), target: human.from, intent: "reply", topic: "greeting" };
  }

  return null;
}

export function qualityDirectorPrompt() {
  return `CONVERSATION QUALITY RULES:\n- Screen names are opaque nicknames. A member named dog is NOT a dog; a name never implies species, age, job, location, or personality.\n- Fixed profile facts are hard facts. Never move a character to another city, job, or life history just to answer somebody.\n- Characters may be dumb, sarcastic, mistaken, or full of rumors, but they cannot be physically impossible or clairvoyant.\n- Distinguish media correctly: people WATCH/SAW/MISSED/TAPED a TV episode; they do not normally say they 'read about the new episode.' Movies are movies, not concerts or parties.\n- Foreign events are usually secondhand to these U.S. characters through MTV, radio, magazines, newspapers, friends, or Usenet. Do not claim casual firsthand attendance overseas.\n- Before a U.S. product launch, Americans can say they saw pictures, read a preview, heard about Japan, or want one. They do not casually own/play/buy it.\n- A dated one-off event that already happened stays in the past. Never turn an old concert/event into plans for next Saturday.\n- Do not invent remixes, reissues, release dates, tour stops, current sports scores, or precise news facts just to make a line specific. If unsure, be vague: 'i heard that was good', 'saw it in a magazine', 'my friend said...'\n- Answer the actual thing a human said. 'anyone rich?' gets something like 'LOL not me', not a question about concert spending.\n- Reactions should sound like people, not assistants. For an outrageous story use 'wtf how' or 'LOL no way', not safety boilerplate.\n- Do not force a cultural reference into a conversation merely because it is present in the historical feed. Most lines should be ordinary life.\n- Capital letters are normal sometimes: a person may shout ONE WORD or an entire short line. Plain ASCII emoticons like :) ;) :P :( <g> are also normal occasionally, but not every line.`;
}
