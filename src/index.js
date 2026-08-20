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

const MODERN_TERMS = /\b(iphone|youtube|facebook|tiktok|instagram|reddit|bitcoin|spotify|netflix|tesla|discord|snapchat|wikipedia|gmail|android|uber|lyft|twitter|x\.com|chatgpt|openai|covid|9\/11|september 11)\b/i;
const FUTURE_YEAR = /\b(199[7-9]|20\d\d)\b/;
const HEAT_WORDS = /\b(shut up|idiot|loser|moron|stupid|sucks|screw you|stfu|asshole|bitch|fuck|shit)\b/i;
const HUMAN_AI_COOLDOWN_MS = 7000;
const BACKGROUND_AI_COOLDOWN_MS = 75000;
const MAX_HISTORY = 180;

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        room: "Town Square",
        simulatedDate: env.SIMULATED_DATE,
        groqConfigured: Boolean(env.GROQ_API_KEY),
        characterCount: CHARACTERS.length,
        pass: 1
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
    this.aiQueue = [];
    this.pendingHumans = [];
    this.nextBotAt = Date.now() + 2200;
    this.targetOccupancy = 23;
    this.targetChangesAt = Date.now() + 90000;
    this.heat = 0;
    this.tos = null;
    this.lastHumanAiAt = 0;
    this.lastBackgroundAiAt = 0;
    this.history = [];
    this.activeBotNames = [...CORE_NAMES];
    this.aiStatus = env.GROQ_API_KEY ? "Groq configured" : "Built-in 1996 chatter";
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const name = cleanScreenName(url.searchParams.get("name"));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.serializeAttachment({ name, joinedAt: Date.now() });
    this.ctx.acceptWebSocket(server);

    await this.ensureHistory();
    this.syncBotPopulation();
    this.system(`${name} has entered the room.`);
    this.broadcastPresence();

    server.send(JSON.stringify({
      type: "hello",
      room: "Town Square",
      simulatedDate: this.env.SIMULATED_DATE || "November 22, 1996",
      history: this.history.slice(-70),
      users: this.visibleUsers(),
      provider: this.aiStatus,
      pass: 1
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (raw === "pulse") {
      await this.tick();
      return;
    }

    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === "profile") {
      const profile = publicCharacterProfile(getCharacter(cleanScreenName(data.name)));
      try {
        ws.send(JSON.stringify({ type: "profile", profile, requestedName: cleanScreenName(data.name) }));
      } catch {}
      return;
    }

    if (data.type !== "chat") return;
    const attachment = ws.deserializeAttachment() || {};
    const from = cleanScreenName(attachment.name);
    const text = sanitizeText(data.text);
    if (!text) return;

    this.say(from, text, "human", "human", { intent: "human", target: "room" });
    if (HEAT_WORDS.test(text)) this.heat = clamp(this.heat + 2, 0, 10);

    this.pendingHumans.push({ from, text, at: Date.now() });
    this.pendingHumans = this.pendingHumans.slice(-8);
    this.nextBotAt = Math.min(this.nextBotAt, Date.now() + 700);
    await this.tick(true);
  }

  webSocketClose(ws) {
    const attachment = ws.deserializeAttachment() || {};
    const name = cleanScreenName(attachment.name);
    this.system(`${name} has left the room.`);
    this.syncBotPopulation();
    this.broadcastPresence();
  }

  webSocketError(ws) {
    try { ws.close(1011, "socket error"); } catch {}
  }

  async ensureHistory() {
    if (this.history.length) return;
    const saved = await this.ctx.storage.get("history");
    if (Array.isArray(saved)) this.history = saved.slice(-MAX_HISTORY);
  }

  humanNames() {
    return this.ctx.getWebSockets().map((ws) => {
      const attachment = ws.deserializeAttachment() || {};
      return cleanScreenName(attachment.name);
    });
  }

  syncBotPopulation() {
    const humans = new Set(this.humanNames());
    const tosCount = this.tos ? 1 : 0;
    const needed = clamp(this.targetOccupancy - humans.size - tosCount, 8, CHARACTERS.length);
    let active = this.activeBotNames.filter((name) => getCharacter(name) && !humans.has(name));

    for (const name of CORE_NAMES) {
      if (active.length >= needed) break;
      if (!humans.has(name) && !active.includes(name)) active.push(name);
    }

    const candidates = shuffled(CHARACTERS.map((c) => c.name).filter((name) => !humans.has(name) && !active.includes(name)));
    while (active.length < needed && candidates.length) active.push(candidates.pop());

    if (active.length > needed) {
      const coreSet = new Set(CORE_NAMES);
      const keepCore = active.filter((name) => coreSet.has(name)).slice(0, needed);
      const extras = active.filter((name) => !coreSet.has(name));
      active = [...keepCore, ...extras.slice(0, Math.max(0, needed - keepCore.length))];
    }

    this.activeBotNames = active;
  }

  activeCharacters() {
    this.syncBotPopulation();
    return this.activeBotNames.map(getCharacter).filter(Boolean);
  }

  visibleUsers() {
    this.syncBotPopulation();
    const humans = this.humanNames();
    const tos = this.tos ? [this.tos.name] : [];
    return [...humans, ...tos, ...this.activeBotNames].slice(0, 40);
  }

  broadcast(payload) {
    const encoded = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(encoded); } catch {}
    }
  }

  broadcastPresence() {
    const users = this.visibleUsers();
    this.broadcast({ type: "presence", users, count: users.length });
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

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const cleaned = sanitizeText(text);
    if (!cleaned) return false;
    if (kind === "bot" && (!botLineAllowed(cleaned) || isTooSimilar(cleaned, this.history, from))) return false;
    this.pushMessage({ from, text: cleaned, kind, source, ...meta });
    if (HEAT_WORDS.test(cleaned)) this.heat = clamp(this.heat + 1, 0, 10);
    return true;
  }

  system(text) {
    this.pushMessage({ from: "", text, kind: "system", source: "system" });
  }

  rankedResponders(human, limit = 6) {
    return this.activeCharacters()
      .map((character) => ({ character, score: scoreCharacterForText(character, human.text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.character);
  }

  builtInHumanReply(human) {
    const ranked = this.rankedResponders(human, 8);
    for (const character of ranked) {
      const text = chooseDistinctLine(
        () => renderDirectedFallback(character, human),
        this.history,
        character.name,
        18
      );
      if (text) {
        return [{
          speaker: character.name,
          text,
          source: "built-in",
          intent: "reply",
          target: human.from
        }];
      }
    }
    return [];
  }

  builtInAmbient() {
    const characters = shuffled(this.activeCharacters());
    const recentBot = [...this.history].reverse().find((m) => m.kind === "bot" && m.from);

    for (const character of characters) {
      if (recentBot && recentBot.from === character.name) continue;
      const react = recentBot && Math.random() < 0.48;
      const text = chooseDistinctLine(
        () => react ? renderReaction(character, recentBot) : renderAmbient(character),
        this.history,
        character.name,
        28
      );
      if (!text) continue;
      return {
        speaker: character.name,
        text,
        source: "built-in",
        intent: react ? "bot-reply" : "ambient",
        target: react ? recentBot.from : "room"
      };
    }
    return null;
  }

  async tick(forceSoon = false) {
    const now = Date.now();

    if (now >= this.targetChangesAt) {
      this.targetOccupancy = 18 + Math.floor(Math.random() * 8);
      this.targetChangesAt = now + 60000 + Math.floor(Math.random() * 120000);
      this.syncBotPopulation();
      this.broadcastPresence();
    }

    if (this.tos) {
      if (!this.tos.warned && now - this.tos.enteredAt > 6500) {
        this.say(this.tos.name, randomOf(this.tos.warnings), "tos", "tos", { intent: "moderate", target: "room" });
        this.tos.warned = true;
        this.heat = 1;
      }
      if (now - this.tos.enteredAt > 50000) {
        const name = this.tos.name;
        this.tos = null;
        this.system(`${name} has left the room.`);
        this.syncBotPopulation();
        this.broadcastPresence();
        this.nextBotAt = now + 2400;
      }
    } else if (this.heat >= 5 && Math.random() < 0.38) {
      const profile = randomOf(TOS_PROFILES);
      this.tos = { ...profile, enteredAt: now, warned: false };
      this.system(`${this.tos.name} has entered the room.`);
      this.syncBotPopulation();
      this.broadcastPresence();
      this.nextBotAt = now + 3800;
      return;
    }

    if (forceSoon && this.nextBotAt - now > 900) this.nextBotAt = now + 650;
    if (now < this.nextBotAt) return;

    if (this.tos && Math.random() < 0.65) {
      const line = randomOf(CHILL_LINES);
      if (this.activeBotNames.includes(line[0])) {
        this.say(line[0], line[1], "bot", "built-in", { intent: "tos-reaction", target: this.tos.name });
      }
      this.nextBotAt = now + 2600 + Math.floor(Math.random() * 3800);
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
          target: reply.target || human.from
        });
      }
    }

    if (this.env.GROQ_API_KEY && !this.pendingHumans.length && !this.aiQueue.length && now - this.lastBackgroundAiAt >= BACKGROUND_AI_COOLDOWN_MS) {
      this.lastBackgroundAiAt = now;
      const generated = await this.generateGroqBatch();
      for (const item of generated) this.aiQueue.push({ ...item, source: "groq", intent: item.intent || "conversation", target: item.target || "room" });
    }

    let next = null;
    if (this.aiQueue.length) {
      next = this.aiQueue.shift();
    } else {
      next = this.builtInAmbient();
    }

    if (next) {
      this.say(next.speaker, next.text, "bot", next.source || "built-in", {
        intent: next.intent || "ambient",
        target: next.target || "room"
      });
    }

    this.heat = clamp(this.heat - 0.22, 0, 10);
    this.nextBotAt = now + 2400 + Math.floor(Math.random() * 4700);
  }

  recentTranscript(limit = 24) {
    return this.history.slice(-limit).map((m) => {
      if (m.kind === "system") return `[system] ${m.text}`;
      return `${m.from}: ${m.text}`;
    }).join("\n");
  }

  promptProfiles(characters, max = 14) {
    return characters.slice(0, max).map(characterPrompt).join("\n");
  }

  parseGroqMessages(content, max = 5, defaultTarget = "room") {
    const parsed = JSON.parse(content);
    const activeNames = new Set(this.activeBotNames);
    const accepted = [];
    const tempHistory = [...this.history];

    for (const raw of Array.isArray(parsed.messages) ? parsed.messages : []) {
      const speaker = cleanScreenName(raw.speaker);
      const text = sanitizeText(raw.text);
      if (!activeNames.has(speaker) || !text || text.length > 140 || !botLineAllowed(text)) continue;
      if (isTooSimilar(text, tempHistory, speaker)) continue;
      const item = {
        speaker,
        text,
        target: cleanScreenName(raw.target || defaultTarget) || defaultTarget,
        intent: sanitizeText(raw.intent || "conversation").slice(0, 30)
      };
      accepted.push(item);
      tempHistory.push({ from: speaker, text, kind: "bot" });
      if (accepted.length >= max) break;
    }
    return accepted;
  }

  async callGroq(prompt, maxTokens = 320, maxMessages = 5, defaultTarget = "room") {
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
              content: "It is November 22, 1996. You are simulating fictional adult AOL chat users. Never act like an assistant. Never invent or contradict a character's fixed profile facts. Return only valid JSON."
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
    const ranked = this.rankedResponders(human, 6);
    const extras = shuffled(this.activeCharacters().filter((c) => !ranked.some((r) => r.name === c.name))).slice(0, 6);
    const participants = [...ranked, ...extras];
    const humanNames = this.humanNames().join(", ") || "none";

    const prompt = `ROOM: People Connection / Town Square. Date: November 22, 1996.\n\nFIXED FICTIONAL CHARACTER PROFILES:\n${this.promptProfiles(participants, 12)}\n\nReal human screen names currently in the room: ${humanNames}. Do not invent profile facts for humans.\n\nRecent room transcript:\n${this.recentTranscript(26) || "The room just opened."}\n\nLatest HUMAN message:\n${human.from}: ${human.text}\nDetected topic hints: ${topicNamesForPrompt(human.text)}\nBest likely responders, in order: ${ranked.map((c) => c.name).join(", ")}.\n\nGenerate 1 to 3 plausible NEXT chat lines. At least one line MUST naturally respond to ${human.from}'s latest message. Prefer one of the likely responders when it fits. A second or third character may respond to another bot or react to the first reply. Do not make everybody answer the human. Keep each line usually 1-12 words. Casual 1996 chat, typos and fragments are fine. No polished prose, no assistant tone, no exposition of profile facts unless someone asked. Characters may disagree, tease, misunderstand, or answer briefly. Their knowledge ends on November 22, 1996. Future things are unknown and should sound fake or confusing.\n\nOutput JSON only in this exact shape:\n{"messages":[{"speaker":"JennJenn","text":"...","target":"${human.from}","intent":"reply"}]}\n\nOnly use active bot speakers from: ${this.activeBotNames.join(", ")}.`;

    return this.callGroq(prompt, 260, 3, human.from);
  }

  async generateGroqBatch() {
    const active = shuffled(this.activeCharacters()).slice(0, 14);
    const humanNames = this.humanNames().join(", ") || "none";
    const prompt = `ROOM: People Connection / Town Square. Date: November 22, 1996.\n\nFIXED FICTIONAL CHARACTER PROFILES:\n${this.promptProfiles(active, 14)}\n\nReal human screen names present: ${humanNames}.\n\nRecent transcript:\n${this.recentTranscript(28) || "The room just opened."}\n\nGenerate 3 to 5 plausible NEXT chat lines that make the room feel socially alive. At least two lines should clearly connect to another recent line or to each other, so bots actually converse instead of firing unrelated one-liners. It is fine for one line to start a new topic. Humans can be included naturally if they recently spoke, but bots should also talk among themselves. Preserve every character's profile, interests, tone, age, sex, location, job, and opinions. Do not dump biography facts. Keep messages usually 1-12 words, informal, imperfect, and period-appropriate. Knowledge ends November 22, 1996.\n\nOutput JSON only:\n{"messages":[{"speaker":"CyberDude","text":"...","target":"WebMasterJ","intent":"bot-reply"}]}\n\nOnly use active bot speakers from: ${this.activeBotNames.join(", ")}.`;

    return this.callGroq(prompt, 360, 5, "room");
  }
}
