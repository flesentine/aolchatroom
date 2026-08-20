import { DurableObject } from "cloudflare:workers";
import {
  CHARACTERS,
  CORE_NAMES,
  getCharacter,
  publicCharacterProfile,
  characterPrompt
} from "./characters.js";
import {
  scoreCharacterForText,
  renderAmbient,
  renderReaction,
  renderDirectedFallback,
  chooseDistinctLine,
  isTooSimilar,
  topicNamesForPrompt
} from "./chatter.js";
import {
  normalizeSocialState,
  rememberHumanVisit,
  rememberHumanDeparture,
  rememberHumanMessage,
  humanMemorySummary,
  humanMemoryPrompt,
  relationshipScore,
  relationshipInteractions,
  adjustRelationship,
  relationshipLabel,
  relationshipPrompt,
  inferConversationTopic,
  touchThread,
  activeThreads,
  chooseThread,
  threadPrompt,
  rankRoster,
  scheduleDescription,
  simulatedDateLabel,
  simulatedDateTimeLabel,
  presenceDebug
} from "./social.js";

const TOS_PROFILES = [
  { name: "TOSSteve", style: "terse and procedural", warnings: ["Let's keep it appropriate, folks.", "Please watch the language.", "Keep the chat within the Terms of Service."] },
  { name: "TOSGina", style: "friendly but firm", warnings: ["Please keep the room appropriate everyone :) ", "Let's cool it down a little.", "Friendly reminder to follow the Terms of Service."] },
  { name: "TOSMike", style: "blunt", warnings: ["Knock it off, please.", "Keep it clean.", "That's enough. Please follow TOS."] },
  { name: "TOSKaren", style: "formal", warnings: ["Please keep the conversation appropriate. Thanks.", "Please remember the Terms of Service.", "Further disruption may result in action."] },
  { name: "TOSDan", style: "dry", warnings: ["Let's settle down in here.", "Keep it civil, everyone.", "Please watch the language."] },
  { name: "TOSLisa", style: "warm", warnings: ["Hey everyone, let's keep it friendly.", "Please keep the chat appropriate :) ", "Thanks for keeping things civil."] }
];

const CHILL_LINES = [
  ["JennJenn", "hi tos"],
  ["DaBomb96", "..."],
  ["Sk8rGuy16", "everybody behave lol"],
  ["NYMike23", "wasnt me"],
  ["xXBabyGirlXx", "lol"],
  ["CoolChick17", "here we go"],
  ["CyberDude", "uh oh"]
];

const LEAVE_LINES = ["brb", "gotta run", "later ppl", "phone brb", "food brb", "be back later", "im out for a bit"];
const RETURN_LINES = ["back", "im back", "what did i miss", "ok back", "finally back", "anyone still here"];

const MODERN_TERMS = /\b(iphone|youtube|facebook|tiktok|instagram|reddit|bitcoin|spotify|netflix|tesla|discord|snapchat|wikipedia|gmail|android|uber|lyft|twitter|x\.com|chatgpt|openai|covid|9\/11|september 11)\b/i;
const FUTURE_YEAR = /\b(199[7-9]|20\d\d)\b/;
const HEAT_WORDS = /\b(shut up|idiot|loser|moron|stupid|sucks|screw you|stfu|asshole|bitch|fuck|shit)\b/i;
const HUMAN_AI_COOLDOWN_MS = 7000;
const BACKGROUND_AI_COOLDOWN_MS = 65000;
const PRESENCE_MIN_INTERVAL_MS = 28000;
const PRESENCE_CHURN_MS = 90000;
const MAX_HISTORY = 220;

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function cleanScreenName(value) {
  return String(value || "Guest").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16) || "Guest";
}

function sanitizeText(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 320);
}

function botLineAllowed(text) {
  if (FUTURE_YEAR.test(text)) return false;
  if (!MODERN_TERMS.test(text)) return true;
  return /\b(what|whats|what's|huh|wtf|never heard|is that|sounds fake|made that up|what is|no idea)\b/i.test(text);
}

function connectionLabel(score, interactions) {
  if (!interactions) return "hasn't really talked with you yet";
  if (score <= -45) return "really does not like you";
  if (score <= -20) return "has some beef with you";
  if (score < 8) return "recognizes you";
  if (score < 28) return "is getting familiar with you";
  if (score < 50) return "seems friendly with you";
  return "knows you pretty well";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        room: "Town Square",
        simulatedDate: simulatedDateLabel(),
        simulatedDateTime: simulatedDateTimeLabel(),
        groqConfigured: Boolean(env.GROQ_API_KEY),
        characterCount: CHARACTERS.length,
        pass: 2
      });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const roomName = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(roomName);
      return env.CHAT_ROOMS.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.loaded = false;
    this.social = null;
    this.history = [];
    this.activeBotNames = [];
    this.aiQueue = [];
    this.pendingHumans = [];
    this.nextBotAt = Date.now() + 1800;
    this.targetOccupancy = 23;
    this.targetChangesAt = Date.now() + 90000;
    this.heat = 0;
    this.tos = null;
    this.lastHumanAiAt = 0;
    this.lastBackgroundAiAt = 0;
    this.aiStatus = env.GROQ_API_KEY ? "Groq configured" : "Built-in 1996 chatter";
    this.lastSocialPersistAt = 0;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async ensureState() {
    if (this.loaded) return;
    const [savedHistory, savedSocial] = await Promise.all([
      this.ctx.storage.get("history"),
      this.ctx.storage.get("socialStateV2")
    ]);
    this.history = Array.isArray(savedHistory) ? savedHistory.slice(-MAX_HISTORY) : [];
    this.social = normalizeSocialState(savedSocial, CHARACTERS, CORE_NAMES, Date.now());
    this.activeBotNames = (this.social.presence?.online || []).filter((name) => getCharacter(name));
    if (!this.activeBotNames.length) this.initializeRoster(Date.now());
    this.loaded = true;
  }

  persistSocial(force = false) {
    if (!this.social) return;
    const now = Date.now();
    if (!force && now - this.lastSocialPersistAt < 10000) return;
    this.lastSocialPersistAt = now;
    this.social.presence.online = [...this.activeBotNames];
    const promise = this.ctx.storage.put("socialStateV2", this.social);
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(promise);
    else promise.catch(() => {});
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    const name = cleanScreenName(url.searchParams.get("name"));
    const debug = url.searchParams.get("debug") === "1";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    if (this.activeBotNames.includes(name)) {
      this.activeBotNames = this.activeBotNames.filter((bot) => bot !== name);
    }

    server.serializeAttachment({ name, joinedAt: Date.now(), debug });
    this.ctx.acceptWebSocket(server);

    rememberHumanVisit(this.social, name, Date.now());
    this.system(`${name} has entered the room.`);
    this.broadcastPresence();
    this.persistSocial(true);

    server.send(JSON.stringify({
      type: "hello",
      room: "Town Square",
      simulatedDate: simulatedDateLabel(),
      history: this.history.slice(-85),
      users: this.visibleUsers(),
      provider: this.aiStatus,
      pass: 2
    }));

    if (debug) this.sendDebug(server, name);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.ensureState();
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    const attachment = ws.deserializeAttachment() || {};

    if (raw === "pulse") {
      await this.tick();
      if (attachment.debug) this.sendDebug(ws, cleanScreenName(attachment.name));
      return;
    }

    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === "profile") {
      const requestedName = cleanScreenName(data.name);
      const character = getCharacter(requestedName);
      const profile = publicCharacterProfile(character);
      if (profile && character) {
        const viewer = cleanScreenName(attachment.name);
        const score = relationshipScore(this.social, character.name, viewer);
        const interactions = relationshipInteractions(this.social, character.name, viewer);
        profile.schedule = scheduleDescription(character);
        profile.connection = connectionLabel(score, interactions);
      }
      try { ws.send(JSON.stringify({ type: "profile", profile, requestedName })); } catch {}
      return;
    }

    if (data.type !== "chat") return;
    const from = cleanScreenName(attachment.name);
    const text = sanitizeText(data.text);
    if (!text) return;

    const target = this.resolveDirectTarget(text, from);
    rememberHumanMessage(this.social, from, text, this.activeBotNames, Date.now());
    if (target !== "room" && getCharacter(target)) {
      adjustRelationship(this.social, target, from, 0.5, Date.now());
    }

    this.say(from, text, "human", "human", {
      intent: target === "room" ? "human" : "direct",
      target,
      topic: inferConversationTopic(text)
    });

    if (HEAT_WORDS.test(text)) this.heat = clamp(this.heat + 2, 0, 10);
    this.pendingHumans.push({ from, text, target, at: Date.now() });
    this.pendingHumans = this.pendingHumans.slice(-10);
    this.nextBotAt = Math.min(this.nextBotAt, Date.now() + 600);
    this.persistSocial(true);
    await this.tick(true);
  }

  webSocketClose(ws) {
    const attachment = ws.deserializeAttachment() || {};
    const name = cleanScreenName(attachment.name);
    if (this.social) rememberHumanDeparture(this.social, name, Date.now());
    this.system(`${name} has left the room.`);
    this.broadcastPresence();
    this.persistSocial(true);
  }

  webSocketError(ws) {
    try { ws.close(1011, "socket error"); } catch {}
  }

  humanNames() {
    return this.ctx.getWebSockets().map((ws) => {
      const attachment = ws.deserializeAttachment() || {};
      return cleanScreenName(attachment.name);
    });
  }

  activeCharacters() {
    return this.activeBotNames.map(getCharacter).filter(Boolean);
  }

  visibleUsers() {
    const humans = this.humanNames();
    const humanSet = new Set(humans);
    const bots = this.activeBotNames.filter((name) => !humanSet.has(name));
    const tos = this.tos ? [this.tos.name] : [];
    return [...humans, ...tos, ...bots].slice(0, 40);
  }

  broadcast(payload) {
    const encoded = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(encoded); } catch {}
    }
  }

  broadcastPresence() {
    const users = this.visibleUsers();
    this.broadcast({
      type: "presence",
      users,
      count: users.length,
      simulatedDate: simulatedDateLabel()
    });
  }

  setAiStatus(status) {
    this.aiStatus = status;
    this.broadcast({ type: "ai_status", status });
  }

  async persistHistory() {
    this.history = this.history.slice(-MAX_HISTORY);
    await this.ctx.storage.put("history", this.history);
  }

  pushMessage(message) {
    const item = { ...message, at: Date.now() };
    this.history.push(item);
    this.history = this.history.slice(-MAX_HISTORY);
    this.broadcast({ type: "message", message: item });
    this.persistHistory().catch(() => {});
  }

  socialMeta(from, text, kind, meta = {}) {
    if (!this.social || kind === "system" || !from) return meta;
    const target = meta.target || "room";
    const topic = meta.topic || inferConversationTopic(text);
    let thread = null;

    const shouldThread = target !== "room" || topic !== "general" || kind === "human" || /reply|conversation|direct/.test(meta.intent || "");
    if (shouldThread) {
      thread = touchThread(this.social, {
        topic,
        participants: [from, target].filter((name) => name && name !== "room"),
        kind: meta.intent || "conversation",
        text,
        now: Date.now()
      });
    }

    if (target && target !== "room" && target !== from) {
      const hostile = HEAT_WORDS.test(text);
      const delta = hostile ? -4 : /reply|direct/.test(meta.intent || "") ? 1.4 : 0.5;
      adjustRelationship(this.social, from, target, delta, Date.now());
      if (getCharacter(target) && (getCharacter(from) || kind === "human")) {
        adjustRelationship(this.social, target, from, hostile ? -1.2 : 0.35, Date.now());
      }
    }

    return {
      ...meta,
      target,
      topic,
      threadId: thread?.id || meta.threadId || ""
    };
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const cleaned = sanitizeText(text);
    if (!cleaned) return false;
    if (kind === "bot" && (!botLineAllowed(cleaned) || isTooSimilar(cleaned, this.history, from))) return false;
    const enriched = this.socialMeta(from, cleaned, kind, meta);
    this.pushMessage({ from, text: cleaned, kind, source, ...enriched });
    if (HEAT_WORDS.test(cleaned)) this.heat = clamp(this.heat + 1, 0, 10);
    this.persistSocial();
    return true;
  }

  system(text) {
    this.pushMessage({ from: "", text, kind: "system", source: "system" });
  }

  resolveDirectTarget(text, sender = "") {
    const lower = String(text || "").toLowerCase();
    const candidates = [...this.activeBotNames, ...this.humanNames()].filter((name) => name !== sender);
    for (const name of candidates) {
      const needle = name.toLowerCase();
      if (lower.includes(needle)) return name;
    }
    return "room";
  }

  initializeRoster(now = Date.now()) {
    const humans = this.humanNames();
    const count = clamp(this.targetOccupancy - humans.length - (this.tos ? 1 : 0), 8, CHARACTERS.length);
    const threadParticipants = activeThreads(this.social, now).flatMap((thread) => thread.participants);
    this.activeBotNames = rankRoster(CHARACTERS, {
      current: this.activeBotNames,
      coreNames: CORE_NAMES,
      humans,
      threadParticipants,
      count,
      now
    });
    this.social.presence.online = [...this.activeBotNames];
    this.social.presence.lastChangeAt = now;
    this.social.presence.lastChurnAt = now;
  }

  desiredRoster(now = Date.now()) {
    const humans = this.humanNames();
    const count = clamp(this.targetOccupancy - humans.length - (this.tos ? 1 : 0), 8, CHARACTERS.length);
    const threadParticipants = activeThreads(this.social, now).flatMap((thread) => thread.participants);
    return rankRoster(CHARACTERS, {
      current: this.activeBotNames,
      coreNames: CORE_NAMES,
      humans,
      threadParticipants,
      count,
      now
    });
  }

  announceBotLeave(name, now) {
    if (!this.activeBotNames.includes(name)) return;
    if (Math.random() < 0.58) {
      this.say(name, randomOf(LEAVE_LINES), "bot", "built-in", { intent: "leaving", target: "room", topic: "general" });
    }
    this.activeBotNames = this.activeBotNames.filter((bot) => bot !== name);
    this.system(`${name} has left the room.`);
    this.social.presence.online = [...this.activeBotNames];
    this.social.presence.lastChangeAt = now;
  }

  announceBotEnter(name, now) {
    if (!name || this.activeBotNames.includes(name) || this.humanNames().includes(name)) return;
    this.activeBotNames.push(name);
    this.system(`${name} has entered the room.`);
    this.social.presence.online = [...this.activeBotNames];
    this.social.presence.lastChangeAt = now;
    if (Math.random() < 0.42) {
      this.aiQueue.unshift({
        speaker: name,
        text: randomOf(RETURN_LINES),
        source: "built-in",
        intent: "return",
        target: "room",
        topic: "greeting"
      });
    }
  }

  reconcileBotPopulation(now = Date.now()) {
    const presence = this.social.presence;
    const humans = new Set(this.humanNames());
    const before = this.activeBotNames.join("|");
    this.activeBotNames = this.activeBotNames.filter((name) => getCharacter(name) && !humans.has(name));
    const desired = this.desiredRoster(now);
    const needed = desired.length;
    const minIntervalPassed = now - (presence.lastChangeAt || 0) >= PRESENCE_MIN_INTERVAL_MS;

    if (this.activeBotNames.length < needed && minIntervalPassed) {
      const entrant = desired.find((name) => !this.activeBotNames.includes(name));
      if (entrant) this.announceBotEnter(entrant, now);
    } else if (this.activeBotNames.length > needed && minIntervalPassed) {
      const leaver = [...this.activeBotNames].reverse().find((name) => !desired.includes(name)) || this.activeBotNames[this.activeBotNames.length - 1];
      if (leaver) this.announceBotLeave(leaver, now);
    } else if (this.activeBotNames.length === needed && minIntervalPassed && now - (presence.lastChurnAt || 0) >= PRESENCE_CHURN_MS) {
      const entrant = desired.find((name) => !this.activeBotNames.includes(name));
      const leaver = [...this.activeBotNames].reverse().find((name) => !desired.includes(name));
      if (entrant && leaver) {
        this.announceBotLeave(leaver, now);
        this.announceBotEnter(entrant, now + 1);
      }
      presence.lastChurnAt = now;
    }

    presence.online = [...this.activeBotNames];
    const changed = before !== this.activeBotNames.join("|");
    if (changed) {
      this.broadcastPresence();
      this.persistSocial(true);
    }
  }

  rankedResponders(human, limit = 6) {
    const activeThreadNames = new Set(activeThreads(this.social).flatMap((thread) => thread.participants));
    return this.activeCharacters()
      .map((character) => {
        const topicScore = scoreCharacterForText(character, human.text);
        const rel = relationshipScore(this.social, character.name, human.from);
        const interactions = relationshipInteractions(this.social, character.name, human.from);
        const threadBonus = activeThreadNames.has(character.name) ? 8 : 0;
        const namedBonus = human.target === character.name ? 100 : 0;
        return { character, score: topicScore + rel * 0.35 + Math.min(18, interactions * 2) + threadBonus + namedBonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.character);
  }

  builtInHumanReply(human) {
    const ranked = this.rankedResponders(human, 9);
    const replies = [];
    for (const character of ranked) {
      const text = chooseDistinctLine(
        () => renderDirectedFallback(character, human),
        [...this.history, ...replies.map((r) => ({ from: r.speaker, text: r.text }))],
        character.name,
        18
      );
      if (!text) continue;
      replies.push({
        speaker: character.name,
        text,
        source: "built-in",
        intent: "reply",
        target: human.from,
        topic: inferConversationTopic(human.text)
      });
      if (replies.length >= 1 && (Math.random() > 0.34 || replies.length >= 2)) break;
    }
    return replies;
  }

  recentThreadMessage(thread) {
    if (!thread) return null;
    return [...this.history].reverse().find((message) => {
      if (!message.from || message.kind === "system") return false;
      if (message.threadId && message.threadId === thread.id) return true;
      return message.topic === thread.topic && thread.participants.includes(message.from);
    }) || null;
  }

  builtInAmbient() {
    const humans = this.humanNames();
    const thread = Math.random() < 0.72 ? chooseThread(this.social, this.activeBotNames, humans) : null;
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
        () => react ? renderReaction(character, recent) : renderAmbient(character),
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

      for (const reply of replies.slice(0, 3)) {
        this.aiQueue.push({
          ...reply,
          source: reply.source || source,
          intent: reply.intent || "reply",
          target: reply.target || human.from,
          topic: reply.topic || inferConversationTopic(human.text)
        });
      }
    }

    if (this.env.GROQ_API_KEY && !this.pendingHumans.length && !this.aiQueue.length && now - this.lastBackgroundAiAt >= BACKGROUND_AI_COOLDOWN_MS) {
      this.lastBackgroundAiAt = now;
      const generated = await this.generateGroqBatch();
      for (const item of generated) {
        this.aiQueue.push({
          ...item,
          source: "groq",
          intent: item.intent || "conversation",
          target: item.target || "room",
          topic: item.topic || inferConversationTopic(item.text)
        });
      }
    }

    const next = this.aiQueue.length ? this.aiQueue.shift() : this.builtInAmbient();
    if (next && this.activeBotNames.includes(next.speaker)) {
      this.say(next.speaker, next.text, "bot", next.source || "built-in", {
        intent: next.intent || "ambient",
        target: next.target || "room",
        topic: next.topic || inferConversationTopic(next.text),
        threadId: next.threadId || ""
      });
    }

    this.heat = clamp(this.heat - 0.22, 0, 10);
    this.nextBotAt = now + 2100 + Math.floor(Math.random() * 4300);
  }

  recentTranscript(limit = 30) {
    return this.history.slice(-limit).map((m) => {
      if (m.kind === "system") return `[system] ${m.text}`;
      const thread = m.threadId ? ` {${m.threadId}/${m.topic || "general"}}` : "";
      const target = m.target && m.target !== "room" ? ` -> ${m.target}` : "";
      return `${m.from}${target}: ${m.text}${thread}`;
    }).join("\n");
  }

  promptProfiles(characters, max = 14) {
    return characters.slice(0, max).map(characterPrompt).join("\n");
  }

  parseGroqMessages(content, max = 5, defaultTarget = "room") {
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
      if (!activeNames.has(speaker) || !text || text.length > 140 || !botLineAllowed(text)) continue;
      if (isTooSimilar(text, tempHistory, speaker)) continue;
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

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.env.GROQ_MODEL || "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `It is ${simulatedDateTimeLabel()}. The world is 1996. You are simulating fictional adult AOL chat users. Never act like an assistant. Never invent or contradict a character's fixed profile facts, memories, or relationship history. Return only valid JSON.`
            },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "low",
          max_completion_tokens: maxTokens,
          temperature: 0.98
        })
      });

      if (!response.ok) {
        this.setAiStatus(`Groq error ${response.status}`);
        return [];
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        this.setAiStatus("Groq response error");
        return [];
      }

      const messages = this.parseGroqMessages(content, maxMessages, defaultTarget);
      this.setAiStatus(messages.length ? "Groq active" : "Groq returned no usable chat");
      return messages;
    } catch {
      this.setAiStatus("Groq connection error");
      return [];
    }
  }

  async generateGroqHumanReply(human) {
    const ranked = this.rankedResponders(human, 7);
    const extras = shuffled(this.activeCharacters().filter((c) => !ranked.some((r) => r.name === c.name))).slice(0, 5);
    const participants = [...ranked, ...extras];
    const humanNames = this.humanNames().join(", ") || "none";
    const participantNames = participants.map((c) => c.name);
    const memory = humanMemoryPrompt(this.social, human.from, participantNames, 8);
    const relationships = relationshipPrompt(this.social, [...participantNames, human.from], 16);
    const threads = threadPrompt(this.social, Date.now(), 5);

    const prompt = `ROOM: People Connection / Town Square. Current simulated time: ${simulatedDateTimeLabel()}. Everyone believes this is 1996.\n\nFIXED FICTIONAL CHARACTER PROFILES:\n${this.promptProfiles(participants, 12)}\n\nRELATIONSHIPS THAT MATTER:\n${relationships}\n\nWHAT INDIVIDUAL BOTS ACTUALLY REMEMBER ABOUT ${human.from}:\n${memory}\nOnly let a bot refer to a remembered fact if that bot's memory line above says it remembers it. Do not give bots shared omniscient memory.\n\nACTIVE CONVERSATION THREADS:\n${threads}\n\nReal human screen names currently in the room: ${humanNames}. Do not invent profile facts for humans.\n\nRecent room transcript:\n${this.recentTranscript(32) || "The room just opened."}\n\nLatest HUMAN message:\n${human.from}: ${human.text}\nDetected topic hints: ${topicNamesForPrompt(human.text)}\nBest likely responders, in order: ${ranked.map((c) => c.name).join(", ")}.\n\nGenerate 1 to 3 plausible NEXT chat lines. At least one line MUST naturally respond to ${human.from}'s latest message. ${human.target !== "room" ? `${human.from} directly addressed ${human.target}, so ${human.target} should usually answer.` : "Nobody was directly addressed, so choose whoever would realistically care."} A second or third character may respond to another bot or continue a different active thread. Do not make everybody answer the human. Respect relationship history: friends can joke warmly, rivals disagree more easily, strangers should not act close. Keep each line usually 1-12 words. Casual 1996 chat, typos and fragments are fine. No polished prose, no assistant tone, no biography dumps. Knowledge ends in 1996. Future things are unknown and should sound fake or confusing.\n\nOutput JSON only in this exact shape:\n{"messages":[{"speaker":"JennJenn","text":"...","target":"${human.from}","intent":"reply","topic":"music"}]}\n\nOnly use active bot speakers from: ${this.activeBotNames.join(", ")}.`;

    return this.callGroq(prompt, 300, 3, human.from);
  }

  async generateGroqBatch() {
    const currentThreads = activeThreads(this.social, Date.now());
    const threadedNames = new Set(currentThreads.flatMap((thread) => thread.participants));
    const active = this.activeCharacters().sort((a, b) => {
      const at = threadedNames.has(a.name) ? 1 : 0;
      const bt = threadedNames.has(b.name) ? 1 : 0;
      return bt - at;
    }).slice(0, 15);
    const humanNames = this.humanNames();
    const relationshipNames = [...active.map((c) => c.name), ...humanNames];

    const prompt = `ROOM: People Connection / Town Square. Current simulated time: ${simulatedDateTimeLabel()}. Everyone believes it is 1996.\n\nFIXED FICTIONAL CHARACTER PROFILES:\n${this.promptProfiles(active, 15)}\n\nRELATIONSHIPS:\n${relationshipPrompt(this.social, relationshipNames, 20)}\n\nACTIVE CONVERSATION THREADS:\n${threadPrompt(this.social, Date.now(), 6)}\n\nReal humans present: ${humanNames.join(", ") || "none"}.\n\nRecent transcript:\n${this.recentTranscript(34) || "The room just opened."}\n\nGenerate 3 to 5 plausible NEXT chat lines that make the room feel socially alive. Continue one or two active threads instead of making every line a new topic. It is okay for another unrelated conversation to overlap, because AOL rooms are messy. Bots should talk to each other, occasionally to a human who recently spoke, and should behave according to their relationships. Do not make everyone agreeable. Preserve every character's fixed profile and do not invent memories. Keep messages usually 1-12 words, informal, imperfect, and period-appropriate. Knowledge ends in 1996.\n\nOutput JSON only:\n{"messages":[{"speaker":"CyberDude","text":"...","target":"WebMasterJ","intent":"thread-reply","topic":"web"}]}\n\nOnly use active bot speakers from: ${this.activeBotNames.join(", ")}.`;

    return this.callGroq(prompt, 420, 5, "room");
  }

  debugState(name) {
    const topRelationships = this.activeBotNames
      .map((bot) => ({
        bot,
        score: relationshipScore(this.social, bot, name),
        interactions: relationshipInteractions(this.social, bot, name)
      }))
      .filter((row) => row.interactions > 0 || Math.abs(row.score) >= 8)
      .sort((a, b) => (b.interactions * 4 + Math.abs(b.score)) - (a.interactions * 4 + Math.abs(a.score)))
      .slice(0, 6)
      .map((row) => `${row.bot}:${relationshipLabel(row.score)}(${Math.round(row.score)})`);

    return {
      pass: 2,
      simulated: simulatedDateTimeLabel(),
      roster: this.activeBotNames.length,
      threads: activeThreads(this.social).slice(0, 5).map((thread) => ({
        id: thread.id,
        topic: thread.topic,
        people: thread.participants,
        turns: thread.turns
      })),
      memory: humanMemorySummary(this.social, name),
      relationships: topRelationships,
      schedules: this.activeCharacters().slice(0, 4).map((character) => presenceDebug(character))
    };
  }

  sendDebug(ws, name) {
    try { ws.send(JSON.stringify({ type: "social_debug", state: this.debugState(name) })); } catch {}
  }
}
