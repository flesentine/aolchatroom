import baseWorker, { ChatRoom as RhythmChatRoom } from "./index_v16.js";
import { subjectForText } from "./continuity.js";

const MAX_OPEN_SCENES = 3;
const SCENE_ACTIVE_MS = 85000;
const SCENE_FADE_MS = 190000;
const SCENE_KEEP_MS = 8 * 60 * 1000;
const ATTENTION_KEEP = 9;
const DIRECT_REPLY_WINDOW_MS = 3 * 60 * 1000;

const CONTEXTLESS_REACTION = /^(?:seriously\??|really\??|what\??|huh\??|why\??|maybe|no way|lol really|lol|yeah|nah|wow|ugh|heh|same)$/i;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function isQuestionText(text, intent = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  if (String(intent || "").toLowerCase() === "question") return true;
  if (/\?$/.test(value)) return true;
  return /^(?:who|what|where|when|why|how|which|anyone|anybody|did|do|does|are|is|has|have|can|could|would|wanna|want)\b/i.test(value);
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function sceneAgeStatus(scene, now = Date.now()) {
  const age = now - Number(scene?.lastAt || 0);
  if (age <= SCENE_ACTIVE_MS) return "active";
  if (age <= SCENE_FADE_MS) return "fading";
  return "closed";
}

export default baseWorker;

export class ChatRoom extends RhythmChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.sceneBoard = new Map();
    this.attentionByName = new Map();
    this.sceneSequence = 0;
    this.sceneHydrated = false;
    this.sceneStats = {
      created: 0,
      closed: 0,
      repliesLinked: 0,
      contextlessRejected: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (!this.sceneHydrated) this.hydrateScenesFromHistory();
  }

  nextSceneId() {
    this.sceneSequence = (this.sceneSequence + 1) % 46656;
    return `s${Date.now().toString(36)}${this.sceneSequence.toString(36)}`;
  }

  hydrateScenesFromHistory() {
    this.sceneHydrated = true;
    const now = Date.now();
    for (const row of (this.history || []).slice(-70)) {
      if (!row || row.kind === "system" || !row.sceneId) continue;
      if (now - Number(row.at || 0) > SCENE_KEEP_MS) continue;
      const existing = this.sceneBoard.get(row.sceneId) || {
        id: row.sceneId,
        topic: row.topic || subjectForText(row.text, "general"),
        participants: [],
        createdAt: Number(row.at || now),
        lastAt: Number(row.at || now),
        lastMessageId: "",
        lastText: "",
        turns: 0,
        status: "active",
        openQuestion: null
      };
      existing.participants = unique([...existing.participants, row.from, row.target !== "room" ? row.target : ""]);
      existing.lastAt = Math.max(existing.lastAt, Number(row.at || now));
      existing.lastMessageId = row.messageId || existing.lastMessageId;
      existing.lastText = row.text || existing.lastText;
      existing.turns += 1;
      existing.status = sceneAgeStatus(existing, now);
      if (isQuestionText(row.text, row.intent)) {
        existing.openQuestion = {
          messageId: row.messageId || "",
          from: row.from,
          target: row.target || "room",
          text: row.text,
          at: Number(row.at || now)
        };
      }
      this.sceneBoard.set(existing.id, existing);
    }
    this.pruneScenes(now);
  }

  setFocus(humanName, botName, now = Date.now(), reason = "conversation") {
    if (!botName) return;
    const current = this.attentionByName.get(botName) || { noticedIds: [] };
    this.attentionByName.set(botName, {
      ...current,
      mode: "focused",
      target: humanName || current.target || "",
      reason,
      lastAt: now
    });
    if (humanName) {
      const human = this.attentionByName.get(humanName) || { noticedIds: [] };
      this.attentionByName.set(humanName, {
        ...human,
        mode: "focused",
        target: botName,
        reason,
        lastAt: now
      });
    }
  }

  pruneScenes(now = Date.now()) {
    for (const [id, scene] of this.sceneBoard.entries()) {
      scene.status = sceneAgeStatus(scene, now);
      if (scene.status === "closed" && !scene.closedAt) {
        scene.closedAt = now;
        this.sceneStats.closed += 1;
      }
      if (now - Number(scene.lastAt || 0) > SCENE_KEEP_MS) this.sceneBoard.delete(id);
    }
  }

  openScenes(now = Date.now()) {
    this.pruneScenes(now);
    return [...this.sceneBoard.values()]
      .filter((scene) => scene.status !== "closed")
      .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0))
      .slice(0, MAX_OPEN_SCENES);
  }

  messageById(messageId) {
    if (!messageId) return null;
    return [...(this.history || [])].reverse().find((row) => row?.messageId === messageId) || null;
  }

  sceneForMessage(message, now = Date.now()) {
    if (!message) return null;
    if (message.sceneId && this.sceneBoard.has(message.sceneId)) return this.sceneBoard.get(message.sceneId);

    const parent = this.messageById(message.replyTo);
    if (parent?.sceneId && this.sceneBoard.has(parent.sceneId)) return this.sceneBoard.get(parent.sceneId);

    if (message.target && message.target !== "room") {
      const recent = [...(this.history || [])].reverse().find((row) =>
        row?.sceneId
        && row.kind !== "system"
        && Date.now() - Number(row.at || 0) <= DIRECT_REPLY_WINDOW_MS
        && (row.from === message.target || row.target === message.target || row.from === message.from)
      );
      if (recent?.sceneId && this.sceneBoard.has(recent.sceneId)) return this.sceneBoard.get(recent.sceneId);
    }

    const topic = message.topic || subjectForText(message.text, "general");
    if (topic && topic !== "general") {
      const sameTopic = this.openScenes(now).find((scene) => scene.topic === topic && now - scene.lastAt < 110000);
      if (sameTopic) return sameTopic;
    }
    return null;
  }

  canStartScene(message, now = Date.now()) {
    if (!message || message.kind === "system") return false;
    if (CONTEXTLESS_REACTION.test(String(message.text || "").trim())) return false;
    if (message.target && message.target !== "room") return true;
    if (message.kind === "human") return true;
    if (isQuestionText(message.text, message.intent)) return true;
    const topic = message.topic || subjectForText(message.text, "general");
    if (!topic || topic === "general") return false;
    return this.openScenes(now).length < MAX_OPEN_SCENES;
  }

  makeScene(message, now = Date.now()) {
    let open = this.openScenes(now);
    if (open.length >= MAX_OPEN_SCENES) {
      if (message.kind !== "human" && (!message.target || message.target === "room")) return null;
      const oldest = [...open].sort((a, b) => a.lastAt - b.lastAt)[0];
      if (oldest) {
        oldest.status = "closed";
        oldest.closedAt = now;
        oldest.closeReason = "stronger conversation interrupted";
        this.sceneStats.closed += 1;
      }
      open = this.openScenes(now);
    }

    const scene = {
      id: this.nextSceneId(),
      topic: message.topic || subjectForText(message.text, "general"),
      participants: unique([message.from, message.target !== "room" ? message.target : ""]),
      createdAt: now,
      lastAt: now,
      lastMessageId: message.messageId || "",
      lastText: message.text || "",
      turns: 0,
      status: "forming",
      openQuestion: null,
      closeReason: ""
    };
    this.sceneBoard.set(scene.id, scene);
    this.sceneStats.created += 1;
    return scene;
  }

  touchScene(scene, message, now = Date.now()) {
    if (!scene || !message) return;
    scene.participants = unique([...scene.participants, message.from, message.target !== "room" ? message.target : ""]).slice(-7);
    scene.lastAt = now;
    scene.lastMessageId = message.messageId || scene.lastMessageId;
    scene.lastText = message.text || scene.lastText;
    scene.turns += 1;
    scene.status = scene.turns <= 1 ? "forming" : "active";

    if (isQuestionText(message.text, message.intent)) {
      scene.openQuestion = {
        messageId: message.messageId || "",
        from: message.from,
        target: message.target || "room",
        text: message.text,
        at: now
      };
    } else if (message.replyTo && scene.openQuestion?.messageId === message.replyTo) {
      scene.openQuestion = null;
    }
  }

  notice(name, message, mode = "glancing") {
    if (!name || !message?.messageId) return;
    const current = this.attentionByName.get(name) || { noticedIds: [] };
    const ids = [...(current.noticedIds || []).filter((id) => id !== message.messageId), message.messageId].slice(-ATTENTION_KEEP);
    this.attentionByName.set(name, {
      ...current,
      noticedIds: ids,
      sceneId: message.sceneId || current.sceneId || "",
      target: message.from && message.from !== name ? message.from : current.target || "",
      mode,
      lastAt: Date.now()
    });
  }

  distributeAttention(message) {
    if (!message?.messageId || message.kind === "system") return;
    const scene = message.sceneId ? this.sceneBoard.get(message.sceneId) : null;
    const scenePeople = new Set(scene?.participants || []);
    const talkers = new Set(this.talkerNames || []);
    const humans = new Set(this.humanNames());
    const names = unique([...(this.activeBotNames || []), ...humans]);

    this.notice(message.from, message, "focused");
    if (message.target && message.target !== "room") this.notice(message.target, message, "focused");

    for (const name of names) {
      if (name === message.from || name === message.target) continue;
      let chance = 0.04;
      let mode = "lurking";
      if (scenePeople.has(name)) {
        chance = talkers.has(name) || humans.has(name) ? 0.88 : 0.58;
        mode = "focused";
      } else if (talkers.has(name)) {
        chance = 0.30;
        mode = "glancing";
      }
      if (Math.random() < chance) this.notice(name, message, mode);
    }
  }

  pushMessage(message) {
    const now = Date.now();
    const enriched = { ...message };
    if (!enriched.messageId) enriched.messageId = this.nextMessageId();

    let scene = this.sceneForMessage(enriched, now);
    if (!scene && this.canStartScene(enriched, now)) scene = this.makeScene(enriched, now);
    if (scene) {
      enriched.sceneId = scene.id;
      this.touchScene(scene, enriched, now);
      if (enriched.replyTo) this.sceneStats.repliesLinked += 1;
    }

    const result = super.pushMessage(enriched);
    this.distributeAttention(enriched);
    return result;
  }

  attentionTranscript(name, limit = 5) {
    const state = this.attentionByName.get(name);
    if (!state?.noticedIds?.length) return "noticed very little recently";
    const ids = new Set(state.noticedIds.slice(-limit));
    const rows = (this.history || []).filter((row) => row?.messageId && ids.has(row.messageId)).slice(-limit);
    if (!rows.length) return "noticed very little recently";
    return rows.map((row) => `${row.from || "system"}${row.target && row.target !== "room" ? ` -> ${row.target}` : ""}: ${row.text}`).join(" | ");
  }

  scenePrompt(now = Date.now()) {
    const scenes = this.openScenes(now);
    if (!scenes.length) return "SCENE BOARD: no conversation currently has momentum. Starting ONE ordinary subject is enough.";
    const lines = scenes.map((scene) => {
      const question = scene.openQuestion
        ? ` OPEN QUESTION: ${scene.openQuestion.from}${scene.openQuestion.target !== "room" ? ` -> ${scene.openQuestion.target}` : " -> room"}: \"${scene.openQuestion.text}\"`
        : "";
      return `- ${scene.id} [${scene.status}] topic=${scene.topic}; people=${scene.participants.join(", ") || "room"}; turns=${scene.turns}; last=\"${scene.lastText}\".${question}`;
    });
    return `SCENE BOARD (maximum ${MAX_OPEN_SCENES} live conversations):\n${lines.join("\n")}\nPrefer continuing one of these scenes. Do not start a fourth conversation. A scene may fade naturally instead of being rescued with a random question.`;
  }

  attentionPrompt() {
    this.ensureTalkers(Date.now());
    const rows = (this.talkerNames || []).map((name) => {
      const state = this.attentionByName.get(name) || {};
      return `- ${name}: attention=${state.mode || "glancing"}; currently oriented toward=${state.target || "nobody"}; actually noticed: ${this.attentionTranscript(name, 5)}`;
    });
    return `INDIVIDUAL ATTENTION:\n${rows.join("\n") || "- nobody is actively watching"}\nCharacters are NOT omniscient. A character may only react to a line they plausibly noticed, a direct message to them, or the current scene they are participating in. Missing a line is normal.`;
  }

  openQuestionPrompt(now = Date.now()) {
    const questions = [];
    for (let i = (this.history || []).length - 1; i >= 0; i -= 1) {
      const row = this.history[i];
      if (!row || row.kind === "system") continue;
      if (now - Number(row.at || 0) > 95000) break;
      if (!isQuestionText(row.text, row.intent)) continue;
      const answered = (this.history || []).slice(i + 1).some((later) =>
        later?.replyTo === row.messageId
        || (later?.target === row.from && Number(later.at || 0) > Number(row.at || 0))
      );
      if (!answered) questions.push(row);
      if (questions.length >= 5) break;
    }
    if (!questions.length) return "OPEN QUESTIONS: none currently waiting for an answer.";
    return `OPEN QUESTIONS / CONVERSATIONAL OBLIGATIONS:\n${questions.map((row) => `- ${row.from}${row.target !== "room" ? ` -> ${row.target}` : " -> room"}: \"${row.text}\" [${row.messageId}]`).join("\n")}\nIf someone answers one of these without naming the asker, preserve that ownership instead of treating the answer as a new topic.`;
  }

  socialContextPrompt() {
    const base = super.socialContextPrompt();
    return `${base}\n\n${this.scenePrompt()}\n\n${this.openQuestionPrompt()}\n\n${this.attentionPrompt()}\n\nSCENE BEHAVIOR: Keep 1-3 overlapping conversations, not a stream of unrelated topic starters. Questions create conversational obligations. Answers should close or advance those obligations. Short reactions such as \"really?\", \"what?\", \"maybe\", \"lol\", \"yeah\" or \"no way\" MUST have a specific recent antecedent and a non-room target unless the meaning is obvious to the whole room.`;
  }

  parseGroqMessages(content, max = 5, defaultTarget = "room") {
    const parsed = super.parseGroqMessages(content, max, defaultTarget);
    const now = Date.now();
    const accepted = [];

    for (const item of parsed) {
      const value = String(item.text || "").trim();
      let parent = null;
      if (item.target && item.target !== "room") {
        parent = [...(this.history || [])].reverse().find((row) =>
          row?.messageId
          && row.kind !== "system"
          && row.from === item.target
          && now - Number(row.at || 0) <= DIRECT_REPLY_WINDOW_MS
        ) || null;
      }

      if (CONTEXTLESS_REACTION.test(value)) {
        if (!parent || item.target === "room") {
          this.sceneStats.contextlessRejected += 1;
          continue;
        }
      }

      let scene = parent?.sceneId ? this.sceneBoard.get(parent.sceneId) : null;
      if (!scene) {
        const topic = item.topic || subjectForText(item.text, "general");
        scene = this.openScenes(now).find((candidate) => candidate.topic === topic) || null;
      }

      if (!scene && item.target === "room" && this.openScenes(now).length >= MAX_OPEN_SCENES) continue;

      accepted.push({
        ...item,
        replyTo: parent?.messageId || item.replyTo || "",
        sceneId: scene?.id || item.sceneId || ""
      });
    }

    return accepted;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const enriched = { ...meta };
    if (kind === "bot" && enriched.target && enriched.target !== "room") {
      const state = this.attentionByName.get(from);
      if (state?.target && state.target !== enriched.target && state.mode === "focused") {
        const targetRecent = [...(this.history || [])].reverse().find((row) =>
          row?.from === enriched.target
          && Date.now() - Number(row.at || 0) < DIRECT_REPLY_WINDOW_MS
        );
        if (!targetRecent) enriched.target = state.target;
      }
    }
    return super.say(from, text, kind, source, enriched);
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      pass: "scene-attention-v17",
      scenes: this.openScenes(now).map((scene) => ({
        id: scene.id,
        status: scene.status,
        topic: scene.topic,
        participants: scene.participants,
        turns: scene.turns,
        last: scene.lastText,
        openQuestion: scene.openQuestion
      })),
      attention: (this.talkerNames || []).map((talker) => ({
        talker,
        ...(this.attentionByName.get(talker) || { mode: "glancing", target: "" }),
        noticed: this.attentionTranscript(talker, 4)
      })),
      sceneStats: { ...this.sceneStats }
    };
  }
}
