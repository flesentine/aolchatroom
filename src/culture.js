import { calendarContext } from "./calendar.js";

const CACHE_KEY = "cultureContextV1";
const CACHE_MS = 6 * 60 * 60 * 1000;
const MIRROR_YEAR = 1996;

// Hand-curated anchors guarantee that the room still has useful cultural context
// when a public data source is slow or incomplete. Dynamic sources supplement these.
const ANCHORS = [
  { date: "1996-01-29", type: "game", title: "Duke Nukem 3D", note: "The DOS shareware release is out and PC gamers are talking about it." },
  { date: "1996-03-30", type: "game", title: "Resident Evil", note: "Resident Evil has reached the U.S. PlayStation market." },
  { date: "1996-05-10", type: "movie", title: "Twister", note: "Twister is in theaters and is a major summer movie." },
  { date: "1996-05-22", type: "movie", title: "Mission: Impossible", note: "Mission: Impossible is in theaters." },
  { date: "1996-06-04", type: "music", title: "Metallica — Load", note: "Metallica's Load is newly released and fans are arguing about the band's new direction." },
  { date: "1996-06-22", type: "game", title: "Quake", note: "Quake is out for DOS and PC gamers are talking about it." },
  { date: "1996-06-23", type: "game", title: "Nintendo 64 launches in Japan", note: "Nintendo's new console is available in Japan, but not yet on U.S. store shelves." },
  { date: "1996-07-03", type: "movie", title: "Independence Day", note: "Independence Day is in U.S. theaters and is a huge summer hit." },
  { date: "1996-07-19", type: "event", title: "Atlanta Summer Olympics begin", note: "The 1996 Summer Olympics are underway in Atlanta." },
  { date: "1996-08-04", type: "event", title: "Atlanta Summer Olympics end", note: "The Atlanta Olympics just wrapped up after running July 19 through August 4." },
  { date: "1996-08-06", type: "music", title: "Ramones final concert", note: "The Ramones played their final concert at the Palace in Hollywood." },
  { date: "1996-08-09", type: "movie", title: "Jack", note: "Jack, starring Robin Williams, has just opened in U.S. theaters." },
  { date: "1996-08-09", type: "movie", title: "Escape from L.A.", note: "John Carpenter's Escape from L.A. has just opened." },
  { date: "1996-08-10", type: "music", title: "Oasis at Knebworth", note: "Oasis played enormous Knebworth shows on August 10 and 11." },
  { date: "1996-08-13", type: "tech", title: "Internet Explorer 3.0", note: "Microsoft has released Internet Explorer 3.0 for Windows as a free download." },
  { date: "1996-08-16", type: "movie", title: "Tin Cup", note: "Tin Cup, starring Kevin Costner and Rene Russo, has just opened." },
  { date: "1996-09-29", type: "game", title: "Nintendo 64 launches in the U.S.", note: "Nintendo 64 and Super Mario 64 are now on U.S. store shelves." },
  { date: "1996-11-05", type: "event", title: "U.S. presidential election", note: "Bill Clinton has won reelection as U.S. president." },
  { date: "1996-11-15", type: "movie", title: "Space Jam", note: "Space Jam has opened in U.S. theaters." },
  { date: "1996-12-20", type: "movie", title: "Scream", note: "Scream has opened in U.S. theaters." }
];

function pad(n) {
  return String(n).padStart(2, "0");
}

export function mirrorDateKey(now = Date.now()) {
  const c = calendarContext(now, "PT");
  return `${MIRROR_YEAR}-${pad(c.month)}-${pad(c.day)}`;
}

function addDaysKey(key, amount) {
  const [year, month, day] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  d.setUTCDate(d.getUTCDate() + amount);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function uniqueBy(items, keyFn, max = 20) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/json",
      "User-Agent": "AOLChatroom1996/0.8 (historical culture context; public fan project)",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchTv(dateKey) {
  // TVMaze's public schedule endpoint accepts historical ISO dates. We sample today,
  // yesterday, and one week ago so the AI has real recent episode context without
  // hammering the service on every chat turn.
  const dates = [dateKey, addDaysKey(dateKey, -1), addDaysKey(dateKey, -7)];
  const settled = await Promise.allSettled(
    dates.map((date) => fetchJson(`https://api.tvmaze.com/schedule?country=US&date=${date}`))
  );
  const rows = [];
  for (const result of settled) {
    if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
    for (const episode of result.value) {
      const show = episode?.show?.name;
      if (!show) continue;
      rows.push({
        type: "tv",
        date: episode.airdate || "",
        show,
        episode: episode.name || "",
        network: episode?.show?.network?.name || "",
        airtime: episode.airtime || ""
      });
    }
  }
  return uniqueBy(rows, (row) => `${row.date}:${row.show}:${row.episode}`, 18);
}

function wikidataDateRangeQuery({ start, end, mode }) {
  const range = `FILTER(?date >= \"${start}T00:00:00Z\"^^xsd:dateTime && ?date <= \"${end}T23:59:59Z\"^^xsd:dateTime)`;
  if (mode === "movies") {
    return `SELECT DISTINCT ?item ?itemLabel ?date ?sitelinks WHERE {
      ?item wdt:P31 wd:Q11424 ; wdt:P577 ?date ; wikibase:sitelinks ?sitelinks .
      ${range}
      FILTER(?sitelinks > 12)
      SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". }
    } ORDER BY DESC(?sitelinks) DESC(?date) LIMIT 16`;
  }
  return `SELECT DISTINCT ?item ?itemLabel ?date ?sitelinks WHERE {
    ?item wikibase:sitelinks ?sitelinks .
    { ?item wdt:P585 ?date . } UNION { ?item wdt:P580 ?date . }
    ${range}
    FILTER(?sitelinks > 35)
    SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". }
  } ORDER BY DESC(?sitelinks) DESC(?date) LIMIT 12`;
}

async function fetchWikidataWindow(dateKey, mode) {
  const start = addDaysKey(dateKey, mode === "movies" ? -45 : -30);
  const query = wikidataDateRangeQuery({ start, end: dateKey, mode });
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);
  const bindings = data?.results?.bindings || [];
  const rows = bindings.map((row) => ({
    type: mode === "movies" ? "movie" : "event",
    date: String(row?.date?.value || "").slice(0, 10),
    title: row?.itemLabel?.value || "",
    sitelinks: Number(row?.sitelinks?.value || 0)
  })).filter((row) => row.title && !/^Q\d+$/.test(row.title));
  return uniqueBy(rows, (row) => `${row.date}:${row.title}`, mode === "movies" ? 12 : 8);
}

function recentAnchors(dateKey) {
  const start = addDaysKey(dateKey, -60);
  return ANCHORS
    .filter((row) => row.date <= dateKey && row.date >= start)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function fallbackAnchors(dateKey) {
  return ANCHORS
    .filter((row) => row.date <= dateKey)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
}

export async function fetchCultureContext(now = Date.now()) {
  const dateKey = mirrorDateKey(now);
  const [tvResult, movieResult, eventResult] = await Promise.allSettled([
    fetchTv(dateKey),
    fetchWikidataWindow(dateKey, "movies"),
    fetchWikidataWindow(dateKey, "events")
  ]);

  return {
    dateKey,
    fetchedAt: Date.now(),
    tv: tvResult.status === "fulfilled" ? tvResult.value : [],
    movies: movieResult.status === "fulfilled" ? movieResult.value : [],
    events: eventResult.status === "fulfilled" ? eventResult.value : [],
    anchors: recentAnchors(dateKey).length ? recentAnchors(dateKey) : fallbackAnchors(dateKey),
    sources: {
      tvmaze: tvResult.status === "fulfilled",
      wikidataMovies: movieResult.status === "fulfilled",
      wikidataEvents: eventResult.status === "fulfilled"
    }
  };
}

export async function getCultureContext(storage, now = Date.now()) {
  const dateKey = mirrorDateKey(now);
  try {
    const cached = await storage?.get?.(CACHE_KEY);
    if (cached?.dateKey === dateKey && Date.now() - Number(cached.fetchedAt || 0) < CACHE_MS) return cached;
  } catch {}

  let context;
  try {
    context = await fetchCultureContext(now);
  } catch {
    context = { dateKey, fetchedAt: Date.now(), tv: [], movies: [], events: [], anchors: fallbackAnchors(dateKey), sources: {} };
  }

  try { await storage?.put?.(CACHE_KEY, context); } catch {}
  return context;
}

function listLines(items, formatter, max) {
  return items.slice(0, max).map(formatter).filter(Boolean);
}

export function culturePrompt(context) {
  if (!context) return "";
  const lines = [
    `HISTORICAL CULTURE FEED FOR ${context.dateKey}:`,
    "Treat this as chronology, not a checklist. Characters may naturally know or discuss these things, but should not all mention them.",
    "CRITICAL: never speak as if a movie, game, product, episode, event, or outcome after this date has already happened. Future knowledge does not exist."
  ];

  const anchors = listLines(context.anchors || [], (row) => `- ${row.date} [${row.type}] ${row.title}: ${row.note}`, 10);
  if (anchors.length) lines.push("RECENT / ESTABLISHED CULTURAL ANCHORS:", ...anchors);

  const movies = listLines(context.movies || [], (row) => `- ${row.date}: ${row.title}`, 8);
  if (movies.length) lines.push("MOVIES WITH RECENT RELEASE-DATE DATA:", ...movies);

  const tv = listLines(context.tv || [], (row) => {
    const episode = row.episode ? ` — \"${row.episode}\"` : "";
    const network = row.network ? ` (${row.network})` : "";
    return `- ${row.date}: ${row.show}${episode}${network}`;
  }, 10);
  if (tv.length) lines.push("U.S. TV EPISODES IN THE SAMPLED RECENT SCHEDULE:", ...tv);

  const events = listLines(context.events || [], (row) => `- ${row.date}: ${row.title}`, 6);
  if (events.length) lines.push("OTHER RECENT DATE-TIED EVENTS:", ...events);

  lines.push(
    "Use era context casually: one person may have seen something while another has not; people can be wrong, bored by it, or unaware.",
    "Do not turn the room into trivia. A cultural reference should arise because it fits the character, conversation, location, or recent event."
  );
  return lines.join("\n");
}

function before(dateKey, threshold) {
  return dateKey < threshold;
}

export function historicallyAllowedText(text, dateKey) {
  const value = String(text || "");

  // Pre-release magazine chatter is allowed, but lines that imply U.S. ownership/play
  // are blocked until the actual U.S. launch date.
  if (before(dateKey, "1996-09-29") && /\b(got|have|bought|playing|played|find|found|own|controller|cartridge|wave race|mario 64)\b.{0,24}\b(n64|nintendo 64)\b|\b(n64|nintendo 64)\b.{0,24}\b(got|have|bought|playing|played|find|found|own|controller|cartridge|wave race|mario 64)\b/i.test(value)) return false;
  if (before(dateKey, "1996-06-22") && /\bquake\b/i.test(value) && !/coming|preview|demo|screenshot|magazine/i.test(value)) return false;
  if (before(dateKey, "1996-08-13") && /\b(internet explorer 3|ie3)\b/i.test(value) && !/coming|beta|preview/i.test(value)) return false;
  if (before(dateKey, "1996-11-15") && /\bspace jam\b/i.test(value) && /saw|seen|movie was|just watched|in theaters|opened/i.test(value)) return false;
  if (before(dateKey, "1996-12-20") && /\bscream\b/i.test(value) && /saw|seen|movie was|just watched|in theaters|opened/i.test(value)) return false;
  return true;
}
