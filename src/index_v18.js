import baseWorker, { ChatRoom as SceneChatRoom } from "./index_v17.js";
import { getCharacter } from "./characters.js";

const ZONES = {
  PT: "America/Los_Angeles",
  MT: "America/Denver",
  CT: "America/Chicago",
  ET: "America/New_York"
};

const STRONG_LATE_NIGHT = /\b(?:i should go to bed|i should sleep|im going to bed|i'm going to bed|going to bed|gonna go to bed|gotta sleep|cant sleep|can't sleep|still awake|up this late|too late for this|goodnight|good night|nite all|nite guys|nite ppl)\b/i;
const AFTER_MIDNIGHT = /\b(?:after midnight|past midnight|room gets (?:weird|strange) after midnight|its after midnight|it's after midnight)\b/i;
const JUST_WOKE = /\b(?:just woke up|just got up|barely woke up)\b/i;
const GOOD_MORNING = /^(?:good morning|morning (?:all|guys|ppl|everyone)|mornin)\b/i;
const GOOD_AFTERNOON = /^good afternoon\b/i;
const GOOD_EVENING = /^good evening\b/i;
const PHONE_SCREEN_BEHAVIOR = /\b(?:saw|read|watched|looked up|look it up|browsed|downloaded|streamed|posted|clicked|opened)\b.{0,24}\b(?:on|with|from) (?:my |ur |your )?(?:cell ?phone|phone)\b|\b(?:text me|send me a text|dm me|phone app|app on my phone|camera phone|take a pic with my phone)\b/i;
const FUTURE_NETWORK_BEHAVIOR = /\b(?:wifi|wi-fi|social media|streaming service|podcast|smartphone|push notification|hashtag|viral video|google it)\b/i;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function zoneFor(character) {
  if (!character) return ZONES.PT;
  if (/phoenix/i.test(String(character.location || ""))) return "America/Phoenix";
  return ZONES[character.timezone] || ZONES.PT;
}

function localParts(character, now = Date.now()) {
  const zone = zoneFor(character);
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hourRaw = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  return { hour, minute, zone };
}

function localClockLabel(character, now = Date.now()) {
  const zone = zoneFor(character);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(now));
}

function daypart(hour) {
  if (hour < 5) return "overnight";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "late evening";
}

function inLateNight(hour) {
  return hour >= 20 || hour < 6;
}

function temporalLineAllowed(character, text, now = Date.now()) {
  if (!character) return true;
  const value = String(text || "").trim();
  if (!value) return false;
  const { hour } = localParts(character, now);

  if (STRONG_LATE_NIGHT.test(value) && !inLateNight(hour)) return false;
  if (AFTER_MIDNIGHT.test(value) && !(hour >= 0 && hour < 5)) return false;
  if (JUST_WOKE.test(value) && !(hour >= 4 && hour < 14)) return false;
  if (GOOD_MORNING.test(value) && !(hour >= 4 && hour < 12)) return false;
  if (GOOD_AFTERNOON.test(value) && !(hour >= 12 && hour < 18)) return false;
  if (GOOD_EVENING.test(value) && !(hour >= 17 && hour < 24)) return false;
  return true;
}

function worldLineAllowed(text) {
  const value = String(text || "");
  if (PHONE_SCREEN_BEHAVIOR.test(value)) return false;
  if (FUTURE_NETWORK_BEHAVIOR.test(value)) return false;
  return true;
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function terminalStyle(text, typing) {
  let value = String(text || "").trim();
  if (!typing || !value) return value;

  if (typing.case === "lower" && Math.random() < 0.78) {
    value = value.split(/(\s+)/).map((token) => {
      if (/^[A-Z0-9]{2,5}$/.test(token) && /^(?:AOL|MTV|CD|VHS|PC|LAN|HTML|DOS|BBS)$/i.test(token)) return token.toUpperCase();
      return token.toLowerCase();
    }).join("");
  }

  if (typing.punctuation === "none") value = value.replace(/[.;,:]+$/g, "");
  if (typing.punctuation === "low" && /\.$/.test(value) && Math.random() < 0.68) value = value.slice(0, -1);
  return value.trim();
}

function smallTypo(text, character) {
  const typing = character?.typing;
  if (!typing || !Number.isFinite(Number(typing.typoRate))) return text;
  const rate = clamp(Number(typing.typoRate) * 0.42, 0, 0.075);
  if (Math.random() >= rate) return text;

  const words = String(text || "").split(/(\s+)/);
  const candidates = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => /^[a-zA-Z]{5,10}$/.test(word));
  if (!candidates.length) return text;

  const seed = [...String(character.name || "")].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const chars = chosen.word.split("");
  const pos = 1 + ((seed + chars.length) % Math.max(1, chars.length - 2));
  const mode = seed % 3;

  if (mode === 0 && pos + 1 < chars.length) {
    [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
  } else if (mode === 1 && chars.length > 5) {
    chars.splice(pos, 1);
  } else {
    chars.splice(pos, 0, chars[pos]);
  }

  words[chosen.index] = chars.join("");
  return words.join("");
}

function shapeVoice(character, text) {
  if (!character) return String(text || "").trim();
  let value = String(text || "").trim();
  const typing = character.typing || {};
  const avgWords = Number(typing.avgWords || 7);
  const maxWords = Math.max(11, Math.round(avgWords * 2.1));
  if (wordCount(value) > maxWords) return "";
  value = terminalStyle(value, typing);
  value = smallTypo(value, character);
  return value;
}

export default baseWorker;

export class ChatRoom extends SceneChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.textureStats = {
      temporalRejected: 0,
      worldRejected: 0,
      voiceRejected: 0,
      voiceAdjusted: 0
    };
  }

  localTimePrompt(now = Date.now()) {
    this.ensureTalkers(now);
    const lines = (this.talkerNames || []).map((name) => {
      const character = getCharacter(name);
      if (!character) return `- ${name}: local time unknown`;
      const parts = localParts(character, now);
      return `- ${name}: ${localClockLabel(character, now)} ${character.timezone || ""} (${daypart(parts.hour)})`;
    });
    return `LOCAL CLOCKS:\n${lines.join("\n") || "- no active talkers"}\nImmediate time claims must fit the speaker's own clock. Do not say you are going to bed, cannot sleep, are up after midnight, or that it is too late unless that character's local time makes sense. Talking ABOUT plans for tonight or tomorrow is fine.`;
  }

  voicePrompt() {
    this.ensureTalkers(Date.now());
    const lines = (this.talkerNames || []).map((name) => {
      const character = getCharacter(name);
      const typing = character?.typing || {};
      const habits = Array.isArray(typing.habits) ? typing.habits.join(", ") : "none";
      return `- ${name}: case=${typing.case || "mixed"}; typical length≈${typing.avgWords || 7} words; punctuation=${typing.punctuation || "low"}; typo tendency=${Number(typing.typoRate || 0).toFixed(2)}; recurring habits=${habits}`;
    });
    return `TYPING FINGERPRINTS:\n${lines.join("\n") || "- no active talkers"}\nThese are tendencies, NOT gimmicks. Some people type almost perfectly. Do not give everyone typos, LOL, caps, or emoticons. A person's mistakes and habits should feel recognizably theirs across the session. Preserve differences between people.`;
  }

  humanTexturePrompt() {
    return `HUMAN TEXTURE RULES:\n- Recognition beats omniscience: if wording is genuinely ambiguous, a character may ask \"me?\" or miss it rather than magically understanding.\n- Memory callbacks should be occasional. If the existing memory section says a character remembers a human fact, a natural callback once in a while is excellent; do not recite remembered facts constantly.\n- People can disagree, get distracted, fail to answer, or let a scene die.\n- Phones in 1996 are for calls/call waiting/cellular voice. Nobody reads web pages, watches clips, texts, streams, takes phone photos, or uses apps on a phone.\n- Knowledge and consumer technology end in 1996.`;
  }

  socialContextPrompt() {
    const base = super.socialContextPrompt();
    return `${base}\n\n${this.localTimePrompt()}\n\n${this.voicePrompt()}\n\n${this.humanTexturePrompt()}`;
  }

  parseGroqMessages(content, max = 5, defaultTarget = "room") {
    const parsed = super.parseGroqMessages(content, max, defaultTarget);
    const accepted = [];
    const now = Date.now();

    for (const item of parsed) {
      const character = getCharacter(item.speaker);
      if (!character) continue;

      if (!worldLineAllowed(item.text)) {
        this.textureStats.worldRejected += 1;
        continue;
      }

      if (!temporalLineAllowed(character, item.text, now)) {
        this.textureStats.temporalRejected += 1;
        continue;
      }

      const shaped = shapeVoice(character, item.text);
      if (!shaped) {
        this.textureStats.voiceRejected += 1;
        continue;
      }
      if (shaped !== item.text) this.textureStats.voiceAdjusted += 1;

      accepted.push({ ...item, text: shaped });
    }

    return accepted;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") {
      const character = getCharacter(from);
      if (character && !worldLineAllowed(text)) {
        this.textureStats.worldRejected += 1;
        return false;
      }
      if (character && !temporalLineAllowed(character, text, Date.now())) {
        this.textureStats.temporalRejected += 1;
        return false;
      }
    }
    return super.say(from, text, kind, source, meta);
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      pass: "human-texture-world-clock-v18",
      localClocks: (this.talkerNames || []).map((talker) => {
        const character = getCharacter(talker);
        const parts = localParts(character, now);
        return {
          talker,
          timezone: character?.timezone || "",
          clock: localClockLabel(character, now),
          daypart: daypart(parts.hour)
        };
      }),
      textureStats: { ...this.textureStats }
    };
  }
}
