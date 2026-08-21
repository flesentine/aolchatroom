import baseWorker, { ChatRoom as ProviderChatRoom } from "./index_v15.js";
import { activeThreads } from "./social.js";

const TALKER_MIN = 5;
const TALKER_MAX = 8;
const TALKER_ROTATE_MIN_MS = 4 * 60 * 1000;
const TALKER_ROTATE_MAX_MS = 7 * 60 * 1000;

const PHASES = {
  quiet: { minGap: 12000, maxGap: 28000, minDuration: 35000, maxDuration: 85000 },
  chat: { minGap: 5500, maxGap: 12500, minDuration: 60000, maxDuration: 140000 },
  burst: { minGap: 2400, maxGap: 6200, minDuration: 25000, maxDuration: 65000 }
};

const MOTIVES = [
  "mostly listening; only jump in when something genuinely catches your attention",
  "wants to keep an existing conversation going instead of starting a new subject",
  "checking the room while doing something else; short distracted replies are normal",
  "feels chatty with regulars but does not need to answer every line",
  "looking for one interesting conversation and willing to ignore the rest of the room",
  "a little bored; may joke or react, but should not manufacture topic after topic",
  "mostly here to hang out; prefers responding to people over asking random questions",
  "in and out of attention; may miss messages unless directly addressed"
];

function randomInt(min, max) {
  return min + Math.floor(Math.random() * Math.max(1, max - min + 1));
}

function sample(items, count) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function proceduralReplyFor(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (/\?$/.test(value)) return ["i dunno", "maybe", "yeah probably", "nah", "not sure"][Math.floor(Math.random() * 5)];
  if (/\b(?:lol|haha|lmao)\b/i.test(value)) return Math.random() < 0.5 ? "lol" : "heh";
  if (/\b(?:sucks|awful|terrible|hate)\b/i.test(value)) return Math.random() < 0.5 ? "ugh" : "that sucks";
  return ["yeah", "lol", "no way", "heh"][Math.floor(Math.random() * 4)];
}

export default baseWorker;

export class ChatRoom extends ProviderChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.talkerNames = [];
    this.talkerRotateAt = 0;
    this.talkerMotives = new Map();
    this.roomPhase = "chat";
    this.roomPhaseUntil = 0;
    this.phaseSequence = 0;
  }

  ensureRoomPhase(now = Date.now(), forceBurst = false) {
    if (forceBurst) {
      this.roomPhase = "burst";
      this.roomPhaseUntil = Math.max(this.roomPhaseUntil, now + 30000);
      return;
    }
    if (now < this.roomPhaseUntil) return;

    const roll = Math.random();
    const next = roll < 0.24 ? "quiet" : roll < 0.78 ? "chat" : "burst";
    const spec = PHASES[next];
    this.roomPhase = next;
    this.roomPhaseUntil = now + randomInt(spec.minDuration, spec.maxDuration);
    this.phaseSequence += 1;
  }

  phaseGap(now = Date.now()) {
    this.ensureRoomPhase(now);
    const spec = PHASES[this.roomPhase] || PHASES.chat;
    return randomInt(spec.minGap, spec.maxGap);
  }

  ensureTalkers(now = Date.now(), force = false) {
    const online = new Set(this.activeBotNames || []);
    this.talkerNames = (this.talkerNames || []).filter((name) => online.has(name));

    if (!force && this.talkerNames.length >= TALKER_MIN && now < this.talkerRotateAt) return;

    const target = randomInt(TALKER_MIN, TALKER_MAX);
    const threadNames = this.social
      ? activeThreads(this.social, now).flatMap((thread) => thread.participants || []).filter((name) => online.has(name))
      : [];
    const protectedNames = [...new Set(threadNames)].slice(0, 4);
    const retained = sample(this.talkerNames.filter((name) => !protectedNames.includes(name)), Math.max(0, Math.min(3, target - protectedNames.length)));
    const chosen = [...new Set([...protectedNames, ...retained])];
    const remaining = [...online].filter((name) => !chosen.includes(name));
    chosen.push(...sample(remaining, Math.max(0, target - chosen.length)));
    this.talkerNames = chosen.slice(0, target);

    for (const name of this.talkerNames) {
      if (!this.talkerMotives.has(name) || Math.random() < 0.35) {
        this.talkerMotives.set(name, MOTIVES[Math.floor(Math.random() * MOTIVES.length)]);
      }
    }
    for (const name of [...this.talkerMotives.keys()]) {
      if (!online.has(name)) this.talkerMotives.delete(name);
    }

    this.talkerRotateAt = now + randomInt(TALKER_ROTATE_MIN_MS, TALKER_ROTATE_MAX_MS);
  }

  promoteTalker(name, now = Date.now()) {
    if (!name || !this.activeBotNames.includes(name)) return;
    this.ensureTalkers(now);
    if (this.talkerNames.includes(name)) return;
    this.talkerNames.unshift(name);
    if (this.talkerNames.length > TALKER_MAX) this.talkerNames.pop();
    if (!this.talkerMotives.has(name)) this.talkerMotives.set(name, "was directly pulled into the conversation; pay attention to that person first");
    this.talkerRotateAt = Math.max(this.talkerRotateAt, now + 90000);
  }

  activeCharacters() {
    this.ensureTalkers(Date.now());
    const talkers = new Set(this.talkerNames);
    return super.activeCharacters().filter((character) => talkers.has(character.name));
  }

  resolveDirectTarget(text, sender = "") {
    const target = super.resolveDirectTarget(text, sender);
    if (target !== "room") this.promoteTalker(target, Date.now());
    return target;
  }

  pushMessage(message) {
    let enriched = { ...message };
    if (!enriched.sceneId && enriched.threadId) enriched.sceneId = `scene-${enriched.threadId}`;
    if (!enriched.sceneId && enriched.replyTo) {
      const parent = [...this.history].reverse().find((row) => row?.messageId === enriched.replyTo);
      if (parent?.sceneId) enriched.sceneId = parent.sceneId;
      else if (parent?.threadId) enriched.sceneId = `scene-${parent.threadId}`;
    }
    return super.pushMessage(enriched);
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") this.promoteTalker(from, Date.now());
    if (kind === "human" && meta?.target && meta.target !== "room") this.promoteTalker(meta.target, Date.now());
    return super.say(from, text, kind, source, meta);
  }

  builtInHumanReply(human) {
    if (!human?.target || human.target === "room" || !this.activeBotNames.includes(human.target)) return [];
    this.promoteTalker(human.target, Date.now());
    const text = proceduralReplyFor(human.text);
    if (!text) return [];
    return [{
      speaker: human.target,
      text,
      source: "procedural",
      intent: "emergency-reply",
      target: human.from,
      topic: human.topic || "general"
    }];
  }

  builtInAmbient() {
    // If every AI provider is unavailable, silence is more believable than a nonstop
    // stream of canned topic starters. Keep only rare, context-safe room texture.
    if (Math.random() < 0.82) return null;
    this.ensureTalkers(Date.now());
    const recent = [...this.history].reverse().find((row) =>
      row
      && row.kind !== "system"
      && row.from
      && Date.now() - Number(row.at || 0) < 30000
    );
    if (!recent) return null;

    const candidates = this.talkerNames.filter((name) => name !== recent.from);
    if (!candidates.length) return null;
    const speaker = candidates[Math.floor(Math.random() * candidates.length)];

    if (recent.kind === "human") {
      const text = proceduralReplyFor(recent.text);
      if (!text) return null;
      return {
        speaker,
        text,
        source: "procedural",
        intent: "emergency-reaction",
        target: recent.from,
        topic: recent.topic || "general",
        replyTo: recent.messageId || ""
      };
    }

    if (Math.random() < 0.58) return null;
    const text = /\?$/.test(String(recent.text || "").trim()) ? proceduralReplyFor(recent.text) : (Math.random() < 0.5 ? "lol" : "yeah");
    return {
      speaker,
      text,
      source: "procedural",
      intent: "emergency-reaction",
      target: recent.from,
      topic: recent.topic || "general",
      replyTo: recent.messageId || ""
    };
  }

  socialContextPrompt() {
    this.ensureTalkers(Date.now());
    this.ensureRoomPhase(Date.now());
    const motives = this.talkerNames.map((name) => `- ${name}: ${this.talkerMotives.get(name) || "mostly listening"}`).join("\n");
    return `ROOM SOCIAL STATE:\nCurrent room rhythm: ${this.roomPhase}. A full room does NOT mean everybody talks.\nCurrent active talkers: ${this.talkerNames.join(", ") || "none"}. Other visible people are mostly lurking or distracted. Unless a human directly addresses a lurker, ONLY these active talkers should initiate messages.\nCurrent short-term motives:\n${motives || "- nobody is especially talkative"}\nConversation rule: continue existing exchanges before inventing a new subject. Do not create a new topic merely because several seconds passed. One or two overlapping conversations is enough. Silence is normal. Contextless reactions like \"seriously?\", \"what?\", \"maybe\", or \"lol really\" are forbidden unless they clearly reply to a specific recent line.`;
  }

  parseGroqMessages(content, max = 5, defaultTarget = "room") {
    this.ensureTalkers(Date.now());
    const allowed = new Set(this.talkerNames);
    const parsed = super.parseGroqMessages(content, max, defaultTarget);
    return parsed.filter((item) => allowed.has(item.speaker));
  }

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const augmented = `${this.socialContextPrompt()}\n\n${prompt}`;
    return super.callGroq(augmented, maxTokens, maxMessages, defaultTarget);
  }

  async tick(forceSoon = false) {
    const now = Date.now();
    const hasHumanPressure = Boolean(forceSoon || this.pendingHumans?.length);
    this.ensureTalkers(now);
    this.ensureRoomPhase(now, hasHumanPressure);
    const wasDue = hasHumanPressure || now >= Number(this.nextBotAt || 0);
    const beforeCount = this.history.length;

    await super.tick(forceSoon);

    if (!wasDue) return;
    const afterCount = this.history.length;
    const emitted = afterCount > beforeCount;

    if (hasHumanPressure) {
      this.roomPhase = "burst";
      this.roomPhaseUntil = Math.max(this.roomPhaseUntil, Date.now() + 30000);
    } else if (!emitted && this.roomPhase === "quiet") {
      // When the room is quiet and nobody had anything useful to say, let the silence live.
      this.nextBotAt = Date.now() + randomInt(16000, 32000);
      return;
    }

    this.nextBotAt = Date.now() + this.phaseGap(Date.now());
  }

  debugState(name) {
    const base = super.debugState(name);
    this.ensureTalkers(Date.now());
    return {
      ...base,
      pass: "active-talkers-rhythm-v16",
      roomRhythm: {
        phase: this.roomPhase,
        phaseUntil: this.roomPhaseUntil,
        activeTalkers: [...this.talkerNames],
        motives: this.talkerNames.map((talker) => ({ talker, motive: this.talkerMotives.get(talker) || "" })),
        rotateAt: this.talkerRotateAt
      }
    };
  }
}
