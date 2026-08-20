import baseWorker, { ChatRoom as TypingChatRoom } from "./index_v07.js";
import {
  getCultureContext,
  culturePrompt,
  mirrorDateKey,
  historicallyAllowedText
} from "./culture.js";

export default baseWorker;

export class ChatRoom extends TypingChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.culture = null;
    this.culturePromise = null;
  }

  async ensureCulture(now = Date.now()) {
    const dateKey = mirrorDateKey(now);
    if (this.culture?.dateKey === dateKey) return this.culture;
    if (this.culturePromise) return this.culturePromise;

    this.culturePromise = getCultureContext(this.ctx.storage, now)
      .then((context) => {
        this.culture = context;
        return context;
      })
      .finally(() => {
        this.culturePromise = null;
      });

    return this.culturePromise;
  }

  async tick(forceSoon = false) {
    await this.ensureCulture(Date.now());
    return super.tick(forceSoon);
  }

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const context = await this.ensureCulture(Date.now());
    const historical = culturePrompt(context);
    const enriched = historical ? `${historical}\n\n${prompt}` : prompt;
    return super.callGroq(enriched, maxTokens, maxMessages, defaultTarget);
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot" && !historicallyAllowedText(text, mirrorDateKey(Date.now()))) return false;
    return super.say(from, text, kind, source, meta);
  }

  builtInHumanReply(human) {
    const dateKey = mirrorDateKey(Date.now());
    return super.builtInHumanReply(human)
      .filter((reply) => historicallyAllowedText(reply.text, dateKey));
  }

  builtInAmbient() {
    const dateKey = mirrorDateKey(Date.now());
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const item = super.builtInAmbient();
      if (!item) return null;
      if (historicallyAllowedText(item.text, dateKey)) return item;
    }
    return null;
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      culture: this.culture ? {
        date: this.culture.dateKey,
        tv: this.culture.tv?.slice(0, 5).map((row) => `${row.date}:${row.show}`) || [],
        movies: this.culture.movies?.slice(0, 5).map((row) => `${row.date}:${row.title}`) || [],
        anchors: this.culture.anchors?.slice(0, 5).map((row) => `${row.date}:${row.title}`) || [],
        sources: this.culture.sources || {}
      } : { loading: true }
    };
  }
}
