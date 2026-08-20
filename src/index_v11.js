import baseWorker, { ChatRoom as AuthenticChatRoom } from "./index_v10.js";
import { getCharacter } from "./characters.js";
import {
  renderAmbient,
  renderDirectedFallback,
  chooseDistinctLine,
  topicNamesForPrompt
} from "./chatter.js";
import {
  relationshipPrompt,
  humanMemoryPrompt,
  threadPrompt,
  simulatedDateTimeLabel,
  inferConversationTopic
} from "./social.js";
import { recentSpeakerNames, roomMood } from "./director.js";
import {
  activityRole,
  chooseAuthenticParticipants
} from "./authenticity.js";
import {
  canonicalConversationTopic,
  conversationalQualityAllowed,
  fallbackHumanReply,
  qualityDirectorPrompt
} from "./quality.js";

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default baseWorker;

export class ChatRoom extends AuthenticChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.allowedGroqSpeakers = null;
  }

  qualityOptions() {
    return {
      culture: this.culture,
      humanNames: this.humanNames(),
      history: this.history
    };
  }

  parseGroqMessages(content, max = 10, defaultTarget = "room") {
    const parsed = super.parseGroqMessages(content, max, defaultTarget);
    const out = [];
    for (const item of parsed) {
      if (this.allowedGroqSpeakers && !this.allowedGroqSpeakers.has(item.speaker)) continue;
      const normalized = {
        ...item,
        topic: canonicalConversationTopic(item.text, item.topic)
      };
      if (!conversationalQualityAllowed(normalized, this.qualityOptions())) continue;
      out.push(normalized);
    }
    return out.slice(0, max);
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") {
      const item = { speaker: from, text, topic: canonicalConversationTopic(text, meta.topic) };
      if (!conversationalQualityAllowed(item, this.qualityOptions())) return false;
      meta = { ...meta, topic: item.topic };
    }
    return super.say(from, text, kind, source, meta);
  }

  builtInHumanReply(human) {
    const active = this.activeCharacters();
    const manual = fallbackHumanReply(human, active);
    if (manual && conversationalQualityAllowed(manual, this.qualityOptions())) return [manual];

    const topic = inferConversationTopic(human?.text || "");
    const direct = human?.target && human.target !== "room";
    if (!direct && (topic === "general" || topic === "greeting")) return [];

    const ranked = this.rankedResponders(human, 6);
    if (direct) {
      const targetCharacter = getCharacter(human.target);
      if (targetCharacter && this.activeBotNames.includes(targetCharacter.name)) {
        ranked.sort((a, b) => Number(b.name === targetCharacter.name) - Number(a.name === targetCharacter.name));
      }
    }

    for (const character of ranked) {
      const text = chooseDistinctLine(
        () => renderDirectedFallback(character, human),
        this.history,
        character.name,
        24
      );
      const item = {
        speaker: character.name,
        text,
        source: "built-in",
        intent: "reply",
        target: human.from,
        topic
      };
      if (text && conversationalQualityAllowed(item, this.qualityOptions())) return [item];
    }
    return [];
  }

  builtInAmbient() {
    const now = Date.now();
    const recent = recentSpeakerNames(this.history, 8);
    let candidates = chooseAuthenticParticipants(this.activeCharacters(), recent, 10, now);
    candidates = candidates.filter((character) => activityRole(character.name, now) !== "lurker" || Math.random() < 0.12);
    if (!candidates.length) candidates = this.activeCharacters();

    for (const character of shuffled(candidates).slice(0, 10)) {
      const text = chooseDistinctLine(
        () => renderAmbient(character),
        this.history,
        character.name,
        30
      );
      const item = {
        speaker: character.name,
        text,
        source: "built-in",
        intent: "ambient",
        target: "room",
        topic: canonicalConversationTopic(text, "general")
      };
      if (text && conversationalQualityAllowed(item, this.qualityOptions())) return item;
    }
    return null;
  }

  async generateGroqHumanReply(human) {
    const ranked = this.rankedResponders(human, 5);
    const targetCharacter = human?.target && human.target !== "room" ? getCharacter(human.target) : null;
    const base = targetCharacter && this.activeBotNames.includes(targetCharacter.name)
      ? [targetCharacter, ...ranked.filter((c) => c.name !== targetCharacter.name)]
      : ranked;
    const rankedNames = new Set(base.map((c) => c.name));
    const extras = chooseAuthenticParticipants(
      this.activeCharacters().filter((c) => !rankedNames.has(c.name)),
      recentSpeakerNames(this.history, 8),
      2,
      Date.now()
    );
    const participants = [...base.slice(0, 5), ...extras];
    const profiles = participants.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);
    const participantNames = profiles.map((c) => c.name);
    const memory = humanMemoryPrompt(this.social, human.from, participantNames, 5);
    const relationships = relationshipPrompt(this.social, [...participantNames, human.from], 8);
    const threads = threadPrompt(this.social, Date.now(), 3);
    this.sceneSeq += 1;
    const sceneId = `q${this.sceneSeq}`;

    const prompt = `${qualityDirectorPrompt()}\n\nROOM: People Connection / Town Square. Current time: ${simulatedDateTimeLabel()}.\n\nTHE ONLY PEOPLE WHO MAY SPEAK:\n${this.promptProfiles(profiles, 7)}\n\nRELATIONSHIPS:\n${relationships}\n\nWHAT THEY ACTUALLY REMEMBER ABOUT ${human.from}:\n${memory}\nUse memory only when that specific bot witnessed it. ${human.from} is a SCREEN NAME, not a literal description of the person.\n\nACTIVE THREADS:\n${threads}\n\nRECENT SCROLL:\n${this.recentTranscript(12) || "The room just opened."}\n\n${human.from} just typed: ${human.text}\nTopic hints: ${topicNamesForPrompt(human.text)}\n\nWrite 1-2 short PUBLIC ROOM sends. First, understand the literal meaning of what ${human.from} said. One person should answer THAT message naturally. A second line is optional and should happen only if another person has a believable reason to jump in. ${human.target !== "room" ? `${human.from} addressed ${human.target}; ${human.target} should answer unless the profile makes that impossible.` : "Do not invent a personal fact merely to make somebody answer."}\n\nIf the message is strange, react like a regular chatter (for example 'wtf how' or 'LOL no way'), not like a counselor. If it is a factual question, never lie about a profile fact. If nobody in the listed profiles actually lives in a requested city, somebody nearby can truthfully say where they really are, or the room can give no exact match.\n\nMost sends should be 1-12 words. It is okay to use CAPS for emphasis or a short shout, and occasionally :) ;) :P :( <g>. Do not make every line lowercase. Do not add a historical fact unless it naturally answers the message.\n\nOutput JSON only:\n{"messages":[{"speaker":"JennJenn","text":"...","target":"${human.from}","intent":"reply","topic":"general"}]}\nAllowed speakers ONLY: ${participantNames.join(", ")}.`;

    this.allowedGroqSpeakers = new Set(participantNames);
    try {
      const messages = await this.callGroq(prompt, 280, 2, human.from);
      return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));
    } finally {
      this.allowedGroqSpeakers = null;
    }
  }

  async generateGroqBatch() {
    const now = Date.now();
    const recent = recentSpeakerNames(this.history, 12);
    const selected = chooseAuthenticParticipants(this.activeCharacters(), recent, 6, now);
    if (selected.length < 3) return [];

    const names = selected.map((c) => c.name);
    const humanNames = this.humanNames();
    const relationships = relationshipPrompt(this.social, [...names, ...humanNames], 10);
    const threads = threadPrompt(this.social, now, 4);
    const roles = names.map((name) => `${name}:${activityRole(name, now)}`).join(", ");
    this.sceneSeq += 1;
    const sceneId = `qbg${this.sceneSeq}`;

    const prompt = `${qualityDirectorPrompt()}\n\nROOM: People Connection / Town Square. Current time: ${simulatedDateTimeLabel(now)}. Room mood: ${roomMood(now).id}.\n\nTHE ONLY PEOPLE WHO MAY SPEAK:\n${this.promptProfiles(selected, 6)}\nSession roles: ${roles}. Lurkers can remain totally silent.\n\nRELATIONSHIPS:\n${relationships}\n\nACTIVE THREADS:\n${threads}\n\nHumans present: ${humanNames.join(", ") || "none"}. Screen names are aliases, not literal descriptions.\n\nRECENT VISIBLE SCROLL:\n${this.recentTranscript(14) || "The room just opened."}\n\nGenerate 5-7 NEXT public-room sends. Quality matters more than filling the room. Maintain 2-3 overlapping bits of conversation, but EVERY reply must make local human sense to the line it is responding to. It is fine for a question to be ignored. It is fine for one talker to speak twice while another listed person never speaks.\n\nDo not write a scripted six-line anecdote where random people somehow take turns supplying the storyteller's own facts. If somebody says 'my roommate taped over my show,' THAT SAME PERSON owns the facts about what their roommate did; other people can only ask, react, tease, or give advice. Pronouns and personal experiences belong to the person who introduced them.\n\nDo not hallucinate access or chronology. A U.S. chatter cannot casually have the Japan-only N64. A U.S. chatter hearing about Knebworth is probably hearing it through MTV/music press, not claiming they went. TV chatter sounds like 'did u watch/tape/miss it?', not 'did u read about the new episode?'. Movies do not become concerts. Sports teams do not play imaginary games in their offseason.\n\nKeep most sends 1-12 words. Occasional full CAPS, one-word CAPS emphasis, LOL, :) ;) :P :( or <g> are welcome when they fit. Some people type normally with capitals; some type lowercase; some shout. Do not manufacture a typo in every line; the typing layer handles that.\n\nOutput JSON only:\n{"messages":[{"speaker":"CyberDude","text":"...","target":"room","intent":"cross-talk","topic":"general"}]}\nAllowed speakers ONLY: ${names.join(", ")}.`;

    this.allowedGroqSpeakers = new Set(names);
    try {
      const messages = await this.callGroq(prompt, 560, 7, "room");
      return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));
    } finally {
      this.allowedGroqSpeakers = null;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "conversation-quality-v11",
      quality: {
        builtInScenes: "disabled; safe standalone ambient only",
        groqSpeakers: "restricted to supplied fixed profiles",
        semanticGuards: "persona/location + chronology + media semantics + screen-name alias"
      }
    };
  }
}
