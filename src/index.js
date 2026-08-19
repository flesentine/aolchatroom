import { DurableObject } from "cloudflare:workers";

const REGULARS = [
  { name: "JennJenn", vibe: "friendly, nosy, likes Friends and Green Day" },
  { name: "DaBomb96", vibe: "cocky, argumentative, thinks everything sucks" },
  { name: "CyberDude", vibe: "computer kid, Netscape, GeoCities, Quake" },
  { name: "Sk8rGuy16", vibe: "skater, sarcastic, PlayStation fan" },
  { name: "NYMike23", vibe: "sports guy, blunt, always claims he knows somebody" },
  { name: "xXBabyGirlXx", vibe: "gossipy, lots of lol and omg" },
  { name: "SegaMan", vibe: "defends Sega Saturn way too seriously" },
  { name: "CoolChick17", vibe: "bored teenager, short replies, easily annoyed" },
  { name: "MetallicaFan", vibe: "music snob, mostly talks about bands" },
  { name: "WebMasterJ", vibe: "building a homepage, obsessed with HTML counters" },
  { name: "SoCalGuy", vibe: "Orange County teenager, skate and mall chatter" },
  { name: "MoonChild", vibe: "X-Files fan, dramatic and weird" }
];

const TRANSIENTS = [
  "AznPride96", "BballKid", "CaliGrrl", "DoomBoy", "EvilClown", "Freakazoid",
  "GrungeKid", "HotStuff21", "IceMan77", "JazzyJ", "KewlDude", "LilDevil",
  "MacAddict", "N64Freak", "OasisFan", "PunkGirl", "QBall", "RageBoy",
  "SpiceGrrl", "TeenAngel", "UnixGeek", "VampChick", "WildThing", "XFilesNut",
  "Yankees1", "ZeldaKid", "MrBiggles", "Starla", "NoFear96", "Phreaker"
];

const TOS_NAMES = ["TOSSteve", "TOSGina", "TOSMike", "TOSKaren", "TOSDan", "TOSLisa"];

const FALLBACK_LINES = [
  ["JennJenn", "anyone watch friends last night"],
  ["DaBomb96", "this room is dead"],
  ["CyberDude", "anybody know a good geocities counter"],
  ["Sk8rGuy16", "psx rules lol"],
  ["SegaMan", "saturn is better u just dont know"],
  ["CoolChick17", "im bored"],
  ["NYMike23", "anybody from ny"],
  ["MetallicaFan", "new metallica is ok i guess"],
  ["WebMasterJ", "my homepage has frames now"],
  ["MoonChild", "x files is on tonight right"],
  ["xXBabyGirlXx", "omg brb phone"],
  ["SoCalGuy", "anybody been to the block yet"]
];

const ARGUMENT_LINES = [
  ["DaBomb96", "shut up mike"],
  ["NYMike23", "lol make me"],
  ["Sk8rGuy16", "u guys are idiots"],
  ["DaBomb96", "whatever loser"],
  ["CoolChick17", "omg stop already"]
];

const CHILL_LINES = [
  ["JennJenn", "hi tos"],
  ["DaBomb96", "..."],
  ["Sk8rGuy16", "everybody behave lol"],
  ["NYMike23", "wasnt me"],
  ["xXBabyGirlXx", "lol"]
];

const MODERN_TERMS = /\b(iphone|youtube|facebook|tiktok|instagram|reddit|bitcoin|spotify|netflix|tesla|discord|snapchat|wikipedia|gmail|android|uber|lyft|twitter|x\.com|chatgpt|openai|covid|9\/11|september 11)\b/i;
const FUTURE_YEAR = /\b(199[7-9]|20\d\d)\b/;
const HEAT_WORDS = /\b(shut up|idiot|loser|moron|stupid|sucks|screw you|stfu|asshole|bitch|fuck|shit)\b/i;

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function cleanScreenName(value) {
  return String(value || "Guest")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, 16) || "Guest";
}

function sanitizeText(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 320);
}

function botLineAllowed(text) {
  if (FUTURE_YEAR.test(text)) return false;
  if (!MODERN_TERMS.test(text)) return true;
  return /\b(what|whats|what's|huh|wtf|never heard|is that|sounds fake|made that up)\b/i.test(text);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, room: "Town Square", simulatedDate: env.SIMULATED_DATE });
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
    this.nextBotAt = Date.now() + 2500;
    this.targetOccupancy = 23;
    this.targetChangesAt = Date.now() + 90000;
    this.heat = 0;
    this.tos = null;
    this.lastAiBatchAt = 0;
    this.history = [];

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    const name = cleanScreenName(url.searchParams.get("name"));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.serializeAttachment({ name, joinedAt: Date.now() });
    this.ctx.acceptWebSocket(server);

    await this.ensureHistory();
    this.system(`${name} has entered the room.`);
    this.broadcastPresence();

    server.send(JSON.stringify({
      type: "hello",
      room: "Town Square",
      simulatedDate: this.env.SIMULATED_DATE || "November 22, 1996",
      history: this.history.slice(-40),
      users: this.visibleUsers(),
      provider: this.env.GROQ_API_KEY ? "Groq" : "Built-in 1996 chatter"
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
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type !== "chat") return;
    const attachment = ws.deserializeAttachment() || {};
    const from = cleanScreenName(attachment.name);
    const text = sanitizeText(data.text);
    if (!text) return;

    this.say(from, text, "human");
    if (HEAT_WORDS.test(text)) this.heat = clamp(this.heat + 2, 0, 10);
    await this.tick(true);
  }

  webSocketClose(ws) {
    const attachment = ws.deserializeAttachment() || {};
    const name = cleanScreenName(attachment.name);
    this.system(`${name} has left the room.`);
    this.broadcastPresence();
  }

  webSocketError(ws) {
    try { ws.close(1011, "socket error"); } catch {}
  }

  async ensureHistory() {
    if (this.history.length) return;
    const saved = await this.ctx.storage.get("history");
    if (Array.isArray(saved)) this.history = saved.slice(-60);
  }

  humanNames() {
    return this.ctx.getWebSockets().map((ws) => {
      const a = ws.deserializeAttachment() || {};
      return cleanScreenName(a.name);
    });
  }

  visibleUsers() {
    const humans = this.humanNames();
    const tos = this.tos ? [this.tos.name] : [];
    const botSlots = clamp(this.targetOccupancy - humans.length - tos.length, 7, 36);
    const bots = [...REGULARS.map((x) => x.name), ...TRANSIENTS].slice(0, botSlots);
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
    this.broadcast({ type: "presence", users, count: users.length });
  }

  async persistHistory() {
    this.history = this.history.slice(-60);
    await this.ctx.storage.put("history", this.history);
  }

  pushMessage(message) {
    const item = { ...message, at: Date.now() };
    this.history.push(item);
    this.broadcast({ type: "message", message: item });
    this.persistHistory().catch(() => {});
  }

  say(from, text, kind = "bot") {
    this.pushMessage({ from, text, kind });
    if (HEAT_WORDS.test(text)) this.heat = clamp(this.heat + 1, 0, 10);
  }

  system(text) {
    this.pushMessage({ from: "", text, kind: "system" });
  }

  async tick(forceSoon = false) {
    const now = Date.now();

    if (now >= this.targetChangesAt) {
      this.targetOccupancy = 18 + Math.floor(Math.random() * 8);
      this.targetChangesAt = now + 60000 + Math.floor(Math.random() * 120000);
      this.broadcastPresence();
    }

    if (this.tos) {
      if (!this.tos.warned && now - this.tos.enteredAt > 7000) {
        this.say(this.tos.name, "Please keep the conversation appropriate. Thanks.", "tos");
        this.tos.warned = true;
        this.heat = 1;
      }
      if (now - this.tos.enteredAt > 55000) {
        const name = this.tos.name;
        this.tos = null;
        this.system(`${name} has left the room.`);
        this.broadcastPresence();
        this.nextBotAt = now + 2500;
      }
    } else if (this.heat >= 5 && Math.random() < 0.38) {
      this.tos = { name: randomOf(TOS_NAMES), enteredAt: now, warned: false };
      this.system(`${this.tos.name} has entered the room.`);
      this.broadcastPresence();
      this.nextBotAt = now + 4500;
      return;
    }

    if (forceSoon && this.nextBotAt - now > 3500) this.nextBotAt = now + 1200;
    if (now < this.nextBotAt) return;

    if (this.env.GROQ_API_KEY && !this.aiQueue.length && now - this.lastAiBatchAt >= 120000) {
      this.lastAiBatchAt = now;
      const generated = await this.generateGroqBatch();
      if (generated.length) this.aiQueue.push(...generated);
    }

    let line;
    if (this.tos) {
      line = randomOf(CHILL_LINES);
    } else if (this.aiQueue.length) {
      const next = this.aiQueue.shift();
      line = [next.speaker, next.text];
    } else if (this.heat >= 3 && Math.random() < 0.5) {
      line = randomOf(ARGUMENT_LINES);
    } else {
      line = randomOf(FALLBACK_LINES);
    }

    if (line) this.say(line[0], line[1], "bot");
    this.heat = clamp(this.heat - 0.25, 0, 10);
    this.nextBotAt = now + 3500 + Math.floor(Math.random() * 7000);
  }

  async generateGroqBatch() {
    try {
      const recent = this.history.slice(-18).map((m) => {
        if (m.kind === "system") return `[system] ${m.text}`;
        return `${m.from}: ${m.text}`;
      }).join("\n");

      const personalities = REGULARS.map((r) => `${r.name}: ${r.vibe}`).join("\n");
      const prompt = `You are directing a messy AOL chat room on November 22, 1996.\n\n${personalities}\n\nRecent room:\n${recent || "The room just opened."}\n\nGenerate 3 to 5 plausible next chat lines. Characters talk to each other, not just the human. Messages are usually 1-12 words, casual, lowercase often, typos allowed, no polished assistant language, no explanations, no markdown. They may ignore questions. Knowledge ends on November 22, 1996. Never state knowledge of later events or technology. If a human mentions something from the future, characters can only be confused or think it is made up. Do not make every line a 1990s reference. Output JSON only: {"messages":[{"speaker":"JennJenn","text":"..."}]}. Use only these speakers: ${REGULARS.map((r) => r.name).join(", ")}.`;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.env.GROQ_MODEL || "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: "Stay strictly inside the fictional date and return only valid JSON." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "low",
          max_completion_tokens: 260,
          temperature: 0.95
        })
      });

      if (!response.ok) return [];
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return [];
      const parsed = JSON.parse(content);
      const allowedNames = new Set(REGULARS.map((x) => x.name));
      return (Array.isArray(parsed.messages) ? parsed.messages : [])
        .map((m) => ({ speaker: cleanScreenName(m.speaker), text: sanitizeText(m.text) }))
        .filter((m) => allowedNames.has(m.speaker) && m.text && m.text.length <= 140 && botLineAllowed(m.text))
        .slice(0, 5);
    } catch {
      return [];
    }
  }
}
