const TZ_OFFSETS = { ET: -5, CT: -6, MT: -7, PT: -8 };
const REAL_ANCHOR = Date.UTC(2026, 7, 19, 7, 0, 0);
const WORLD_ANCHOR = Date.UTC(1996, 10, 22, 8, 0, 0);
const WORLD_YEAR_START = Date.UTC(1996, 0, 1, 8, 0, 0);
const WORLD_YEAR_MS = Date.UTC(1997, 0, 1, 8, 0, 0) - WORLD_YEAR_START;
const THREAD_TTL_MS = 6 * 60 * 1000;
const MAX_THREADS = 7;
const MAX_FACTS_PER_HUMAN = 18;

const EXPLICIT_RELATIONSHIPS = [
  ["JennJenn", "xXBabyGirlXx", 34],
  ["JennJenn", "CoolChick17", 22],
  ["JennJenn", "JerseyGirl", 18],
  ["CyberDude", "WebMasterJ", 42],
  ["CyberDude", "BBSWizard", 37],
  ["CyberDude", "MacAddict", -12],
  ["SegaMan", "Sk8rGuy16", -44],
  ["SegaMan", "DaBomb96", -27],
  ["DaBomb96", "NYMike23", -31],
  ["DaBomb96", "CoolChick17", -8],
  ["AltGirl82", "SeattleRain", 34],
  ["AltGirl82", "MetallicaFan", 10],
  ["OasisFan", "BostonRob", 24],
  ["SportsNut", "ChiTownAmy", 31],
  ["SportsNut", "JazzFanUT", -9],
  ["CoffeeJen", "SeattleRain", 27],
  ["VideoStoreGuy", "SoCalGuy", 18],
  ["MoonChild", "GothicRose", 21],
  ["QuakeLord", "CollegeKid88", 24],
  ["MacAddict", "WebMasterJ", 9]
];

const TOPIC_PATTERNS = [
  ["pumpkins", /smashing pumpkins|pumpkins|billy corgan|siamese dream|mellon collie|1979|tonight tonight/i],
  ["metal", /metallica|megadeth|pantera|master of puppets|\bload\b/i],
  ["oasis", /oasis|blur|wonderwall|morning glory|britpop/i],
  ["friends", /\bfriends\b|ross|rachel|joey|chandler|monica|phoebe/i],
  ["xfiles", /x[ -]?files|mulder|scully|ufo|aliens?/i],
  ["movies", /movie|movies|vhs|video store|twister|independence day|seinfeld/i],
  ["gaming", /playstation|\bpsx\b|saturn|n64|nintendo|quake|doom|game|gaming|arcade|tekken|mario/i],
  ["web", /geocities|homepage|html|web page|netscape|guestbook|counter|internet/i],
  ["computers", /computer|pc\b|macintosh|windows|linux|unix|ram|hard drive|modem|bbs/i],
  ["sports", /bulls|jordan|yankees|knicks|red sox|celtics|cowboys|football|baseball|basketball|nba|sports/i],
  ["music", /band|music|cd\b|album|radio|mtv|concert|green day|no doubt|pearl jam|soundgarden|tori amos/i],
  ["location", /where.*from|what city|location|california|new york|ohio|florida|texas|chicago|seattle|boston/i],
  ["work", /work|job|boss|shift|store|office|clerk/i],
  ["school", /school|college|class|homework|campus|quiz/i],
  ["food", /pizza|food|hungry|tacos|fries|eat/i],
  ["weekend", /weekend|tonight|plans|friday|saturday|sunday/i]
];

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

function unique(values, max = 20) {
  return [...new Set(values.filter(Boolean))].slice(0, max);
}

function normalizeFactValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\b(?:and then|but anyway)\b.*$/i, "")
    .trim()
    .replace(/[,.!?;:]+$/, "")
    .slice(0, 60);
}

function memorySafe(value) {
  const text = String(value || "");
  return !/(password|passcode|social security|ssn|credit card|routing number|bank account|api key|secret key|phone number|email address)/i.test(text);
}

export function simulatedWorldMs(now = Date.now()) {
  const elapsed = ((now - REAL_ANCHOR) % WORLD_YEAR_MS + WORLD_YEAR_MS) % WORLD_YEAR_MS;
  const anchorOffset = WORLD_ANCHOR - WORLD_YEAR_START;
  const yearOffset = (anchorOffset + elapsed) % WORLD_YEAR_MS;
  return WORLD_YEAR_START + yearOffset;
}

export function simulatedDateLabel(now = Date.now()) {
  const d = new Date(simulatedWorldMs(now));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(d);
}

export function simulatedDateTimeLabel(now = Date.now()) {
  const d = new Date(simulatedWorldMs(now));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(d);
}

function localWorldParts(character, now = Date.now()) {
  const offset = TZ_OFFSETS[character?.timezone] ?? -5;
  const d = new Date(simulatedWorldMs(now) + offset * 60 * 60 * 1000);
  return {
    day: d.getUTCDay(),
    hour: d.getUTCHours() + d.getUTCMinutes() / 60,
    dateKey: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
  };
}

function occupationClass(character) {
  const job = String(character?.occupation || "").toLowerCase();
  if (/student|freshman|college/.test(job)) return "student";
  if (/bartender|hotel|restaurant|hostess|coffee|projection|video rental/.test(job)) return "late-shift";
  if (/clerk|cashier|store|retail|sales|mall|bookstore|warehouse|delivery|dispatcher/.test(job)) return "retail";
  if (/technician|administrator|support|publishing|office|insurance|receptionist/.test(job)) return "office";
  return "general";
}

export function scheduleProfile(character) {
  const seed = hashString(character?.name || "guest");
  const type = occupationClass(character);
  let weekdayStart = 18;
  let weekdayEnd = 1;

  if (type === "student") { weekdayStart = 15; weekdayEnd = 2; }
  if (type === "late-shift") { weekdayStart = 22; weekdayEnd = 3; }
  if (type === "retail") { weekdayStart = 19; weekdayEnd = 1.5; }
  if (type === "office") { weekdayStart = 18; weekdayEnd = 0.75; }

  weekdayStart += ((seed % 5) - 2) * 0.35;
  weekdayEnd += (((seed >>> 4) % 5) - 2) * 0.25;
  const weekendStart = 12 + ((seed >>> 8) % 7);
  const weekendEnd = 1.5 + ((seed >>> 12) % 4) * 0.5;

  return {
    type,
    weekdayStart: Math.round(weekdayStart * 4) / 4,
    weekdayEnd: Math.round(weekdayEnd * 4) / 4,
    weekendStart,
    weekendEnd: Math.round(weekendEnd * 4) / 4
  };
}

function hourInWindow(hour, start, end) {
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function scheduleScore(character, now = Date.now()) {
  const local = localWorldParts(character, now);
  const schedule = scheduleProfile(character);
  const weekend = local.day === 0 || local.day === 6;
  const start = weekend ? schedule.weekendStart : schedule.weekdayStart;
  const end = weekend ? schedule.weekendEnd : schedule.weekdayEnd;
  const inside = hourInWindow(local.hour, start, end);
  const slot = Math.floor(local.hour * 2);
  const stableNoise = (hashString(`${character.name}:${local.dateKey}:${slot}`) % 21) - 10;
  return (inside ? 76 : 15) + stableNoise + (character.personality?.sociability || 0.5) * 12;
}

function formatHour(hour) {
  const normalized = ((hour % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const minutes = Math.round((normalized - h) * 60);
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h % 12 || 12;
  return minutes ? `${display}:${String(minutes).padStart(2, "0")} ${suffix}` : `${display} ${suffix}`;
}

export function scheduleDescription(character) {
  if (!character) return "";
  const s = scheduleProfile(character);
  return `Usually online ${formatHour(s.weekdayStart)}-${formatHour(s.weekdayEnd)} ${character.timezone}; weekends vary.`;
}

function relationshipKey(from, to) {
  return `${from}→${to}`;
}

function sharedInterestScore(a, b) {
  const aa = new Set((a?.interests || []).map((x) => String(x).toLowerCase()));
  let shared = 0;
  for (const item of b?.interests || []) if (aa.has(String(item).toLowerCase())) shared += 1;
  return Math.min(18, shared * 6);
}

function seedRelationships(characters) {
  const relationships = {};
  for (const a of characters) {
    for (const b of characters) {
      if (a.name === b.name) continue;
      const shared = sharedInterestScore(a, b);
      const personalityDelta = ((a.personality?.sociability || 0.5) - 0.5) * 4;
      relationships[relationshipKey(a.name, b.name)] = {
        score: Math.round(shared + personalityDelta),
        interactions: 0,
        lastAt: 0
      };
    }
  }

  for (const [a, b, score] of EXPLICIT_RELATIONSHIPS) {
    relationships[relationshipKey(a, b)] = { score, interactions: 4, lastAt: 0 };
    relationships[relationshipKey(b, a)] = { score: Math.round(score * 0.9), interactions: 4, lastAt: 0 };
  }
  return relationships;
}

export function createSocialState(characters, coreNames, now = Date.now()) {
  return {
    version: 3,
    createdAt: now,
    relationships: seedRelationships(characters),
    humans: {},
    threads: [],
    threadSeq: 0,
    presence: {
      online: [],
      lastChangeAt: now,
      lastChurnAt: now
    }
  };
}

export function normalizeSocialState(raw, characters, coreNames, now = Date.now()) {
  if (!raw || raw.version !== 3) return createSocialState(characters, coreNames, now);
  raw.relationships ||= seedRelationships(characters);
  raw.humans ||= {};
  raw.threads = Array.isArray(raw.threads) ? raw.threads : [];
  raw.threadSeq ||= 0;
  raw.presence ||= { online: [...coreNames], lastChangeAt: now, lastChurnAt: now };
  raw.presence.online = Array.isArray(raw.presence.online) ? raw.presence.online : [...coreNames];
  return raw;
}

export function relationshipScore(state, from, to) {
  return Number(state?.relationships?.[relationshipKey(from, to)]?.score || 0);
}

export function relationshipInteractions(state, from, to) {
  return Number(state?.relationships?.[relationshipKey(from, to)]?.interactions || 0);
}

export function adjustRelationship(state, from, to, delta, now = Date.now()) {
  if (!state || !from || !to || from === to || to === "room") return;
  state.relationships ||= {};
  const key = relationshipKey(from, to);
  const current = state.relationships[key] || { score: 0, interactions: 0, lastAt: 0 };
  current.score = clamp(current.score + delta, -100, 100);
  current.interactions += 1;
  current.lastAt = now;
  state.relationships[key] = current;
}

export function relationshipLabel(score) {
  if (score <= -50) return "really dislikes";
  if (score <= -25) return "doesn't get along with";
  if (score <= -10) return "some friction with";
  if (score < 10) return "neutral toward";
  if (score < 28) return "familiar with";
  if (score < 50) return "friendly with";
  return "very close to";
}

export function relationshipPrompt(state, names, limit = 18) {
  const uniqueNames = unique(names, 20);
  const rows = [];
  for (const from of uniqueNames) {
    for (const to of uniqueNames) {
      if (from === to) continue;
      const score = relationshipScore(state, from, to);
      const interactions = relationshipInteractions(state, from, to);
      if (Math.abs(score) < 10 && interactions < 2) continue;
      rows.push({ from, to, score, interactions, weight: Math.abs(score) + interactions * 2 });
    }
  }
  rows.sort((a, b) => b.weight - a.weight);
  return rows.slice(0, limit).map((r) => `${r.from} ${relationshipLabel(r.score)} ${r.to} (${r.score >= 0 ? "+" : ""}${Math.round(r.score)}).`).join("\n") || "No strong relationship history yet.";
}

function ensureHuman(state, name, now = Date.now()) {
  state.humans ||= {};
  state.humans[name] ||= {
    firstSeen: now,
    lastSeen: now,
    visits: 0,
    messageCount: 0,
    facts: [],
    topics: {},
    recent: []
  };
  return state.humans[name];
}

export function rememberHumanVisit(state, name, now = Date.now()) {
  if (!state || !name) return;
  const human = ensureHuman(state, name, now);
  const wasAway = !human.lastSeen || now - human.lastSeen > 15 * 60 * 1000;
  if (wasAway || human.visits === 0) human.visits += 1;
  human.lastSeen = now;
}

export function rememberHumanDeparture(state, name, now = Date.now()) {
  if (!state?.humans?.[name]) return;
  state.humans[name].lastSeen = now;
}

function addHumanFact(human, kind, value, witnesses, now) {
  const clean = normalizeFactValue(value);
  if (!clean || clean.length < 2 || !memorySafe(clean)) return;
  const fingerprint = `${kind}:${clean.toLowerCase()}`;
  const existing = human.facts.find((fact) => fact.fingerprint === fingerprint);
  if (existing) {
    existing.at = now;
    existing.witnesses = unique([...(existing.witnesses || []), ...witnesses], 24);
    return;
  }
  human.facts.push({ kind, value: clean, fingerprint, at: now, witnesses: unique(witnesses, 24) });
  human.facts = human.facts.slice(-MAX_FACTS_PER_HUMAN);
}

export function inferConversationTopic(text) {
  const value = String(text || "");
  for (const [topic, re] of TOPIC_PATTERNS) if (re.test(value)) return topic;
  if (/\b(hi|hey|hello|yo|sup)\b/i.test(value)) return "greeting";
  if (/\b(asl|where.*from|how old)\b/i.test(value)) return "asl";
  return "general";
}

export function rememberHumanMessage(state, name, text, witnesses = [], now = Date.now()) {
  if (!state || !name || !text) return;
  const human = ensureHuman(state, name, now);
  human.lastSeen = now;
  human.messageCount += 1;

  const topic = inferConversationTopic(text);
  human.topics[topic] = (human.topics[topic] || 0) + 1;

  if (memorySafe(text)) {
    human.recent.push(String(text).slice(0, 120));
    human.recent = human.recent.slice(-5);
  }

  const likes = String(text).match(/\b(?:i (?:really )?(?:like|love)|i['’]?m into|my favorite (?:band|game|movie|show|album) is)\s+([^.!?]{2,55})/i);
  if (likes) addHumanFact(human, "likes", likes[1].split(/\b(?:but|and i|though)\b/i)[0], witnesses, now);

  const dislikes = String(text).match(/\b(?:i (?:really )?(?:hate|dislike)|i don['’]?t like)\s+([^.!?]{2,55})/i);
  if (dislikes) addHumanFact(human, "dislikes", dislikes[1].split(/\b(?:but|and i|though)\b/i)[0], witnesses, now);

  const location = String(text).match(/\b(?:i['’]?m from|i am from|i live in|i['’]?m in)\s+([a-z][a-z .'-]{1,36})/i);
  if (location) addHumanFact(human, "location", location[1].split(/\b(?:and|but|right now)\b/i)[0], witnesses, now);

  const favorite = String(text).match(/\bmy (?:favorite|fave)\s+([^.!?]{2,55})/i);
  if (favorite) addHumanFact(human, "favorite", favorite[1], witnesses, now);
}

export function humanMemorySummary(state, humanName, viewerName = null) {
  const human = state?.humans?.[humanName];
  if (!human) return "No memory yet.";
  const facts = (human.facts || []).filter((fact) => !viewerName || (fact.witnesses || []).includes(viewerName));
  const topicRows = Object.entries(human.topics || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topic]) => topic);
  const pieces = [];
  if (human.visits > 1) pieces.push(`seen in the room ${human.visits} times`);
  for (const fact of facts.slice(-6)) pieces.push(`${fact.kind}: ${fact.value}`);
  if (topicRows.length) pieces.push(`often talks about ${topicRows.join(", ")}`);
  return pieces.join("; ") || "Has chatted before, but nothing specific was remembered.";
}

export function humanMemoryPrompt(state, humanName, botNames, limit = 8) {
  const human = state?.humans?.[humanName];
  if (!human) return `${humanName}: no prior memory.`;
  const rows = [];
  for (const bot of unique(botNames, limit)) {
    const interactions = relationshipInteractions(state, bot, humanName);
    const summary = humanMemorySummary(state, humanName, bot);
    if (interactions === 0 && !summary.includes("likes:") && !summary.includes("location:") && !summary.includes("favorite:")) {
      rows.push(`${bot}: has seen ${humanName} around but does not know much yet.`);
    } else {
      rows.push(`${bot} remembers about ${humanName}: ${summary}`);
    }
  }
  return rows.join("\n");
}

export function touchThread(state, { topic, participants = [], kind = "conversation", text = "", now = Date.now() }) {
  if (!state) return null;
  pruneThreads(state, now);
  const cleanParticipants = unique(participants.filter((p) => p && p !== "room"), 8);
  const cleanTopic = topic || inferConversationTopic(text);
  let thread = state.threads.find((candidate) => {
    if (candidate.topic !== cleanTopic) return false;
    if (now - candidate.lastAt > THREAD_TTL_MS) return false;
    return cleanParticipants.some((name) => candidate.participants.includes(name));
  });

  if (!thread) {
    state.threadSeq = (state.threadSeq || 0) + 1;
    thread = {
      id: `t${state.threadSeq}`,
      topic: cleanTopic,
      participants: cleanParticipants,
      kind,
      createdAt: now,
      lastAt: now,
      turns: 0,
      lastText: ""
    };
    state.threads.push(thread);
  }

  thread.participants = unique([...thread.participants, ...cleanParticipants], 8);
  thread.lastAt = now;
  thread.turns += 1;
  thread.kind = kind || thread.kind;
  thread.lastText = normalizeFactValue(text).slice(0, 100);
  state.threads.sort((a, b) => b.lastAt - a.lastAt);
  state.threads = state.threads.slice(0, MAX_THREADS);
  return thread;
}

export function pruneThreads(state, now = Date.now()) {
  if (!state) return [];
  state.threads = (state.threads || []).filter((thread) => now - thread.lastAt <= THREAD_TTL_MS);
  return state.threads;
}

export function activeThreads(state, now = Date.now()) {
  return pruneThreads(state, now).slice().sort((a, b) => b.lastAt - a.lastAt);
}

export function chooseThread(state, activeNames = [], humanNames = [], now = Date.now()) {
  const active = new Set([...activeNames, ...humanNames]);
  const candidates = activeThreads(state, now).filter((thread) => thread.participants.some((name) => active.has(name)));
  if (!candidates.length) return null;
  const weighted = [];
  for (const thread of candidates) {
    const age = now - thread.lastAt;
    const recency = Math.max(1, 8 - Math.floor(age / 45000));
    const live = thread.participants.filter((name) => active.has(name)).length;
    const weight = recency + Math.min(5, thread.turns) + live * 2;
    for (let i = 0; i < weight; i += 1) weighted.push(thread);
  }
  return weighted[hashString(`${now >> 13}:${candidates.length}`) % weighted.length] || candidates[0];
}

export function threadPrompt(state, now = Date.now(), limit = 5) {
  const rows = activeThreads(state, now).slice(0, limit).map((thread) => {
    const people = thread.participants.length ? thread.participants.join(", ") : "room";
    return `${thread.id}: topic=${thread.topic}; participants=${people}; turns=${thread.turns}; last="${thread.lastText}"`;
  });
  return rows.join("\n") || "No active threads yet.";
}

export function rankRoster(characters, { current = [], coreNames = [], humans = [], threadParticipants = [], count = 20, now = Date.now() } = {}) {
  const currentSet = new Set(current);
  const coreSet = new Set(coreNames);
  const humanSet = new Set(humans);
  const threadSet = new Set(threadParticipants);
  return characters
    .filter((character) => !humanSet.has(character.name))
    .map((character) => {
      let score = scheduleScore(character, now);
      if (currentSet.has(character.name)) score += 22;
      if (coreSet.has(character.name)) score += 13;
      if (threadSet.has(character.name)) score += 28;
      score += (hashString(`${character.name}:${Math.floor(simulatedWorldMs(now) / 3600000)}`) % 13) - 6;
      return { character, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.character.name);
}

export function presenceDebug(character, now = Date.now()) {
  const local = localWorldParts(character, now);
  const schedule = scheduleProfile(character);
  return {
    name: character.name,
    localHour: Math.round(local.hour * 10) / 10,
    schedule,
    score: Math.round(scheduleScore(character, now))
  };
}
