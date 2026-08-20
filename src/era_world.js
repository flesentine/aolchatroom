const FUTURE_WORLD_TERMS = /\b(?:iphone|ipad|ipod|smartphone|android|blackberry|airpods?|bluetooth|wi-?fi|youtube|facebook|myspace|twitter|instagram|snapchat|tiktok|reddit|wikipedia|gmail|google|spotify|netflix|discord|twitch|uber|lyft|facetime|dropbox|podcast|social media|hashtag|selfie|emoji|vlog|blogger|influencer|followers?|went viral|viral video|app store|streaming|streamed|stream it|cloud storage)\b/i;

const PHONE_SCREEN_ACTION = /(?:\b(?:saw|seen|watch(?:ed|ing)?|read|look(?:ed|ing)?|checked|brows(?:e|ed|ing)|surf(?:ed|ing)?|search(?:ed|ing)?|looked up|download(?:ed|ing)?|upload(?:ed|ing)?|open(?:ed|ing)?|view(?:ed|ing)?|play(?:ed|ing)?)\b.{0,45}\b(?:on|from|with)\s+(?:my|the|a|his|her|your|ur)\s+(?:cell\s*)?phone\b)|(?:\b(?:on|from)\s+(?:my|the|a|his|her|your|ur)\s+(?:cell\s*)?phone\b.{0,45}\b(?:video|movie|show|episode|website|web\s?page|picture|photo|pic|game|internet|email|e-mail)\b)/i;

const PHONE_CAMERA = /\b(?:took|take|taking|snapped|shot|send|sent)\b.{0,35}\b(?:photo|picture|pic|video)\b.{0,35}\b(?:phone|cell)\b|\b(?:phone|cell)\b.{0,35}\b(?:camera|photo|picture|pic|video)\b/i;
const PHONE_INTERNET = /\b(?:internet|web|aol|website|web\s?page|email|e-mail|online)\b.{0,35}\b(?:on|from|with)\s+(?:my|the|a|his|her|your|ur)\s+(?:cell\s*)?phone\b|\b(?:phone|cell)\b.{0,35}\b(?:internet|web|website|email|e-mail|online)\b/i;
const TEXTING = /\b(?:texted|texting|text message|text messages|send me a text|sent me a text|text me|txt me|txted|sms)\b/i;
const MOBILE_MEDIA = /\b(?:phone|cell)\b.{0,30}\b(?:screen|touchscreen|app|apps|browser|gps|map app|music video|movie|episode)\b/i;
const FUTURE_MEDIA_BEHAVIOR = /\b(?:stream(?:ed|ing)?|binge(?:d|ing)?|downloaded)\b.{0,30}\b(?:movie|movies|episode|episodes|tv show|season)\b/i;

export function eraWorldViolation(text, dateKey = "1996-01-01") {
  const value = String(text || "");
  if (!value) return "empty";
  if (FUTURE_WORLD_TERMS.test(value)) return "future-term";
  if (PHONE_SCREEN_ACTION.test(value)) return "phone-used-as-screen";
  if (PHONE_CAMERA.test(value)) return "phone-used-as-camera";
  if (PHONE_INTERNET.test(value)) return "phone-used-for-internet";
  if (TEXTING.test(value)) return "modern-texting";
  if (MOBILE_MEDIA.test(value)) return "modern-mobile-affordance";
  if (FUTURE_MEDIA_BEHAVIOR.test(value)) return "modern-media-consumption";

  // DVD players reached Japan in late 1996 and the U.S. in 1997. Before then,
  // casual U.S. ownership/rental language is future leakage.
  if (dateKey < "1996-11-01" && /\bdvd\b/i.test(value)) return "dvd-too-early";
  if (dateKey < "1996-09-29" && /\b(?:n64|nintendo 64|mario 64|wave race)\b/i.test(value) && /\b(?:mine|my|got|have|own|bought|playing|played|rent|rented)\b/i.test(value)) return "n64-us-access-too-early";
  return "";
}

export function eraWorldAllowed(text, dateKey = "1996-01-01") {
  return !eraWorldViolation(text, dateKey);
}

export function eraWorldPrompt(dateKey = "1996-01-01") {
  return `HARD WORLD BOUNDARY — ${dateKey}:\n- This is not a modern person pretending to be in 1996. Every character's entire lived world and assumptions stop at this 1996 date. They have no mental model of later consumer technology or later Internet culture.\n- A phone is a TELEPHONE. It can ring, make calls, have call waiting, be cordless, be a pager-adjacent part of life, or in some cases be a cellular phone used for CALLS. It is not a little computer.\n- Nobody watches video, looks at pictures, browses the Web, reads a site, checks AOL, searches, plays media, takes photos, or gets entertainment 'on my phone'. A line like 'i saw it on my phone' is impossible here.\n- No texting/SMS culture, camera phones, smartphones, phone apps, GPS phone maps, streaming, social media, Wi-Fi, Bluetooth, podcasts, emoji, hashtags, selfies, DMs, followers, likes, viral videos, or modern mobile behavior.\n- For visual/media information, use period channels only when plausible: TV, VHS, movie theater, newspaper, magazine, radio, CD/cassette, a desktop computer, AOL, BBS, Usenet, or the Web on a computer.\n- If a human mentions a future product or behavior, characters do NOT suddenly understand it. They can be confused, ask what it means, think the person is joking, or interpret an ordinary 1996 meaning.\n- Do not 'translate' a modern behavior into a 1996 sentence while preserving the impossible behavior. The underlying action itself must be possible in 1996.\n- When uncertain, say less. Ignorance is period-correct; future knowledge is not.`;
}
