const COMMON_MISSPELLINGS = {
  definitely: "definately",
  weird: "wierd",
  because: "becuase",
  friend: "freind",
  friends: "freinds",
  remember: "remeber",
  probably: "probly",
  tomorrow: "tomorow",
  really: "realy",
  separate: "seperate",
  receive: "recieve",
  favorite: "faverite",
  happened: "happend",
  believe: "beleive",
  ridiculous: "rediculous",
  available: "availible",
  interesting: "intresting",
  something: "somthing",
  someone: "somone",
  their: "thier",
  before: "befor",
  enough: "enuf"
};

const KEY_NEIGHBORS = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "ersfcx", e: "wsdr", f: "rtgdvc",
  g: "tyfhvb", h: "yugjbn", i: "ujko", j: "uikhmn", k: "ijolm", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz",
  t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx"
};

const PROTECTED = new Set([
  "aol", "html", "bbs", "dos", "os/2", "quake", "doom", "netscape", "geocities",
  "metallica", "playstation", "saturn", "nintendo", "friends", "seinfeld", "xfiles",
  "x-files", "mtv", "cd", "vhs"
]);

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function eligibleWord(word) {
  const bare = String(word || "").replace(/[^A-Za-z]/g, "");
  return bare.length >= 4 && !PROTECTED.has(bare.toLowerCase());
}

function mutateWord(word) {
  const match = String(word).match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
  if (!match) return word;
  const [, prefix, letters, suffix] = match;
  const lower = letters.toLowerCase();

  if (COMMON_MISSPELLINGS[lower] && Math.random() < 0.42) {
    return `${prefix}${COMMON_MISSPELLINGS[lower]}${suffix}`;
  }

  if (letters.length < 4) return word;
  const chars = letters.split("");
  const mode = Math.random();

  if (mode < 0.42) {
    const i = 1 + Math.floor(Math.random() * Math.max(1, chars.length - 2));
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  } else if (mode < 0.68) {
    const i = 1 + Math.floor(Math.random() * Math.max(1, chars.length - 2));
    chars.splice(i, 1);
  } else if (mode < 0.87) {
    const i = Math.floor(Math.random() * chars.length);
    const key = chars[i].toLowerCase();
    const neighbors = KEY_NEIGHBORS[key];
    if (neighbors) chars[i] = pick(neighbors);
  } else {
    const i = Math.floor(Math.random() * chars.length);
    chars.splice(i, 0, chars[i]);
  }

  return `${prefix}${chars.join("")}${suffix}`;
}

function removeApostrophes(text, amount) {
  if (Math.random() >= amount) return text;
  return text.replace(/\b(i['’]m|don['’]t|can['’]t|won['’]t|doesn['’]t|isn['’]t|aren['’]t|didn['’]t|wasn['’]t|that['’]s|what['’]s|it['’]s|you['’]re|they['’]re|we['’]re)\b/gi, (m) => m.replace(/['’]/g, ""));
}

function applyShorthand(text, character) {
  const habits = new Set((character?.typing?.habits || []).map((x) => String(x).toLowerCase()));
  const casual = character?.typing?.punctuation === "none" || (character?.typing?.typoRate || 0) >= 0.09;
  if (!casual && !habits.has("u")) return text;

  let out = text;
  if ((habits.has("u") || Math.random() < 0.16) && Math.random() < 0.45) out = out.replace(/\byou\b/gi, "u");
  if (Math.random() < 0.18) out = out.replace(/\byour\b/gi, "ur");
  if (Math.random() < 0.12) out = out.replace(/\bare\b/gi, "r");
  if (Math.random() < 0.10) out = out.replace(/\bpeople\b/gi, "ppl");
  if (Math.random() < 0.08) out = out.replace(/\bbecause\b/gi, "cuz");
  return out;
}

export function applyTypingStyle(character, input) {
  if (!character || !input) return input;
  const typing = character.typing || {};
  let text = String(input);

  if (typing.case === "lower") text = text.toLowerCase();

  if (typing.punctuation === "none") {
    text = removeApostrophes(text, 0.82);
    text = text.replace(/[.,;:]+(?=\s|$)/g, "").replace(/[.!]+$/g, "");
  } else if (typing.punctuation === "low") {
    text = removeApostrophes(text, 0.58);
    if (Math.random() < 0.68) text = text.replace(/[.,]+$/g, "");
  } else {
    text = removeApostrophes(text, 0.18);
  }

  text = applyShorthand(text, character);

  const rate = clamp(Number(typing.typoRate || 0.04), 0, 0.18);
  const lineTypoChance = clamp(rate * 4.1, 0.04, 0.58);
  if (Math.random() < lineTypoChance) {
    const words = text.split(/(\s+)/);
    const candidates = [];
    for (let i = 0; i < words.length; i += 2) {
      if (eligibleWord(words[i])) candidates.push(i);
    }
    if (candidates.length) {
      const i = pick(candidates);
      words[i] = mutateWord(words[i]);

      if (rate >= 0.11 && candidates.length >= 5 && Math.random() < 0.10) {
        const secondChoices = candidates.filter((idx) => idx !== i);
        const j = pick(secondChoices);
        words[j] = mutateWord(words[j]);
      }
      text = words.join("");
    }
  }

  return text.replace(/\s{2,}/g, " ").trim();
}
