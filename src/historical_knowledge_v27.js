const ROOM_ZONE = "America/Los_Angeles";
const MIRROR_YEAR = 1996;

function pad(n) {
  return String(n).padStart(2, "0");
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(n, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function localParts(now = Date.now(), timeZone = ROOM_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(now))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  let hour = Number(parts.hour || 0);
  if (hour === 24) hour = 0;
  return {
    month: Number(parts.month || 1),
    day: Number(parts.day || 1),
    hour,
    minute: Number(parts.minute || 0)
  };
}

export function simulatedCutoff(now = Date.now()) {
  const local = localParts(now);
  return {
    dateKey: `${MIRROR_YEAR}-${pad(local.month)}-${pad(local.day)}`,
    hour: local.hour,
    minute: local.minute,
    minuteOfDay: local.hour * 60 + local.minute
  };
}

export function mirrorDateKeyForTimestamp(at = Date.now()) {
  return simulatedCutoff(at).dateKey;
}

const TIMELINE = [
  { date: "1995-04-19", hour: 18, type: "news", category: "national", importance: 1.0, title: "Oklahoma City bombing", aliases: [/oklahoma city bombing/i, /okc bombing/i] },
  { date: "1995-08-09", hour: 16, type: "tech", category: "tech", importance: 0.72, title: "Netscape IPO", aliases: [/netscape ipo/i] },
  { date: "1995-08-24", hour: 9, type: "tech", category: "tech", importance: 0.9, title: "Windows 95 launch", aliases: [/windows 95/i] },
  { date: "1995-10-03", hour: 14, type: "news", category: "national", importance: 0.96, title: "O.J. Simpson acquittal", aliases: [/o\.?j\.? simpson/i, /oj simpson/i] },
  { date: "1995-11-22", hour: 12, type: "movie", category: "entertainment", importance: 0.76, title: "Toy Story opens", aliases: [/toy story/i] },

  { date: "1996-01-28", hour: 21, type: "sports", category: "sports", importance: 0.86, title: "Cowboys win Super Bowl XXX", aliases: [/super bowl xxx/i, /cowboys.{0,30}super bowl/i] },
  { date: "1996-01-29", hour: 12, type: "game", category: "gaming", importance: 0.7, title: "Duke Nukem 3D shareware release", aliases: [/duke nukem 3d/i] },
  { date: "1996-02-10", hour: 18, type: "tech", category: "tech", importance: 0.7, title: "Deep Blue defeats Kasparov in a game", aliases: [/deep blue/i, /kasparov/i] },
  { date: "1996-02-13", hour: 12, type: "music", category: "music", importance: 0.72, title: "Tupac releases All Eyez on Me", aliases: [/all eyez on me/i] },
  { date: "1996-03-30", hour: 12, type: "game", category: "gaming", importance: 0.76, title: "Resident Evil available on PlayStation in the U.S.", aliases: [/resident evil/i] },
  { date: "1996-04-03", hour: 16, type: "news", category: "national", importance: 0.9, title: "Ted Kaczynski arrested", aliases: [/kaczynski/i, /unabomber/i] },
  { date: "1996-04-29", hour: 12, type: "theater", category: "entertainment", importance: 0.68, title: "Rent opens on Broadway", aliases: [/\brent\b.{0,20}broadway/i, /broadway.{0,20}\brent\b/i] },
  { date: "1996-05-10", hour: 12, type: "movie", category: "entertainment", importance: 0.76, title: "Twister opens", aliases: [/\btwister\b/i] },
  { date: "1996-05-11", hour: 17, type: "news", category: "national", importance: 0.9, title: "ValuJet Flight 592 crashes", aliases: [/valujet/i, /flight 592/i] },
  { date: "1996-05-22", hour: 12, type: "movie", category: "entertainment", importance: 0.76, title: "Mission: Impossible opens", aliases: [/mission:? impossible/i] },
  { date: "1996-06-04", hour: 12, type: "music", category: "music", importance: 0.78, title: "Metallica releases Load", aliases: [/metallica.{0,20}\bload\b/i, /\bload\b.{0,20}metallica/i] },
  { date: "1996-06-16", hour: 21, type: "sports", category: "sports", importance: 0.88, title: "Chicago Bulls win the NBA Finals", aliases: [/bulls.{0,30}(finals|championship|title)/i, /nba finals/i] },
  { date: "1996-06-22", hour: 12, type: "game", category: "gaming", importance: 0.82, title: "Quake is released", aliases: [/\bquake\b/i] },
  { date: "1996-06-23", hour: 12, type: "game", category: "gaming", importance: 0.68, title: "Nintendo 64 launches in Japan", aliases: [/nintendo 64/i, /\bn64\b/i] },
  { date: "1996-06-25", hour: 17, type: "news", category: "world", importance: 0.93, title: "Khobar Towers bombing", aliases: [/khobar/i] },
  { date: "1996-07-03", hour: 12, type: "movie", category: "entertainment", importance: 0.9, title: "Independence Day opens", aliases: [/independence day/i] },
  { date: "1996-07-17", hour: 21, type: "news", category: "national", importance: 1.0, title: "TWA Flight 800 crashes", aliases: [/twa flight 800/i, /flight 800/i] },
  { date: "1996-07-19", hour: 20, type: "sports", category: "sports", importance: 0.95, title: "Atlanta Summer Olympics begin", aliases: [/atlanta olympics/i, /summer olympics/i, /1996 olympics/i] },
  { date: "1996-07-27", hour: 6, type: "news", category: "national", importance: 0.98, title: "Centennial Olympic Park bombing", aliases: [/centennial olympic park/i, /olympic park bombing/i] },
  { date: "1996-08-04", hour: 22, type: "sports", category: "sports", importance: 0.82, title: "Atlanta Olympics end", aliases: [/olympics (?:ended|end|over|closing)/i, /closing ceremony.{0,20}olympics/i] },
  { date: "1996-08-06", hour: 23, type: "music", category: "music", importance: 0.7, title: "Ramones play their final concert", aliases: [/ramones.{0,25}final concert/i] },
  { date: "1996-08-09", hour: 12, type: "movie", category: "entertainment", importance: 0.58, title: "Jack opens", aliases: [/\bjack\b.{0,30}robin williams/i, /robin williams.{0,30}\bjack\b/i] },
  { date: "1996-08-09", hour: 12, type: "movie", category: "entertainment", importance: 0.58, title: "Escape from L.A. opens", aliases: [/escape from l\.?a\.?/i] },
  { date: "1996-08-10", hour: 18, type: "music", category: "music", importance: 0.72, title: "Oasis plays Knebworth", aliases: [/knebworth/i] },
  { date: "1996-08-13", hour: 12, type: "tech", category: "tech", importance: 0.74, title: "Internet Explorer 3.0 released", aliases: [/internet explorer 3/i, /\bie3\b/i] },
  { date: "1996-08-16", hour: 12, type: "movie", category: "entertainment", importance: 0.62, title: "Tin Cup opens", aliases: [/tin cup/i] },
  { date: "1996-08-28", hour: 12, type: "news", category: "entertainment", importance: 0.82, title: "Prince Charles and Princess Diana divorce becomes final", aliases: [/diana.{0,30}divorc/i, /charles.{0,30}diana.{0,30}divorc/i] },
  { date: "1996-09-07", hour: 23, type: "news", category: "music", importance: 0.9, title: "Tupac Shakur is shot in Las Vegas", aliases: [/tupac.{0,20}(shot|shooting)/i, /2pac.{0,20}(shot|shooting)/i] },
  { date: "1996-09-13", hour: 17, type: "news", category: "music", importance: 1.0, title: "Tupac Shakur dies", aliases: [/tupac.{0,20}(died|dead|death)/i, /2pac.{0,20}(died|dead|death)/i] },
  { date: "1996-09-29", hour: 12, type: "game", category: "gaming", importance: 0.9, title: "Nintendo 64 launches in the U.S.", aliases: [/nintendo 64.{0,30}(launch|stores|bought|own|got)/i, /\bn64\b.{0,30}(launch|stores|bought|own|got)/i, /super mario 64/i] },
  { date: "1996-10-26", hour: 23, type: "sports", category: "sports", importance: 0.92, title: "New York Yankees win the World Series", aliases: [/yankees.{0,30}(world series|championship|title|won)/i, /world series.{0,30}yankees/i] },
  { date: "1996-11-05", hour: 23, type: "news", category: "politics", importance: 1.0, title: "Bill Clinton wins reelection", aliases: [/clinton.{0,30}(reelect|won|wins|victory)/i, /presidential election.{0,30}clinton/i] },
  { date: "1996-11-15", hour: 12, type: "movie", category: "entertainment", importance: 0.84, title: "Space Jam opens", aliases: [/space jam/i] },
  { date: "1996-12-20", hour: 12, type: "movie", category: "entertainment", importance: 0.82, title: "Scream opens", aliases: [/\bscream\b/i] },
  { date: "1996-12-26", hour: 18, type: "news", category: "national", importance: 0.95, title: "JonBenet Ramsey is found dead", aliases: [/jonben[eé]t ramsey/i] }
];

export function timelineEventsThrough(cutoff = simulatedCutoff(), lookbackDays = 120) {
  const current = new Date(`${cutoff.dateKey}T12:00:00Z`).getTime();
  return TIMELINE.filter((event) => {
    if (event.date > cutoff.dateKey) return false;
    if (event.date === cutoff.dateKey && Number(event.hour || 18) * 60 > cutoff.minuteOfDay) return false;
    const ageDays = Math.floor((current - new Date(`${event.date}T12:00:00Z`).getTime()) / 86400000);
    return ageDays <= lookbackDays || event.importance >= 0.93 || event.date < "1996-01-01";
  });
}

function eventCategory(value, type = "") {
  const text = `${type} ${value}`.toLowerCase();
  if (/sport|olympic|baseball|basketball|football|super bowl|world series|nba|nfl|mlb|yankees|bulls/.test(text)) return "sports";
  if (/game|nintendo|playstation|sega|quake|doom|computer game/.test(text)) return "gaming";
  if (/tech|internet|browser|computer|software|windows|netscape|microsoft/.test(text)) return "tech";
  if (/music|album|concert|band|singer|rapper|tupac|ramones|oasis|metallica/.test(text)) return "music";
  if (/movie|film|actor|actress|television|\btv\b|broadway/.test(text)) return "entertainment";
  if (/election|president|congress|senate|government|politic|white house/.test(text)) return "politics";
  if (/bomb|crash|killed|dies|dead|attack|disaster|trial|arrest/.test(text)) return "national";
  return "general";
}

function normalizeContextEvents(context, cutoff) {
  const rows = [];
  const push = (raw, type, importance = 0.5) => {
    const date = String(raw?.date || "").slice(0, 10);
    const title = String(raw?.title || raw?.show || "").trim();
    if (!date || !title || date > cutoff.dateKey) return;
    // Dynamic feeds usually have only a date. Same-day facts stay hidden until the
    // evening so a morning room cannot know something that may happen later that day.
    if (date === cutoff.dateKey && cutoff.hour < 18) return;
    rows.push({
      date,
      hour: date === cutoff.dateKey ? 18 : 0,
      type,
      category: eventCategory(title, type),
      importance,
      title,
      note: raw?.episode ? `${raw.show}: ${raw.episode}` : "",
      source: "historical-feed"
    });
  };

  for (const row of context?.events || []) push(row, "event", 0.62);
  for (const row of context?.movies || []) push(row, "movie", 0.54);
  for (const row of context?.tv || []) push(row, "tv", 0.46);
  for (const row of context?.anchors || []) push(row, row.type || "anchor", 0.72);
  return rows;
}

function dedupeEvents(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows.sort((a, b) => b.date.localeCompare(a.date) || Number(b.importance || 0) - Number(a.importance || 0))) {
    const key = `${row.date}:${String(row.title || "").toLowerCase()}`;
    if (!row.title || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function historicalEventPool(context, now = Date.now()) {
  const cutoff = simulatedCutoff(now);
  return dedupeEvents([
    ...timelineEventsThrough(cutoff, 120).map((event) => ({ ...event, source: "timeline" })),
    ...normalizeContextEvents(context, cutoff)
  ]);
}

function profileText(character) {
  return [
    character?.occupation,
    ...(character?.interests || []),
    ...(character?.opinions || [])
  ].join(" ").toLowerCase();
}

function mediaHabits(character) {
  const text = profileText(character);
  const habits = [];
  if (/computer|internet|html|bbs|usenet|modem|linux|unix|netscape|game|playstation|sega|arcade/.test(text)) habits.push("computer magazines/BBS/online chatter");
  if (/music|radio|mtv|record|band|concert|r&b|hip hop|rock|metal|oasis|tori|green day/.test(text)) habits.push("radio/MTV/music press");
  if (/sport|yankees|knicks|bulls|football|baseball|basketball/.test(text)) habits.push("sports radio/TV/sports page");
  if (Number(character?.age || 0) >= 25 || /office|administrator|support|dispatcher|insurance|publishing/.test(text)) habits.push("local newspaper/evening TV news");
  if (Number(character?.age || 0) <= 22) habits.push("friends/coworkers");
  if (!habits.length) habits.push("local radio/TV and friends");
  return [...new Set(habits)].slice(0, 3).join(", ");
}

function categoryAffinity(character, category) {
  const text = profileText(character);
  let score = 0;
  if (category === "sports" && /sport|yankees|knicks|bulls|football|baseball|basketball/.test(text)) score += 0.36;
  if (category === "gaming" && /game|playstation|sega|arcade|quake|doom|nintendo/.test(text)) score += 0.42;
  if (category === "tech" && /computer|html|bbs|usenet|modem|linux|unix|netscape|web/.test(text)) score += 0.42;
  if (category === "music" && /music|radio|mtv|record|band|concert|r&b|hip hop|rock|metal|oasis|tori|green day/.test(text)) score += 0.34;
  if (category === "entertainment" && /movie|theater|video|tv|friends|x-files|mtv|fashion/.test(text)) score += 0.28;
  if (category === "politics") {
    score += Number(character?.age || 0) >= 27 ? 0.18 : -0.08;
    if (/office|administrator|insurance|publishing/.test(text)) score += 0.1;
  }
  if (category === "national" || category === "world") score += Number(character?.age || 0) >= 24 ? 0.08 : 0;
  return score;
}

function locationAffinity(character, event) {
  const location = String(character?.location || "").toLowerCase();
  const title = String(event?.title || "").toLowerCase();
  if (!location || !title) return 0;
  const city = location.split(",")[0].trim();
  const state = location.split(",")[1]?.trim();
  if (city && city.length > 3 && title.includes(city)) return 0.38;
  if (state && state.length === 2) {
    const stateNames = { CA: "california", NY: "new york", NJ: "new jersey", FL: "florida", TX: "texas", OH: "ohio", MA: "massachusetts", AZ: "arizona", CO: "colorado", IL: "illinois", WA: "washington", OR: "oregon", MN: "minnesota", NM: "new mexico", ID: "idaho", UT: "utah" };
    const stateName = stateNames[state.toUpperCase()];
    if (stateName && title.includes(stateName)) return 0.26;
  }
  return 0;
}

function eventAgeDays(event, cutoff) {
  const current = new Date(`${cutoff.dateKey}T12:00:00Z`).getTime();
  const then = new Date(`${event.date}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((current - then) / 86400000));
}

function awarenessProbability(character, event, cutoff) {
  const ageDays = eventAgeDays(event, cutoff);
  let score = 0.08 + Number(event.importance || 0.5) * 0.48;
  score += categoryAffinity(character, event.category || eventCategory(event.title, event.type));
  score += locationAffinity(character, event);
  if (ageDays <= 2) score += 0.12;
  else if (ageDays <= 7) score += 0.06;
  else if (ageDays > 45 && Number(event.importance || 0) < 0.9) score -= 0.16;
  if (Number(character?.age || 0) <= 20 && event.category === "politics") score -= 0.08;
  return clamp(score, 0.08, 0.96);
}

export function individualKnowledge(character, context, now = Date.now(), max = 5) {
  const cutoff = simulatedCutoff(now);
  const pool = historicalEventPool(context, now);
  const scored = pool.map((event) => {
    const probability = awarenessProbability(character, event, cutoff);
    const roll = (hashString(`${character?.name || "bot"}|${event.date}|${event.title}`) % 10000) / 10000;
    const ageDays = eventAgeDays(event, cutoff);
    const relevance = probability + Math.max(0, 0.18 - ageDays * 0.002);
    return { event, probability, roll, relevance, aware: roll < probability };
  }).filter((row) => row.aware)
    .sort((a, b) => b.relevance - a.relevance || b.event.date.localeCompare(a.event.date));

  return {
    cutoff,
    media: mediaHabits(character),
    items: scored.slice(0, max).map((row) => ({
      date: row.event.date,
      title: row.event.title,
      category: row.event.category || eventCategory(row.event.title, row.event.type),
      source: row.event.source || "timeline"
    }))
  };
}

export function individualKnowledgePrompt(characters, context, now = Date.now()) {
  const cutoff = simulatedCutoff(now);
  const rows = [
    `PRIVATE HISTORICAL KNOWLEDGE AT ${cutoff.dateKey} ${pad(cutoff.hour)}:${pad(cutoff.minute)} PT:`,
    "The outside world has a hard cutoff at this exact simulated moment. Nothing after it has happened.",
    "Each line below is PRIVATE awareness for that named character. Do not transfer one character's knowledge to another just because the brain can see this prompt.",
    "Pre-1996 facts can be ordinary long-term knowledge when they fit the character. For dated 1996 events, use only facts already public by the cutoff and plausibly known by that character.",
    "If a human claims a future event as fact, characters may be confused, skeptical, joke, or treat it as a rumor. Do not adopt the future claim as true world knowledge."
  ];

  for (const character of characters || []) {
    const profile = individualKnowledge(character, context, now, 5);
    if (!profile.items.length) {
      rows.push(`- ${character.name} (${character.age}, ${character.location}; gets news via ${profile.media}): no specific recent dated item is guaranteed; may still know older pre-cutoff general facts that fit this person.`);
      continue;
    }
    rows.push(`- ${character.name} (${character.age}, ${character.location}; gets news via ${profile.media}) may know: ${profile.items.map((item) => `${item.date} ${item.title}`).join(" | ")}`);
  }

  rows.push("Knowledge is imperfect: even a listed item is something the character may have heard, not a requirement to mention it. Most chat should remain ordinary life, relationships, hobbies, work, school, music, games, and nonsense.");
  return rows.join("\n");
}

function staticGate(text) {
  const value = String(text || "");
  let best = null;
  for (const event of TIMELINE) {
    if (event.date < "1996-01-01") continue;
    if (!(event.aliases || []).some((re) => re.test(value))) continue;
    if (!best || event.date > best.date || (event.date === best.date && Number(event.hour || 0) > Number(best.hour || 0))) {
      best = { date: event.date, hour: Number(event.hour || 0), title: event.title };
    }
  }
  return best;
}

const DATE_BOUND_CUE = /\b(?:today|yesterday|last night|this morning|this afternoon|this week|this year|just (?:saw|heard|watched|read)|headline|news|score|won|lost|released|opened|launch(?:ed)?|election|olympics|world series|super bowl|finals|bombing|crash|arrested|died|dead|shot|concert|premiere)\b/i;

export function knowledgeGateForText(text, at = Date.now()) {
  const specific = staticGate(text);
  if (specific) return specific;
  if (!DATE_BOUND_CUE.test(String(text || ""))) return null;
  const cutoff = simulatedCutoff(at);
  return { date: cutoff.dateKey, hour: cutoff.hour, title: "date-bound conversation" };
}

export function gateAvailable(gate, cutoff = simulatedCutoff()) {
  if (!gate) return true;
  if (gate.date < cutoff.dateKey) return true;
  if (gate.date > cutoff.dateKey) return false;
  return Number(gate.hour || 0) * 60 <= cutoff.minuteOfDay;
}

export function episodeAvailableAtCutoff(episode, cutoff = simulatedCutoff()) {
  if (!episode) return false;
  const gate = episode.worldNotBefore
    ? { date: episode.worldNotBefore, hour: Number(episode.worldNotBeforeHour || 0) }
    : knowledgeGateForText(episode.text, episode.at || Date.now());
  return gateAvailable(gate, cutoff);
}

export function factAvailableAtCutoff(fact, cutoff = simulatedCutoff()) {
  if (!fact) return false;
  const gate = fact.worldNotBefore
    ? { date: fact.worldNotBefore, hour: Number(fact.worldNotBeforeHour || 0) }
    : knowledgeGateForText(fact.value, fact.at || Date.now());
  return gateAvailable(gate, cutoff);
}

export function futureKnowledgeViolation(text, now = Date.now()) {
  const gate = staticGate(text);
  if (!gate) return null;
  const cutoff = simulatedCutoff(now);
  return gateAvailable(gate, cutoff) ? null : { ...gate, cutoff: cutoff.dateKey };
}

export function historicalKnowledgeDebug(characters, context, now = Date.now()) {
  const cutoff = simulatedCutoff(now);
  return {
    cutoff,
    characters: (characters || []).map((character) => {
      const knowledge = individualKnowledge(character, context, now, 4);
      return {
        name: character.name,
        age: character.age,
        location: character.location,
        media: knowledge.media,
        items: knowledge.items
      };
    })
  };
}
