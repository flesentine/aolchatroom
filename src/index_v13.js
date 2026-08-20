import baseWorker, { ChatRoom as ScreenNameChatRoom } from "./index_v12.js";
import { mirrorDateKey } from "./culture.js";
import { eraWorldAllowed, eraWorldViolation, eraWorldPrompt } from "./era_world.js";

export default baseWorker;

export class ChatRoom extends ScreenNameChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastEraReject = null;
    this.eraRejectCount = 0;
  }

  currentEraDate() {
    return mirrorDateKey(Date.now());
  }

  rejectEraLine(speaker, text, source = "") {
    const dateKey = this.currentEraDate();
    const reason = eraWorldViolation(text, dateKey);
    if (!reason) return false;
    this.eraRejectCount += 1;
    this.lastEraReject = {
      speaker,
      text: String(text || "").slice(0, 120),
      reason,
      source,
      dateKey,
      at: Date.now()
    };
    return true;
  }

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const boundary = eraWorldPrompt(this.currentEraDate());
    return super.callGroq(`${boundary}\n\n${prompt}`, maxTokens, maxMessages, defaultTarget);
  }

  parseGroqMessages(content, max = 10, defaultTarget = "room") {
    const parsed = super.parseGroqMessages(content, max, defaultTarget);
    const dateKey = this.currentEraDate();
    const accepted = [];
    for (const item of parsed) {
      if (!eraWorldAllowed(item.text, dateKey)) {
        this.rejectEraLine(item.speaker, item.text, "groq-parse");
        continue;
      }
      accepted.push(item);
      if (accepted.length >= max) break;
    }
    return accepted;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot" && this.rejectEraLine(from, text, source)) return false;
    return super.say(from, text, kind, source, meta);
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "sealed-1996-world-v13",
      eraWorld: {
        date: this.currentEraDate(),
        rule: "characters know only the world available by this 1996 date",
        rejectedLines: this.eraRejectCount,
        lastReject: this.lastEraReject
      }
    };
  }
}
