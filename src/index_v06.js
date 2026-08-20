import baseWorker, { ChatRoom as BaseChatRoom } from "./index.js";
import {
  renderAmbient,
  renderReaction,
  renderDirectedFallback,
  chooseDistinctLine,
  isTooSimilar,
  topicNamesForPrompt
} from "./chatter.js";
import { calendarChatterLine } from "./calendar.js";
import {
  relationshipScore,
  relationshipPrompt,
  relationshipInteractions,
  relationshipLabel,
  humanMemoryPrompt,
  humanMemorySummary,
  inferConversationTopic,
  activeThreads,
  chooseThread,
  threadPrompt,
  simulatedDateTimeLabel,
  presenceDebug
} from "./social.js";
import {
  chooseSceneSpec,
  pickSceneParticipants,
  sceneRelationshipSummary,
  sceneDirectorPrompt,
  buildFallbackScene,
  pacingDelay,
  recentSpeakerNames,
  roomMood
} from "./director.js";

const TOS_PROFILES = [
  { name: "TOSSteve", warnings: ["Let's keep it appropriate, folks.", "Please watch the language.", "Keep the chat within the Terms of Service."] },
  { name: "TOSGina", warnings: ["Please keep the room appropriate everyone :) ", "Let's cool it down a little.", "Friendly reminder to follow the Terms of Service."] },
  { name: "TOSMike", warnings: ["Knock it off, please.", "Keep it clean.", "That's enough. Please follow TOS."] },
  { name: "TOSKaren", warnings: ["Please keep the conversation appropriate. Thanks.", "Please remember the Terms of Service.", "Further disruption may result in action."] },
  { name: "TOSDan", warnings: ["Let's settle down in here.", "Keep it civil, everyone.", "Please watch the language."] },
  { name: "TOSLisa", warnings: ["Hey everyone, let's keep it friendly.", "Please keep the chat appropriate :) ", "Thanks for keeping things civil."] }
];

const CHILL_LINES = [
  ["JennJenn", "hi tos"], ["DaBomb96", "..."], ["Sk8rGuy16", "everybody behave lol"],
  ["NYMike23", "wasnt me"], ["xXBabyGirlXx", "lol"], ["CoolChick17", "here we go"], ["CyberDude", "uh oh"]
];

const MODERN_TERMS = /\b(iphone|youtube|facebook|tiktok|instagram|reddit|bitcoin|spotify|netflix|tesla|discord|snapchat|wikipedia|gmail|android|uber|lyft|twitter|x\.com|chatgpt|openai|covid|9\/11|september 11)\b/i;
const FUTURE_YEAR = /\b(199[7-9]|20\d\d)\b/;
const HEAT_WORDS = /\b(shut up|idiot|loser|moron|stupid|sucks|screw you|stfu|asshole|bitch|fuck|shit)\b/i;
const HUMAN_AI_COOLDOWN_MS = 8000;
const BACKGROUND_AI_COOLDOWN_MS = 90000;

function randomOf(items) { return items[Math.floor(Math.random() * items.length)]; }
function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function cleanScreenName(value) { return String(value || "Guest").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16) || "Guest"; }
function sanitizeText(value) { return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 320); }
function botLineAllowed(text) {
  if (FUTURE_YEAR.test(text)) return false;
  if (!MODERN_TERMS.test(text)) return true;
  return /\b(what|whats|what's|huh|wtf|never heard|is that|sounds fake|made that up|what is|no idea)\b/i.test(text);
}

export default baseWorker;

export class ChatRoom extends BaseChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.sceneSeq = 0;
  }

  builtInHumanReply(human) {
    const ranked = this.rankedResponders(human, 9);
    const replies = [];
    const topic = inferConversationTopic(human.text);

    for (const character of ranked) {
      const text = chooseDistinctLine(
        () => renderDirectedFallback(character, human),
        this.history,
        character.name,
        18
      );
      if (!text) continue;
      replies.push({ speaker: character.name, text, source: "built-in", intent: "reply", target: human.from, topic });
      break;
    }

    if (replies.length && ranked.length > 1) {
      const first = replies[0];
      const second = ranked.find((character) => character.name !== first.speaker);
      if (second) {
        const text = chooseDistinctLine(
          () => renderReaction(second, { from: first.speaker, text: first.text, kind: "bot", topic }),
          [...this.history, ...replies.map((r) => ({ from: r.speaker, text: r.text }))],
          second.name,
          22
        );
        if (text) replies.push({ speaker: second.name, text, source: "built-in", intent: "follow-up", target: first.speaker, topic });
      }
    }

    if (replies.length >= 2 && ranked.length > 2 && Math.random() < 0.42) {
      const prior = replies[replies.length - 1];
      const third = ranked.find((character) => !replies.some((reply) => reply.speaker === character.name));
      if (third) {
        const text = chooseDistinctLine(
          () => renderReaction(third, { from: prior.speaker, text: prior.text, kind: "bot", topic }),
          [...this.history, ...replies.map((r) => ({ from: r.speaker, text: r.text }))],
          third.name,
          22
        );
        if (text) replies.push({ speaker: third.name, text, source: "built-in", intent: "pile-on", target: prior.speaker, topic });
      }
    }
    return replies.slice(0, 3);
  }

  builtInAmbient() {
    const humans = this.humanNames();

    if (this.activeBotNames.length >= 3 && Math.random() < 0.34) {
      this.sceneSeq += 1;
      const scene = buildFallbackScene(
        this.activeCharacters(),
        (a, b) => relationshipScore(this.social, a, b),
        this.sceneSeq
      );
      if (scene.length) {
        const [first, ...rest] = scene;
        this.aiQueue.push(...rest);
        return first;
      }
    }

    const thread = Math.random() < 0.70 ? chooseThread(this.social, this.activeBotNames, humans) : null;
    const recent = thread ? this.recentThreadMessage(thread) : [...this.history].reverse().find((m) => m.kind === "bot" && m.from);
    let characters = shuffled(this.activeCharacters());

    if (thread) {
      characters.sort((a, b) => {
        const aIn = thread.participants.includes(a.name) ? 1 : 0;
        const bIn = thread.participants.includes(b.name) ? 1 : 0;
        const aRel = recent?.from ? relationshipScore(this.social, a.name, recent.from) : 0;
        const bRel = recent?.from ? relationshipScore(this.social, b.name, recent.from) : 0;
        return (bIn * 30 + bRel) - (aIn * 30 + aRel);
      });
    }

    for (const character of characters) {
      if (recent && recent.from === character.name) continue;
      const react = recent && (thread || Math.random() < 0.48);
      const text = chooseDistinctLine(
        () => {
          const seasonal = Math.random() < 0.18 ? calendarChatterLine(character, Date.now()) : null;
          return seasonal || (react ? renderReaction(character, recent) : renderAmbient(character));
        },
        this.history,
        character.name,
        28
      );
      if (!text) continue;
      return {
        speaker: character.name,
        text,
        source: "built-in",
        intent: react ? (thread ? "thread-reply" : "bot-reply") : "ambient",
        target: react ? recent.from : "room",
        topic: thread?.topic || inferConversationTopic(text),
        threadId: thread?.id || ""
      };
    }
    return null;
  }

  parseGroqMessages(content, max = 10, defaultTarget = "room") {
    const parsed = JSON.parse(content);
    const activeNames = new Set(this.activeBotNames);
    const validTargets = new Set(["room", ...this.activeBotNames, ...this.humanNames()]);
    const accepted = [];
    const tempHistory = [...this.history];

    for (const raw of Array.isArray(parsed.messages) ? parsed.messages : []) {
      const speaker = cleanScreenName(raw.speaker);
      const text = sanitizeText(raw.text);
      let target = cleanScreenName(raw.target || defaultTarget);
      if (!validTargets.has(target)) target = defaultTarget;
      if (!activeNames.has(speaker) || !text || text.length > 180 || !botLineAllowed(text)) continue;
      if (isTooSimilar(text, tempHistory, speaker)) continue;

      const filler = /^(lol+|yeah|yep|nah|no way|whatever|haha+|what|wow|true|same|ok|k)$/i.test(text.trim());
      const fillerAlready = accepted.some((row) => /^(lol+|yeah|yep|nah|no way|whatever|haha+|what|wow|true|same|ok|k)$/i.test(row.text.trim()));
      if (filler && fillerAlready) continue;
      if (accepted.length && accepted[accepted.length - 1].speaker === speaker && Math.random() < 0.7) continue;

      const item = {
        speaker,
        text,
        target,
        intent: sanitizeText(raw.intent || "conversation").slice(0, 30),
        topic: sanitizeText(raw.topic || inferConversationTopic(text)).slice(0, 30)
      };
      accepted.push(item);
      tempHistory.push({ from: speaker, text, kind: "bot" });
      if (accepted.length >= max) break;
    }
    return accepted;
  }

  async generateGroqHumanReply(human) {
    const ranked = this.rankedResponders(human, 7);
    const extras = shuffled(this.activeCharacters().filter((c) => !ranked.some((r) => r.name === c.name))).slice(0, 3);
    const participants = [...ranked, ...extras];
    const humanNames = this.humanNames().join(", ") || "none";
    const participantNames = participants.map((c) => c.name);
    const memory = humanMemoryPrompt(this.social, human.from, participantNames, 7);
    const relationships = relationshipPrompt(this.social, [...participantNames, human.from], 12);
    const threads = threadPrompt(this.social, Date.now(), 4);
    this.sceneSeq += 1;
    const sceneId = `h${this.sceneSeq}`;

    const prompt = `ROOM: People Connection / Town Square. Current simulated time: ${simulatedDateTimeLabel()}. Everyone believes this is 1996.\n\nFIXED PROFILES:\n${this.promptProfiles(participants, 10)}\n\nRELATIONSHIPS:\n${relationships}\n\nWHAT INDIVIDUAL BOTS ACTUALLY REMEMBER ABOUT ${human.from}:\n${memory}\nOnly use a memory if that bot actually witnessed it.\n\nACTIVE CONVERSATIONS:\n${threads}\n\nHumans here: ${humanNames}. Do not invent facts about humans.\n\nRecent room:\n${this.recentTranscript(26) || "The room just opened."}\n\nLatest HUMAN message:\n${human.from}: ${human.text}\nTopic hints: ${topicNamesForPrompt(human.text)}\nLikely responders: ${ranked.map((c) => c.name).join(", ")}.\n\nWrite a 3-5 line MINI-CONVERSATION, not independent answers. Line 1 or 2 must genuinely engage ${human.from}. Then another bot should react to that answer, challenge it, ask for a detail, add a specific opinion, or briefly continue another thread. It is good to ask ${human.from} one natural follow-up question when appropriate. ${human.target !== "room" ? `${human.from} directly addressed ${human.target}; ${human.target} should normally answer first.` : "Choose whoever actually cares about the subject."}\n\nSubstance beats filler. At least two lines must add a concrete opinion, detail, question, anecdote, disagreement, or new information. Most lines 2-15 words; one may be 15-28 words for a small story. People interrupt, tease, misunderstand, and disagree. They do not sound like assistants. Do not force 1990s references into every line; ordinary work, friends, dating, family, money, food, boredom, and weird daily events are better.\n\nOutput JSON only:\n{"messages":[{"speaker":"JennJenn","text":"...","target":"${human.from}","intent":"reply","topic":"music"}]}\n\nOnly active bot speakers: ${this.activeBotNames.join(", ")}.`;

    const messages = await this.callGroq(prompt, 430, 5, human.from);
    return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));
  }

  async generateGroqBatch() {
    const currentThreads = activeThreads(this.social, Date.now());
    const humanNames = this.humanNames();
    const recentSpeakers = recentSpeakerNames(this.history, 10);
    const scene = chooseSceneSpec({ now: Date.now(), hasThreads: currentThreads.length > 0, hasHumans: humanNames.length > 0 });
    const selected = pickSceneParticipants(
      this.activeCharacters(),
      (a, b) => relationshipScore(this.social, a, b),
      recentSpeakers,
      8
    );
    const participantNames = selected.map((character) => character.name);
    const relationshipNames = [...participantNames, ...humanNames];
    this.sceneSeq += 1;
    const sceneId = `g${this.sceneSeq}`;

    const prompt = `ROOM: People Connection / Town Square. Current simulated time: ${simulatedDateTimeLabel()}. Everyone believes it is 1996.\n\nCONVERSATION DIRECTOR:\n${sceneDirectorPrompt(scene)}\n\nScene people: ${participantNames.join(", ")}. Relationship flavor: ${sceneRelationshipSummary(selected, (a, b) => relationshipScore(this.social, a, b))}.\n\nFIXED PROFILES:\n${this.promptProfiles(selected, 8)}\n\nRELATIONSHIPS:\n${relationshipPrompt(this.social, relationshipNames, 12)}\n\nACTIVE THREADS:\n${threadPrompt(this.social, Date.now(), 4)}\n\nHumans present: ${humanNames.join(", ") || "none"}.\n\nRecent room:\n${this.recentTranscript(28) || "The room just opened."}\n\nGenerate 7-10 NEXT chat lines as a social scene with an arc. Someone introduces a concrete thought/story/question; somebody responds; somebody asks a follow-up or disagrees; somebody else may jump in; then let the subject mutate, resolve, or get interrupted. About 20% of the lines may be cross-talk from a second conversation. Use relationships: friends have shorthand and callbacks, rivals needle each other, strangers are less familiar.\n\nDo NOT write disconnected one-liners. Do NOT make everyone politely agree. Do NOT make the room a 1996 trivia exhibit. Most people talk about ordinary life. Avoid empty filler; at most one line can be only 'lol', 'yeah', 'nah', 'no way', etc. Most messages 2-15 words, with occasional 15-30 word story lines. Questions should often get actual answers. Let characters have bad takes, partial information, petty opinions, and different levels of interest. A human may be included naturally if they recently spoke, but bots must sustain the room without them.\n\nOutput JSON only:\n{"messages":[{"speaker":"CyberDude","text":"...","target":"WebMasterJ","intent":"scene-reply","topic":"general"}]}\n\nOnly active bot speakers: ${this.activeBotNames.join(", ")}.`;

    const messages = await this.callGroq(prompt, 720, 10, "room");
    return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    const now = Date.now();

    if (now >= this.targetChangesAt) {
      this.targetOccupancy = 18 + Math.floor(Math.random() * 8);
      this.targetChangesAt = now + 60000 + Math.floor(Math.random() * 120000);
    }

    this.reconcileBotPopulation(now);

    if (this.tos) {
      if (!this.tos.warned && now - this.tos.enteredAt > 6500) {
        this.say(this.tos.name, randomOf(this.tos.warnings), "tos", "tos", { intent: "moderate", target: "room", topic: "moderation" });
        this.tos.warned = true;
        this.heat = 1;
      }
      if (now - this.tos.enteredAt > 50000) {
        const name = this.tos.name;
        this.tos = null;
        this.system(`${name} has left the room.`);
        this.broadcastPresence();
        this.nextBotAt = now + 2200;
      }
    } else if (this.heat >= 5 && Math.random() < 0.38) {
      const profile = randomOf(TOS_PROFILES);
      this.tos = { ...profile, enteredAt: now, warned: false };
      this.system(`${this.tos.name} has entered the room.`);
      this.broadcastPresence();
      this.nextBotAt = now + 3500;
      return;
    }

    if (forceSoon && this.nextBotAt - now > 850) this.nextBotAt = now + 550;
    if (now < this.nextBotAt) return;

    if (this.tos && Math.random() < 0.65) {
      const line = randomOf(CHILL_LINES);
      if (this.activeBotNames.includes(line[0])) {
        this.say(line[0], line[1], "bot", "built-in", { intent: "tos-reaction", target: this.tos.name, topic: "moderation" });
      }
      this.nextBotAt = now + 2400 + Math.floor(Math.random() * 3600);
      return;
    }

    if (this.pendingHumans.length) {
      const human = this.pendingHumans.shift();
      let replies = [];
      let source = "built-in";

      if (this.env.GROQ_API_KEY && now - this.lastHumanAiAt >= HUMAN_AI_COOLDOWN_MS) {
        this.lastHumanAiAt = now;
        replies = await this.generateGroqHumanReply(human);
        source = "groq";
      }
      if (!replies.length) {
        replies = this.builtInHumanReply(human);
        source = "built-in";
      }

      const priority = replies.slice(0, 5).map((reply) => ({
        ...reply,
        source: reply.source || source,
        intent: reply.intent || "reply",
        target: reply.target || human.from,
        topic: reply.topic || inferConversationTopic(human.text)
      }));
      if (priority.length) this.aiQueue.unshift(...priority);
    }

    if (this.env.GROQ_API_KEY && !this.pendingHumans.length && !this.aiQueue.length && now - this.lastBackgroundAiAt >= BACKGROUND_AI_COOLDOWN_MS) {
      this.lastBackgroundAiAt = now;
      const generated = await this.generateGroqBatch();
      for (const item of generated) {
        this.aiQueue.push({ ...item, source: "groq", intent: item.intent || "scene-reply", target: item.target || "room", topic: item.topic || inferConversationTopic(item.text) });
      }
    }

    const next = this.aiQueue.length ? this.aiQueue.shift() : this.builtInAmbient();
    if (next && this.activeBotNames.includes(next.speaker)) {
      this.say(next.speaker, next.text, "bot", next.source || "built-in", {
        intent: next.intent || "ambient",
        target: next.target || "room",
        topic: next.topic || inferConversationTopic(next.text),
        threadId: next.threadId || "",
        sceneId: next.sceneId || "",
        beat: next.beat || 0
      });
    }

    this.heat = clamp(this.heat - 0.22, 0, 10);
    this.nextBotAt = now + pacingDelay(this.aiQueue.length, next?.intent || "");
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: 2.5,
      mood: roomMood().id,
      queue: this.aiQueue.length,
      recentSpeakers: recentSpeakerNames(this.history, 6)
    };
  }
}
