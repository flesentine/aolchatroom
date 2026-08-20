import baseWorker, { ChatRoom as EraChatRoom } from "./index_v13.js";
import { getCharacter } from "./characters.js";
import { scoreCharacterForText } from "./chatter.js";
import { activeThreads, relationshipScore } from "./social.js";
import { activityRole } from "./authenticity.js";
import {
  messageAddressesRoom,
  messageBreaksFocus,
  stickyTargetFromHistory,
  pairTranscript,
  diversityPrompt,
  primaryLane,
  lanePrompt,
  continuityLineAllowed,
  safeContinuationText
} from "./continuity.js";

const FOCUS_MS = 165000;

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export default baseWorker;

export class ChatRoom extends EraChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.focusByHuman = new Map();
    this.lastContinuityReject = null;
    this.continuityRejectCount = 0;
  }

  setFocus(human, bot, now = Date.now(), reason = "conversation") {
    if (!human || !bot || !this.activeBotNames.includes(bot)) return;
    this.focusByHuman.set(human, { bot, at: now, reason });
  }

  clearFocus(human) {
    if (human) this.focusByHuman.delete(human);
  }

  currentFocus(human, now = Date.now()) {
    const row = this.focusByHuman.get(human);
    if (row && now - row.at <= FOCUS_MS && this.activeBotNames.includes(row.bot)) return row;
    if (row) this.focusByHuman.delete(human);

    const inferred = stickyTargetFromHistory(this.history, human, this.activeBotNames, now);
    if (inferred) {
      const focus = { bot: inferred, at: now, reason: "history" };
      this.focusByHuman.set(human, focus);
      return focus;
    }
    return null;
  }

  resolveDirectTarget(text, sender = "") {
    const explicit = super.resolveDirectTarget(text, sender);
    const now = Date.now();

    if (explicit !== "room") {
      this.setFocus(sender, explicit, now, "explicit-name");
      return explicit;
    }

    if (messageAddressesRoom(text) || messageBreaksFocus(text)) {
      this.clearFocus(sender);
      return "room";
    }

    const focus = this.currentFocus(sender, now);
    return focus?.bot || "room";
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") {
      const probe = { speaker: from, text, target: meta.target || "room", intent: meta.intent || "", topic: meta.topic || "general" };
      if (!continuityLineAllowed(probe, this.history)) {
        this.continuityRejectCount += 1;
        this.lastContinuityReject = { ...probe, source, at: Date.now() };
        return false;
      }
    }

    const result = super.say(from, text, kind, source, meta);
    if (!result) return false;

    const now = Date.now();
    if (kind === "human") {
      const target = meta.target || "room";
      if (target !== "room" && this.activeBotNames.includes(target)) this.setFocus(from, target, now, "human-send");
      else if (messageAddressesRoom(text) || messageBreaksFocus(text)) this.clearFocus(from);
    } else if (kind === "bot") {
      const target = meta.target || "room";
      if (this.humanNames().includes(target)) {
        const existing = this.currentFocus(target, now);
        if (!existing || existing.bot === from) this.setFocus(target, from, now, "bot-reply");
      }
    }
    return true;
  }

  focusedConversationPrompt(now = Date.now()) {
    const rows = [];
    for (const human of this.humanNames()) {
      const focus = this.currentFocus(human, now);
      if (!focus) continue;
      const transcript = pairTranscript(this.history, human, focus.bot, 8, now);
      rows.push(`${human} <-> ${focus.bot} is an ACTIVE one-to-one public-room micro-conversation. Short follow-ups from ${human} that do not address the room belong to ${focus.bot}.\n${transcript || "They just started talking."}`);
    }
    return rows.join("\n\n") || "No focused human/bot micro-conversation is active.";
  }

  continuityPromptFor(prompt, now = Date.now()) {
    const threads = activeThreads(this.social, now);
    const lane = primaryLane(threads, this.activeBotNames, this.humanNames(), now);
    const isHumanReply = /just typed:/i.test(prompt) || /PUBLIC ROOM sends/i.test(prompt) && /addressed/i.test(prompt);
    const isBackground = /Generate\s+5-7\s+NEXT public-room sends/i.test(prompt) || /NEXT public-room sends/i.test(prompt);

    const rules = [
      "CONVERSATION CONTINUITY OVERRIDE — these rules supersede conflicting flow instructions above:",
      "- A crowded room contains several micro-conversations, but each micro-conversation has MEMORY. People do not forget what they were talking about just because unrelated lines scroll between them.",
      "- If A asks B something and B answers, A's next short follow-up normally continues with B unless A names somebody else, says anyone/everyone/guys, or clearly changes to the whole room.",
      "- A subject should usually get 3-7 locally coherent sends among interested people before it fades. Other chatter may cross between those sends, but do not reset the subject after every line.",
      "- When replying, target the person whose line you are answering. Do not mark every response as target=room; explicit targets are how the simulation preserves conversational lanes.",
      "- Do not start a fresh named TV-show topic just because a historical TV feed exists. TV is one topic among many.",
      diversityPrompt(this.history),
      `ROOM SUBJECT GRAVITY: ${lanePrompt(lane)}`,
      `FOCUSED PAIRS:\n${this.focusedConversationPrompt(now)}`
    ];

    if (isHumanReply) {
      rules.push(
        "HUMAN-FOCUS RULE: if the latest human message belongs to a focused pair, the focused bot must interpret it using their pair transcript. A short line like 'me too', 'where?', 'wanna get coffee?', 'why?', or 'what about you?' is a continuation, not a brand-new room topic. Cross-talk may appear, but it cannot replace the focused person's answer."
      );
    }

    if (isBackground) {
      rules.push(
        "BACKGROUND-FLOW RULE: in this generated batch, at least 3 sends should belong to ONE primary subject/lane. At most 1 genuinely new secondary subject may appear. Let 2-4 people chime in on the primary subject before moving on. Do not create 5 unrelated topic starters."
      );
    }
    return rules.join("\n");
  }

  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const continuity = this.continuityPromptFor(prompt, Date.now());
    return super.callGroq(`${prompt}\n\n${continuity}`, maxTokens, maxMessages, defaultTarget);
  }

  parseGroqMessages(content, max = 10, defaultTarget = "room") {
    const parsed = super.parseGroqMessages(content, max, defaultTarget);
    const accepted = [];
    const rolling = [...this.history];
    for (const item of parsed) {
      if (!continuityLineAllowed(item, rolling)) {
        this.continuityRejectCount += 1;
        this.lastContinuityReject = { ...item, source: "groq-continuity", at: Date.now() };
        continue;
      }
      accepted.push(item);
      rolling.push({ from: item.speaker, text: item.text, kind: "bot", target: item.target, topic: item.topic });
      if (accepted.length >= max) break;
    }
    return accepted;
  }

  builtInHumanReply(human) {
    const target = human?.target && human.target !== "room" ? getCharacter(human.target) : null;
    const text = String(human?.text || "");

    if (target && /\b(?:where do (?:you|u) live|where (?:are|r) (?:you|u) from|where.*from)\b/i.test(text)) {
      const city = String(target.location || "").split(",")[0];
      return [{ speaker: target.name, text: randomOf([`${city} here`, `im in ${city}`, `from ${city}`]), source: "built-in", intent: "reply", target: human.from, topic: "location" }];
    }

    if (target && /\bhow old(?: are you| r u| are u)?\b/i.test(text)) {
      return [{ speaker: target.name, text: randomOf([`im ${target.age}`, `${target.age}`, `${target.age} lol`]), source: "built-in", intent: "reply", target: human.from, topic: "asl" }];
    }

    if (target && /\b(?:wanna|want to|want 2).{0,18}\b(?:coffee|hang out|meet|go out)\b|\bgrab some coffee\b/i.test(text)) {
      return [{ speaker: target.name, text: randomOf(["maybe lol where", "sure where", "lol maybe", "where at?", "yeah maybe :)" ]), source: "built-in", intent: "reply", target: human.from, topic: "general" }];
    }

    return super.builtInHumanReply(human);
  }

  recentRoomLaneMessage(now = Date.now()) {
    const lane = primaryLane(activeThreads(this.social, now), this.activeBotNames, this.humanNames(), now);
    if (!lane) return null;
    return [...this.history].reverse().find((row) => row?.kind === "bot" && row.threadId === lane.id && (!row.target || row.target === "room" || this.activeBotNames.includes(row.target))) || null;
  }

  builtInAmbient() {
    const now = Date.now();
    const recent = this.recentRoomLaneMessage(now);

    if (recent && Math.random() < 0.64) {
      const candidates = this.activeCharacters()
        .filter((character) => character.name !== recent.from)
        .filter((character) => activityRole(character.name, now) !== "lurker" || Math.random() < 0.08)
        .map((character) => ({
          character,
          score: scoreCharacterForText(character, recent.text) + relationshipScore(this.social, character.name, recent.from) * 0.25 + Math.random() * 8
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (candidates.length) {
        const character = randomOf(candidates).character;
        const item = {
          speaker: character.name,
          text: safeContinuationText(recent),
          source: "built-in",
          intent: "thread-reply",
          target: recent.from,
          topic: recent.topic || "general",
          threadId: recent.threadId || ""
        };
        if (continuityLineAllowed(item, this.history)) return item;
      }
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const item = super.builtInAmbient();
      if (!item) return null;
      if (continuityLineAllowed(item, this.history)) return item;
    }
    return null;
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    const lane = primaryLane(activeThreads(this.social, now), this.activeBotNames, this.humanNames(), now);
    return {
      ...base,
      pass: "conversation-continuity-v14",
      continuity: {
        focus: this.humanNames().map((human) => ({ human, bot: this.currentFocus(human, now)?.bot || "" })).filter((row) => row.bot),
        primaryLane: lane ? { id: lane.id, topic: lane.topic, participants: lane.participants, turns: lane.turns, lastText: lane.lastText } : null,
        rejectedLines: this.continuityRejectCount,
        lastReject: this.lastContinuityReject,
        mode: "sticky directed conversations + subject gravity + topic fatigue"
      }
    };
  }
}
