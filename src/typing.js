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
  happened: "happend",
  believe: "beleive",
  interesting: "intresting",
  something: "somthing",
  someone: "somone",
  their: "thier"
};

const SIGNATURE_GROUPS = [
  ["definitely", "weird", "because"],
  ["probably", "tomorrow", "really"],
  ["friend", "friends", "remember"],
  ["separate", "receive", "believe"],
  ["happened", "interesting", "something"],
  ["someone", "their", "because"]
];

const KEY_NEIGHBORS = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "ersfcx", e: "wsdr", f: "rtgdvc",
  g: "tyfhvb", h: "yugjbn", i: "ujko", j: "uikhmn", k: "ijolm", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz",
  t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx"
};

const PROTECTED = new Set([
  "aol", "html", "bbs", "dos", "os/2", "quake", "doom", "netscape", "geocities",
  "metallica", "playstation", "saturn", "nintendo", "friends", "seinfeld", "xfiles",
  "x-files", "mtv", "cd", "vhs", "windows", "yankees", "oasis", "blur"
]);

const HAPPY_FACES = [":)", ";)", ":P", "<g>", ":-)"];
const SAD_FACES = [":(", ":-("];
const pendingCorrections = new Map();

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function profileFor(character) {
  const rate = clamp(Number(character?.typing?.typoRate || 0.04), 0, 0.18);
  const hash = hashString(character?.name || "guest");
  const modes = rate <= 0.03
    ? ["known"]
    : rate <= 0.07
      ? ["known", "transpose"]
      : rate <= 0.10
        ? ["transpose", "drop", "known"]
        : ["transpose", "drop", "neighbor", "known"];
  return {
    rate,
    mutationMode: modes[hash % modes.length],
    signatures: SIGNATURE_GROUPS[(hash >>> 3) % SIGNATURE_GROUPS.length]
  };
}

function eligibleWord(word) {
  const bare = String(word || "").replace(/[^A-Za-z]/g, "");
  return bare.length >= 5 && !PROTECTED.has(bare.toLowerCase());
}

function mutateByMode(letters, mode) {
  const chars = letters.split("");
  if (chars.length < 5) return letters;

  if (mode === "drop") {
    const i = 1 + Math.floor(Math.random() * Math.max(1, chars.length - 2));
    chars.splice(i, 1);
  } else if (mode === "neighbor") {
    const candidates = [];
    for (let i = 0; i < chars.length; i += 1) {
      if (KEY_NEIGHBORS[chars[i].toLowerCase()]) candidates.push(i);
    }
    if (!candidates.length) return letters;
    const i = pick(candidates);
    const neighbors = KEY_NEIGHBORS[chars[i].toLowerCase()];
    chars[i] = pick(neighbors);
  } else {
    // Transposed interior letters are the most common-looking accidental typo,
    // so this is also the fallback for careful typers.
    const maxStart = Math.max(1, chars.length - 2);
    const i = 1 + Math.floor(Math.random() * maxStart);
    if (i >= chars.length - 1) return letters;
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  }
  return chars.join("");
}

function mutateWord(word, character) {
  const match = String(word).match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
  if (!match) return { text: word, correction: "" };
  const [, prefix, letters, suffix] = match;
  const lower = letters.toLowerCase();
  const profile = profileFor(character);

  // Each person has a small recurring set of believable spelling habits. This
  // makes mistakes recognizable instead of looking like a generic typo filter.
  if (profile.signatures.includes(lower) && COMMON_MISSPELLINGS[lower] && Math.random() < 0.78) {
    return {
      text: `${prefix}${COMMON_MISSPELLINGS[lower]}${suffix}`,
      correction: lower
    };
  }

  // Non-signature dictionary mistakes can still happen, but only rarely.
  if (COMMON_MISSPELLINGS[lower] && Math.random() < 0.16) {
    return {
      text: `${prefix}${COMMON_MISSPELLINGS[lower]}${suffix}`,
      correction: lower
    };
  }

  if (profile.mutationMode === "known") return { text: word, correction: "" };
  const mutated = mutateByMode(letters, profile.mutationMode);
  if (mutated === letters) return { text: word, correction: "" };
  return { text: `${prefix}${mutated}${suffix}`, correction: lower };
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
  const uChance = habits.has("u") ? 0.40 : 0.08;
  if (Math.random() < uChance) out = out.replace(/\byou\b/gi, "u");
  if (Math.random() < 0.08) out = out.replace(/\byour\b/gi, "ur");
  if (Math.random() < 0.05) out = out.replace(/\bare\b/gi, "r");
  if (Math.random() < 0.04) out = out.replace(/\bpeople\b/gi, "ppl");
  if (Math.random() < 0.04) out = out.replace(/\bbecause\b/gi, "cuz");
  return out;
}

function applyEraCaps(text, character) {
  const personality = character?.personality || {};
  const argumentative = Number(personality.argumentative || 0.4);
  let out = text;

  // Do not randomly capitalize one arbitrary word. Full-line shouting remains
  // possible, but mostly when the line itself already feels heated/excited.
  const heated = /(?:!!|\bwtf\b|\bno way\b|\bshut up\b|\bseriously\b)/i.test(out);
  const shoutChance = heated ? 0.004 + argumentative * 0.010 : 0.0015;
  if (out.length <= 88 && Math.random() < shoutChance) out = out.toUpperCase();

  if (/\blol\b/i.test(out) && Math.random() < 0.10) out = out.replace(/\blol\b/i, "LOL");
  return out;
}

function applyEraEmoticon(text, character) {
  if (/(?:^|\s)(?:[:;]-?[)(Pp]|<g>|:>)(?:\s|$)/.test(text)) return text;
  const personality = character?.personality || {};
  const sociability = Number(personality.sociability || 0.5);
  const sarcasm = Number(personality.sarcasm || 0.4);
  const chance = 0.014 + sociability * 0.032 + sarcasm * 0.008;
  if (Math.random() >= chance) return text;

  const negative = /\b(sucks|ugh|hate|awful|terrible|sorry|sad|lost|broke|mad)\b/i.test(text);
  const teasing = /\b(lol|haha|nerd|loser|whatever|sure|right)\b/i.test(text);
  const face = negative && Math.random() < 0.55 ? pick(SAD_FACES) : teasing ? pick([";)", ":P", "<g>", ":)"]) : pick(HAPPY_FACES);
  return `${text} ${face}`;
}

function naturalTypoChance(character, text) {
  const rate = profileFor(character).rate;
  let chance = 0.018 + rate * 0.60;
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;

  // Short, simple messages are less likely to contain a conspicuous mistake.
  if (words <= 4) chance *= 0.55;
  // Longer thoughtful replies are usually typed a little more carefully.
  if (words >= 14) chance *= 0.78;
  // Excited/argumentative bursts are the one place mistakes rise naturally.
  if (/(?:!!|\bwtf\b|\bomg\b|\bhaha\b|\blol\b)/i.test(text)) chance *= 1.25;

  return clamp(chance, 0.012, rate >= 0.11 ? 0.11 : 0.085);
}

function maybePrefixCorrection(character, text) {
  const name = String(character?.name || "");
  if (!name) return text;
  const pending = pendingCorrections.get(name);
  if (!pending) return text;
  pendingCorrections.delete(name);
  if (Date.now() - pending.at > 25000) return text;
  return `*${pending.word} ${text}`;
}

export function typingStyleDebug(character) {
  if (!character) return null;
  const profile = profileFor(character);
  return {
    name: character.name,
    configuredTypoRate: profile.rate,
    ordinaryLineTypoChancePct: Math.round(naturalTypoChance(character, "just a normal sentence about something ordinary") * 1000) / 10,
    shortLineTypoChancePct: Math.round(naturalTypoChance(character, "morning man") * 1000) / 10,
    mutationMode: profile.mutationMode,
    recurringSpellings: profile.signatures.filter((word) => COMMON_MISSPELLINGS[word]).map((word) => `${word}→${COMMON_MISSPELLINGS[word]}`),
    arbitrarySingleWordCaps: false,
    rareNextMessageSelfCorrection: true
  };
}

export function applyTypingStyle(character, input) {
  if (!character || !input) return input;
  const typing = character.typing || {};
  let text = String(input);

  text = maybePrefixCorrection(character, text);

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

  const typoChance = naturalTypoChance(character, text);
  if (Math.random() < typoChance) {
    const words = text.split(/(\s+)/);
    const candidates = [];
    for (let i = 0; i < words.length; i += 2) {
      if (eligibleWord(words[i])) candidates.push(i);
    }
    if (candidates.length) {
      // Prefer the person's recurring spelling fingerprints when one of those
      // words happens to be present; otherwise make at most one restrained slip.
      const profile = profileFor(character);
      const signatureCandidates = candidates.filter((i) => {
        const bare = words[i].replace(/[^A-Za-z]/g, "").toLowerCase();
        return profile.signatures.includes(bare);
      });
      const i = signatureCandidates.length ? pick(signatureCandidates) : pick(candidates);
      const original = words[i].replace(/[^A-Za-z]/g, "").toLowerCase();
      const mutation = mutateWord(words[i], character);
      words[i] = mutation.text;
      text = words.join("");

      // Very rarely, remember the slip long enough for that same person to type
      // a natural *correction at the start of their next message. If they do not
      // speak again promptly, the correction silently expires.
      if (mutation.correction && mutation.text !== original && Math.random() < 0.045) {
        pendingCorrections.set(character.name, { word: mutation.correction, at: Date.now() });
      }
    }
  }

  text = applyEraCaps(text, character);
  text = applyEraEmoticon(text, character);
  return text.replace(/\s{2,}/g, " ").trim();
}
