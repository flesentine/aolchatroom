import baseWorker, { ChatRoom as ContinuityChatRoom } from "./index_v14.js";
import { simulatedDateTimeLabel } from "./social.js";
import { messageAddressesRoom, messageBreaksFocus, subjectForText } from "./continuity.js";

const PROVIDER_LABELS = {
  groq: "Groq",
  gemini: "Gemini",
  "workers-ai": "Workers AI"
};

const DEFAULT_COOLDOWN_MS = {
  groq: 90000,
  gemini: 60000,
  "workers-ai": 30000
};

const QUESTION_WINDOW_MS = 90000;
const REPLY_LINK_WINDOW_MS = 180000;

function messageKey(speaker, text) {
  return `${String(speaker || "")}\n${String(text || "")}`;
}

function retryAfterMs(response, fallbackMs) {
  const raw = response?.headers?.get?.("retry-after");
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(1000, Math.ceil(seconds * 1000));
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(1000, when - Date.now());
  return fallbackMs;
}

function extractJsonText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

function providerSystemPrompt() {
  return `It is ${simulatedDateTimeLabel()}. The world is 1996. You are simulating fictional adult AOL chat users. Never act like an assistant. Never invent or contradict a character's fixed profile facts, memories, or relationship history. Return only valid JSON.`;
}

function looksLikeQuestion(row) {
  const text = String(row?.text || "").trim();
  if (!text) return false;
  if (String(row?.intent || "").toLowerCase() === "question") return true;
  if (/\?$/.test(text)) return true;
  return /^(?:who|what|where|when|why|how|which|anyone|anybody|did|do|does|are|is|has|have|can|could|would|wanna|want)\b/i.test(text);
}

function answerStartsYesNo(text) {
  return /^(?:yeah|yep|yes|nah|nope|no|maybe|kinda|sorta|probably|sure|definitely|not really|i do|i did|i am|im)\b/i.test(String(text || "").trim());
}

function questionTypeScore(question, answer) {
  const q = String(question || "").toLowerCase();
  const a = String(answer || "").trim();
  let score = 0;

  if (/\b(?:where|what part|what city|what state|from|live)\b/.test(q)) {
    if (a.length <= 42 && !answerStartsYesNo(a)) score += 55;
    if (/\b(?:ca|california|ny|new york|texas|florida|lakewood|los angeles|la|orange county|oc|seattle|boston|chicago|phoenix|arizona)\b/i.test(a)) score += 25;
  }

  if (/\b(?:how old|age|asl)\b/.test(q) && /\b\d{1,2}\b/.test(a)) score += 70;

  if (/^(?:did|do|does|are|is|has|have|can|could|would|wanna|want|anyone|anybody)\b/.test(q) && answerStartsYesNo(a)) score += 40;

  const qSubject = subjectForText(q, "general");
  const aSubject = subjectForText(a, "general");
  if (qSubject !== "general" && qSubject === aSubject) score += 24;

  if (/\b(?:what|which|who|how)\b/.test(q) && a.split(/\s+/).length <= 8) score += 14;
  return score;
}

export default baseWorker;

export class ChatRoom extends ContinuityChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.providerCooldownUntil = new Map();
    this.providerStats = new Map();
    this.pendingProviderByMessage = new Map();
    this.pendingHumanReplyTo = new Map();
    this.lastSuccessfulProvider = "";
    this.messageSequence = 0;
    this.implicitReplyCount = 0;
    this.lastImplicitReply = null;
    if (this.configuredProviders().length) this.aiStatus = "AI provider pool ready";
  }

  nextMessageId() {
    this.messageSequence = (this.messageSequence + 1) % 1679616;
    return `m${Date.now().toString(36)}${this.messageSequence.toString(36)}`;
  }

  pushMessage(message) {
    const enriched = message?.messageId ? message : { ...message, messageId: this.nextMessageId() };
    return super.pushMessage(enriched);
  }

  recentOpenQuestions(sender, now = Date.now()) {
    const rows = [];
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      const row = this.history[i];
      if (!row || row.kind === "system") continue;
      const age = now - Number(row.at || 0);
      if (age > QUESTION_WINDOW_MS) break;
      if (row.kind !== "bot" || !looksLikeQuestion(row)) continue;
      if (row.target && row.target !== "room" && row.target !== sender) continue;

      const alreadyAnswered = this.history.slice(i + 1).some((later) =>
        later?.kind === "human"
        && later.from === sender
        && later.target === row.from
        && Number(later.at || 0) > Number(row.at || 0)
      );
      if (alreadyAnswered) continue;
      rows.push(row);
      if (rows.length >= 5) break;
    }
    return rows;
  }

  inferOpenQuestion(text, sender, now = Date.now()) {
    const answer = String(text || "").trim();
    if (!answer || messageAddressesRoom(answer) || messageBreaksFocus(answer)) return null;
    if (/\?$/.test(answer) && answer.split(/\s+/).length >= 4) return null;

    const scored = this.recentOpenQuestions(sender, now).map((row) => {
      const ageMs = Math.max(0, now - Number(row.at || 0));
      let score = Math.max(0, 65 - ageMs / 1800);
      if (row.target === sender) score += 90;
      else if (row.target === "room") score += 18;
      score += questionTypeScore(row.text, answer);
      if (String(row.from || "") === String(sender || "")) score = -1;
      return { row, score };
    }).sort((a, b) => b.score - a.score);

    if (!scored.length || scored[0].score < 62) return null;
    if (scored[1] && scored[0].score - scored[1].score < 14) return null;
    return scored[0].row;
  }

  resolveDirectTarget(text, sender = "") {
    const resolved = super.resolveDirectTarget(text, sender);
    if (resolved !== "room") return resolved;

    const question = this.inferOpenQuestion(text, sender, Date.now());
    if (!question?.from || !this.activeBotNames.includes(question.from)) return "room";

    this.pendingHumanReplyTo.set(sender, question.messageId || "");
    this.setFocus(sender, question.from, Date.now(), "implicit-answer");
    this.implicitReplyCount += 1;
    this.lastImplicitReply = {
      human: sender,
      bot: question.from,
      question: String(question.text || "").slice(0, 100),
      answer: String(text || "").slice(0, 100),
      at: Date.now()
    };
    return question.from;
  }

  configuredProviders() {
    const providers = [];
    if (this.env.GROQ_API_KEY) providers.push("groq");
    if (this.env.GEMINI_API_KEY) providers.push("gemini");
    if (this.env.AI) providers.push("workers-ai");
    return providers;
  }

  providerReady(provider, now = Date.now()) {
    return now >= Number(this.providerCooldownUntil.get(provider) || 0);
  }

  providerEvent(provider, payload = {}) {
    const event = {
      type: "ai_provider",
      provider,
      label: PROVIDER_LABELS[provider] || provider,
      at: Date.now(),
      ...payload
    };
    this.broadcast(event);
  }

  noteProviderFailure(provider, status = 0, response = null, detail = "") {
    const fallback = DEFAULT_COOLDOWN_MS[provider] || 60000;
    let cooldownMs = fallback;
    if (response) cooldownMs = retryAfterMs(response, fallback);
    if (status === 401 || status === 403) cooldownMs = 10 * 60 * 1000;
    if (status >= 500 && status < 600) cooldownMs = Math.min(cooldownMs, 45000);
    this.providerCooldownUntil.set(provider, Date.now() + cooldownMs);
    const previous = this.providerStats.get(provider) || { successes: 0, failures: 0 };
    this.providerStats.set(provider, { ...previous, failures: previous.failures + 1, lastStatus: status, lastFailureAt: Date.now() });
    this.providerEvent(provider, {
      state: "cooldown",
      httpStatus: status || null,
      cooldownMs,
      detail: String(detail || "").slice(0, 120)
    });
  }

  noteProviderSuccess(provider, model, latencyMs, messageCount) {
    this.providerCooldownUntil.delete(provider);
    const previous = this.providerStats.get(provider) || { successes: 0, failures: 0 };
    this.providerStats.set(provider, { ...previous, successes: previous.successes + 1, lastSuccessAt: Date.now(), lastModel: model });
    this.lastSuccessfulProvider = provider;
    this.providerEvent(provider, {
      state: "success",
      model,
      latencyMs,
      messageCount
    });
  }

  async callGroqProvider(prompt, maxTokens) {
    const model = this.env.GROQ_MODEL || "openai/gpt-oss-20b";
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: providerSystemPrompt() },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        max_completion_tokens: maxTokens,
        temperature: 0.98
      })
    });

    if (!response.ok) return { ok: false, status: response.status, response, model };
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return { ok: Boolean(content), status: response.status, response, model, content };
  }

  async callGeminiProvider(prompt, maxTokens) {
    const model = this.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: providerSystemPrompt() }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) return { ok: false, status: response.status, response, model };
    const data = await response.json();
    const content = (data?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || "").join("");
    return { ok: Boolean(content), status: response.status, response, model, content };
  }

  async callWorkersAiProvider(prompt, maxTokens) {
    const model = this.env.WORKERS_AI_MODEL || "@cf/google/gemma-4-26b-a4b-it";
    try {
      const data = await this.env.AI.run(model, {
        messages: [
          { role: "system", content: providerSystemPrompt() },
          { role: "user", content: prompt }
        ],
        max_completion_tokens: maxTokens,
        temperature: 0.9
      });
      const raw = data?.response ?? data?.choices?.[0]?.message?.content ?? data?.result?.response ?? "";
      const content = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "";
      return { ok: Boolean(content), status: 200, response: null, model, content };
    } catch (error) {
      return { ok: false, status: 0, response: null, model, error };
    }
  }

  async callProvider(provider, prompt, maxTokens) {
    if (provider === "groq") return this.callGroqProvider(prompt, maxTokens);
    if (provider === "gemini") return this.callGeminiProvider(prompt, maxTokens);
    if (provider === "workers-ai") return this.callWorkersAiProvider(prompt, maxTokens);
    return { ok: false, status: 0, response: null, model: "" };
  }

  rememberMessageProvider(messages, provider) {
    for (const item of messages) {
      this.pendingProviderByMessage.set(messageKey(item.speaker, item.text), provider);
    }
    if (this.pendingProviderByMessage.size > 80) {
      const keys = [...this.pendingProviderByMessage.keys()];
      for (const key of keys.slice(0, keys.length - 60)) this.pendingProviderByMessage.delete(key);
    }
  }

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const providers = this.configuredProviders();
    const now = Date.now();
    let attempted = 0;

    for (const provider of providers) {
      if (!this.providerReady(provider, now)) continue;
      attempted += 1;
      const startedAt = Date.now();
      let result;

      try {
        result = await this.callProvider(provider, prompt, maxTokens);
      } catch (error) {
        this.noteProviderFailure(provider, 0, null, error?.message || "connection error");
        continue;
      }

      const latencyMs = Date.now() - startedAt;
      if (!result?.ok) {
        this.noteProviderFailure(provider, Number(result?.status || 0), result?.response || null, result?.error?.message || "provider request failed");
        continue;
      }

      let messages = [];
      try {
        messages = this.parseGroqMessages(extractJsonText(result.content), maxMessages, defaultTarget);
      } catch (error) {
        this.noteProviderFailure(provider, 0, null, `bad JSON: ${error?.message || "parse error"}`);
        continue;
      }

      if (!messages.length) {
        this.noteProviderFailure(provider, 0, null, "no usable chat lines");
        continue;
      }

      this.rememberMessageProvider(messages, provider);
      this.noteProviderSuccess(provider, result.model, latencyMs, messages.length);
      this.setAiStatus(`AI active · ${PROVIDER_LABELS[provider] || provider}`);
      return messages.map((item) => ({ ...item, source: provider }));
    }

    if (!providers.length) this.setAiStatus("AI unavailable · procedural fallback");
    else if (!attempted) this.setAiStatus("AI providers cooling down · procedural fallback");
    else this.setAiStatus("AI providers busy · procedural fallback");
    return [];
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    let enrichedMeta = { ...meta };

    if (kind === "human") {
      let replyTo = this.pendingHumanReplyTo.get(from) || "";
      if (!replyTo && enrichedMeta.target && enrichedMeta.target !== "room") {
        const recent = [...this.history].reverse().find((row) =>
          row?.messageId
          && row.kind === "bot"
          && row.from === enrichedMeta.target
          && (row.target === from || row.target === "room")
          && Date.now() - Number(row.at || 0) <= REPLY_LINK_WINDOW_MS
        );
        replyTo = recent?.messageId || "";
      }
      if (replyTo && !enrichedMeta.replyTo) enrichedMeta.replyTo = replyTo;
      this.pendingHumanReplyTo.delete(from);
    }

    if (kind === "bot" && enrichedMeta.target && enrichedMeta.target !== "room" && !enrichedMeta.replyTo) {
      const recent = [...this.history].reverse().find((row) =>
        row?.messageId
        && row.from === enrichedMeta.target
        && row.kind !== "system"
        && Date.now() - Number(row.at || 0) <= REPLY_LINK_WINDOW_MS
      );
      if (recent?.messageId) enrichedMeta.replyTo = recent.messageId;
    }

    if (kind === "bot") {
      const key = messageKey(from, text);
      const provider = this.pendingProviderByMessage.get(key);
      if (provider) {
        if (source === "groq" || source === "ai" || source === "built-in") source = provider;
        this.pendingProviderByMessage.delete(key);
      }
    }

    return super.say(from, text, kind, source, enrichedMeta);
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      pass: "provider-router-reply-graph-v15",
      aiProviders: {
        configured: this.configuredProviders(),
        lastSuccessful: this.lastSuccessfulProvider,
        cooldowns: this.configuredProviders().map((provider) => ({
          provider,
          remainingMs: Math.max(0, Number(this.providerCooldownUntil.get(provider) || 0) - now),
          ...(this.providerStats.get(provider) || {})
        }))
      },
      implicitReplies: {
        resolved: this.implicitReplyCount,
        last: this.lastImplicitReply,
        openQuestions: this.recentOpenQuestions(name, now).slice(0, 4).map((row) => ({
          from: row.from,
          text: row.text,
          target: row.target || "room",
          messageId: row.messageId || ""
        }))
      }
    };
  }
}
