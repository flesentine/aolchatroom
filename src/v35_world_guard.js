import { simulatedCutoff, timelineEventsThrough } from "./historical_knowledge_v27.js";

const PERSONAL_LOCAL = /\b(?:my|our)\s+(?:boss|coworker|co-worker|friend|roommate|store|job|school|class|car|apartment|house|family|sister|brother|mom|dad|customer|manager)\b/i;
const PERSONAL_ACQUIRE = /\b(?:i|we)\s+(?:just\s+)?(?:bought|got|rented|picked up|borrowed|found)\b/i;
const PRIVATE_GENERIC_PLAN = /\b(?:i|im|i'm|we|we're|were)\s+(?:am\s+|are\s+)?(?:gonna|going to|might|may|probably|planning to|plan to|wanna|want to)\b.{0,55}\b(?:a|some|another)\s+(?:concert|show|movie|festival|gig|club|party|game)\b/i;
const PRIVATE_RESULT = /\b(?:i|we|my|our)\b.{0,45}\b(?:won|beat|lost|score|game|match|league|tournament)\b/i;
const PUBLIC_THING = /\b(?:patch|update|version|episode|season|map|product|console|game|album|movie|film|show|browser|software|hardware|graphics card|video card|chip|modem|service|coffee bean|tour|concert|festival|premiere|release|driver|match|series|tournament|election|poll)\b/i;
const PUBLIC_NOVELTY = /\b(?:(?:the|this)\s+new|new\s+(?:patch|update|version|episode|season|map|product|console|game|album|movie|film|show|browser|software|hardware|graphics card|video card|chip|modem|service|coffee bean|tour|festival|release)|latest|just\s+(?:released|launched|premiered|announced|opened)|(?:heard|hear).{0,28}\b(?:new|latest|patch|release|episode|festival|concert)\b)\b/i;
const RELATIVE_SCHEDULE = /\b(?:tomorrow|tonight|this weekend|next week)\b/i;
const SPECIFIC_PATCH_FEATURE = /(?:\b(?:patch|update|version|map|driver)\b.{0,90}\b(?:fix(?:es|ed)?|add(?:s|ed)?|music|audio|track|netcode|lag|framerate|frame rate|speed|rocket jump|performance|glitch|feature)\b|\b(?:fix(?:es|ed)?|add(?:s|ed)?|music|audio|track|netcode|lag|framerate|frame rate|speed|rocket jump|performance|glitch)\b.{0,90}\b(?:patch|update|version|map|driver)\b)/i;
const PATCH_CONTEXT_FEATURE = /\b(?:ran it|installed|with it installed|speed increased|low pings?|glitches?|netcode|lag|framerate|frame rate|rocket jump|audio track|sound fx|ambient tracks?|performance)\b/i;
const PUBLIC_RESULT = /(?:\b(?:game|match|series|team|finals|championship|tournament|election|race|poll)\b.{0,65}\b(?:won|beat|defeated|clinched|swept|score|elected)\b|\b(?:won|beat|defeated|clinched|swept|elected)\b.{0,65}\b(?:game|match|series|team|finals|championship|tournament|election|race|poll)\b|\b(?:final score|score was)\b.{0,30}\b\d{1,3}\s*[-–]\s*\d{1,3}\b)/i;
const PUBLIC_BASEBALL_TEAM = /\b(?:yankees|mets|red sox|orioles|blue jays|tigers|indians|brewers|white sox|twins|royals|rangers|mariners|angels|athletics|braves|marlins|expos|phillies|pirates|cardinals|cubs|reds|astros|dodgers|giants|padres|rockies)\b/gi;
const PUBLIC_SPORTS_THREAD = /\b(?:late game|game last night|last night(?:'s)? game|pro game|major league|mlb|nba|nfl|nhl|yankees|mets|red sox|orioles|blue jays|tigers|indians|brewers|white sox|twins|royals|rangers|mariners|angels|athletics|braves|marlins|expos|phillies|pirates|cardinals|cubs|reds|astros|dodgers|giants|padres|rockies)\b/i;
const PUBLIC_SPORTS_DETAIL = /\b(?:\d{1,2}\s+innings?|extra innings?|bottom of (?:the )?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|\d+(?:st|nd|rd|th))|top of (?:the )?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|\d+(?:st|nd|rd|th))|bullpen|pitching changes?|walk[- ]off|no[- ]hitter|shutout|overtime|double overtime|triple overtime)\b/i;
const QUESTIONISH = /^\s*(?:did|do|does|is|are|has|have|can|could|would|what|when|where|who|why|how|anyone|anybody)\b|\?/i;
const SPECULATION = /\b(?:maybe|might|could|rumou?r|supposed to|coming|preview|demo|heard anything|any new|think)\b/i;
const ASSERTIVE_AVAILABLE = /\b(?:got|have|has|own|owns|bought|using|installed|playing|played|ran|runs|available|out now|released|launched|in stores|on shelves|ships|shipping)\b/i;

const LEGACY_CONTAMINATION = [
  /\bnew\s+(?:coffee\s+)?bean\b.{0,80}\b(?:chocolate|flavou?r|tasc)\b/i,
  /\b(?:chocolate|flavou?r)\b.{0,60}\bnew\s+(?:coffee\s+)?bean\b/i
];

const FUTURE_GATES = [
  ["1996-09-19", "Friends season 3 first-run episodes", [/\bfriends\b/i], /\b(?:new|next|season\s*3|episode)\b/i],
  ["1996-09-19", "Seinfeld season 8 first-run episodes", [/\bseinfeld\b/i], /\b(?:new|next|season\s*8|episode)\b/i],
  ["1996-09-26", "ER season 3 first-run episodes", [/\ber\b/i], /\b(?:new|next|season\s*3|episode)\b/i],
  ["1996-10-01", "consumer 3dfx Voodoo Graphics cards", [/\bvoodoo graphics\b/i, /\b3dfx\b.{0,30}\bvoodoo\b/i, /\bvoodoo\b.{0,20}\b(?:graphics|card)\b/i], ASSERTIVE_AVAILABLE],
  ["1996-10-04", "The X-Files season 4 first-run episodes", [/\bx[- ]?files\b/i], /\b(?:new|next|season\s*4|episode)\b/i],
  ["1996-11-14", "Tomb Raider U.S. PlayStation release", [/\btomb raider\b/i], ASSERTIVE_AVAILABLE],
  ["1996-12-31", "Diablo release", [/\bdiablo\b/i], ASSERTIVE_AVAILABLE],
  ["1997-01-22", "GLQuake public release", [/\bglquake\b/i], null]
];

const PATCH_DETAIL_CUES = [
  /\bnetcode\b/i,
  /\blag\b/i,
  /\bframerate\b|\bframe rate\b/i,
  /\bmusic\b|\baudio\b|\btrack\b|\bsound fx\b/i,
  /\bspeed\b/i,
  /\brocket jump(?:ing)?\b/i,
  /\bperformance\b/i,
  /\bglitch(?:es)?\b/i,
  /\bfix(?:es|ed)?\b/i,
  /\badd(?:s|ed)?\b/i
];

function compact(value, max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function tomorrowDateKey(now) {
  const cutoff = simulatedCutoff(now);
  return new Date(new Date(`${cutoff.dateKey}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
}

function tokens(value) {
  const stop = new Set(["this","that","with","from","about","have","just","they","their","there","what","when","your","new","latest","tomorrow","tonight"]);
  return String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !stop.has(w));
}

function supportRows(culture, now, futureDate = "") {
  const cutoff = simulatedCutoff(now);
  const rows = timelineEventsThrough(cutoff, 3650).map((r) => ({ date: r.date || "", text: `${r.title || ""} ${r.note || ""}` }));
  for (const group of [culture?.events, culture?.movies, culture?.tv, culture?.anchors]) {
    for (const r of group || []) {
      const date = String(r?.date || "").slice(0, 10);
      if (!date || (date > cutoff.dateKey && date !== futureDate)) continue;
      rows.push({ date, text: `${r?.title || ""} ${r?.show || ""} ${r?.episode || ""} ${r?.note || ""} ${r?.detail || ""} ${r?.description || ""}` });
    }
  }
  return rows;
}

function overlap(a, b) {
  const aa = new Set(tokens(a));
  const bb = tokens(b);
  let n = 0;
  for (const t of bb) if (aa.has(t)) n += 1;
  return { n, size: bb.length };
}

function rowSupported(text, row) {
  const x = overlap(text, row.text);
  return x.n >= (x.size <= 1 ? 1 : 2);
}

function supported(text, culture, now, futureDate = "") {
  for (const row of supportRows(culture, now, futureDate)) {
    if (futureDate && row.date !== futureDate) continue;
    if (rowSupported(text, row)) return true;
  }
  return false;
}

function supportedPatchDetail(text, culture, now) {
  const cues = PATCH_DETAIL_CUES.filter((re) => re.test(text));
  if (!cues.length) return false;
  for (const row of supportRows(culture, now)) {
    if (!rowSupported(text, row)) continue;
    if (cues.some((re) => re.test(row.text))) return true;
  }
  return false;
}

function baseballTeamCount(text) {
  return (String(text || "").match(PUBLIC_BASEBALL_TEAM) || []).length;
}

function hardFuture(text, now) {
  const cutoff = simulatedCutoff(now).dateKey;
  for (const [date, title, aliases, requires] of FUTURE_GATES) {
    if (cutoff >= date || !aliases.some((re) => re.test(text)) || (requires && !requires.test(text))) continue;
    const speculative = QUESTIONISH.test(text) || SPECULATION.test(text);
    const impliesAvailable = ASSERTIVE_AVAILABLE.test(text)
      || /\b(?:new|next)\b.{0,30}\bepisode\s+(?:tomorrow|tonight)\b/i.test(text)
      || /\bseason\s*\d+\s+(?:starts|is on|premiere|premieres)\b/i.test(text);
    if (speculative && !impliesAvailable) continue;
    return { kind: "future-public-claim", title, notBefore: date, text: compact(text, 180) };
  }
  return null;
}

export function publicWorldViolation(text, culture, now = Date.now(), recentContext = "") {
  const value = compact(text, 320);
  if (!value) return null;
  const future = hardFuture(value, now);
  if (future) return future;
  if (LEGACY_CONTAMINATION.some((re) => re.test(value))) {
    return { kind: "unsupported-public-claim", reason: "legacy fabricated public product", text: compact(value, 180) };
  }

  const personal = PERSONAL_LOCAL.test(value) || PERSONAL_ACQUIRE.test(value);
  if (personal) return null;
  if (PRIVATE_GENERIC_PLAN.test(value) && !PUBLIC_NOVELTY.test(value)) return null;
  if (PRIVATE_RESULT.test(value)) return null;

  const question = QUESTIONISH.test(value);
  const speculative = SPECULATION.test(value);
  const context = String(recentContext || "");
  const recentPatch = /\b(?:patch|update|new map|new version)\b/i.test(context);
  const publicSportsContext = PUBLIC_SPORTS_THREAD.test(value) || PUBLIC_SPORTS_THREAD.test(context) || baseballTeamCount(value) >= 2;

  if (SPECIFIC_PATCH_FEATURE.test(value)) {
    if (question) {
      if (recentPatch || supported(value, culture, now)) return null;
      return { kind: "unsupported-public-claim", reason: "question presupposes an ungrounded patch/update", text: compact(value, 180) };
    }
    if (!supportedPatchDetail(value, culture, now)) {
      return { kind: "unsupported-public-detail", reason: "specific patch/update feature lacks historical grounding", text: compact(value, 180) };
    }
  }
  if (recentPatch && PATCH_CONTEXT_FEATURE.test(value) && !question && !supportedPatchDetail(value, culture, now)) {
    return { kind: "unsupported-public-detail", reason: "continuation asserts an unsupported patch/update feature", text: compact(value, 180) };
  }
  if (publicSportsContext && PUBLIC_SPORTS_DETAIL.test(value) && !question && !supported(value, culture, now)) {
    return { kind: "unsupported-public-detail", reason: "specific professional-game detail lacks historical grounding", text: compact(value, 180) };
  }
  if (PUBLIC_RESULT.test(value) && !question && !supported(value, culture, now)) {
    return { kind: "unsupported-public-claim", reason: "public result/score lacks historical grounding", text: compact(value, 180) };
  }
  if (RELATIVE_SCHEDULE.test(value) && PUBLIC_THING.test(value)) {
    const tomorrow = /\btomorrow\b/i.test(value);
    if (!(tomorrow && supported(value, culture, now, tomorrowDateKey(now))) && !(question && speculative)) {
      return { kind: "unsupported-relative-schedule", reason: "public schedule is not grounded in dated context", text: compact(value, 180) };
    }
  }
  if (PUBLIC_NOVELTY.test(value) && PUBLIC_THING.test(value)) {
    if (question && !/\b(?:new|next)\b.{0,30}\bepisode\s+(?:tomorrow|tonight)\b/i.test(value)) return null;
    if (!supported(value, culture, now)) {
      return { kind: "unsupported-public-claim", reason: "public novelty claim lacks historical/culture grounding", text: compact(value, 180) };
    }
  }
  return null;
}

export function auditPublicHistory(history, culture, floor = 0) {
  const all = history || [];
  const violations = [];
  for (let i = 0; i < all.length; i += 1) {
    const row = all[i];
    if (row?.kind !== "bot" || Number(row.at || 0) < floor) continue;
    const context = all.slice(Math.max(0, i - 8), i).map((r) => r?.text || "").join(" ");
    const violation = publicWorldViolation(row.text, culture, Number(row.at || Date.now()), context);
    if (!violation) continue;
    violations.push({ at: row.at, from: row.from, text: compact(row.text, 180), ...violation });
  }
  return { checkedBotLines: all.filter((r) => r?.kind === "bot" && Number(r.at || 0) >= floor).length, violations: violations.length, examples: violations.slice(-8) };
}

export function v35Grade(score) {
  if (score >= 94) return "A";
  if (score >= 88) return "A-";
  if (score >= 82) return "B+";
  if (score >= 76) return "B";
  if (score >= 70) return "B-";
  if (score >= 63) return "C+";
  if (score >= 56) return "C";
  if (score >= 48) return "D";
  return "F";
}
