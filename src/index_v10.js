import baseWorker, { ChatRoom as TimedChatRoom } from "./index_v09.js";
import { getCharacter } from "./characters.js";
import { topicNamesForPrompt } from "./chatter.js";
import {
  relationshipScore,
  relationshipInteractions,
  relationshipPrompt,
  humanMemoryPrompt,
  threadPrompt,
  simulatedDateTimeLabel,
  inferConversationTopic
} from "./social.js";
import { recentSpeakerNames, roomMood } from "./director.js";
import { coalescePendingHumans } from "./timing.js";
import {
  normalize1996Text,
  eraLanguageAllowed,
  splitAolSend,
  activityRole,
  chooseAuthenticParticipants,
  humanEngagementDecision,
  roomRealityPrompt,
  authenticRoomTarget,
  nextAbruptDropAt,
  shouldAbruptDrop,
  simpleEntryLine,
  simpleLeaveLine
} from "./authenticity.js";

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

export default baseWorker;

export class ChatRoom extends TimedChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.nextConnectionDropAt = nextAbruptDropAt();
    this.lastEngagementDecision = null;
    this.suppressSocialExitReaction = false;
  }

  visibleUsers() {
    // AOL public rooms were capped at 23. Humans and TOS always appear first in
    // the inherited ordering, then as many bots as fit.
    return super.visibleUsers().slice(0, 23);
  }

  trimToHistoricalRoomCap() {
    const humans = this.humanNames().length;
    const tosSlots = this.tos ? 1 : 0;
    const maxBots = Math.max(0, 23 - humans - tosSlots);
    if (this.activeBotNames.length <= maxBots) return;

    const roleRank = { lurker: 0, occasional: 1, talker: 2 };
    const ordered = [...this.activeBotNames].sort((a, b) => {
      const ar = roleRank[activityRole(a)] ?? 1;
      const br = roleRank[activityRole(b)] ?? 1;
      return ar - br;
    });
    const removeCount = this.activeBotNames.length - maxBots;
    const remove = new Set(ordered.slice(0, removeCount));
    this.activeBotNames = this.activeBotNames.filter((name) => !remove.has(name));

    this.suppressSocialExitReaction = true;
    for (const name of remove) super.system(`${name} has left the room.`);
    this.suppressSocialExitReaction = false;
    this.broadcastPresence();
    this.persistSocial(true);
  }

  system(text) {
    const result = super.system(text);
    if (!this.social || this.suppressSocialExitReaction) return result;

    const enter = String(text).match(/^(.+?) has entered the room\.$/);
    const leave = String(text).match(/^(.+?) has left the room\.$/);

    if (enter) {
      const entrant = enter[1];
      if (/^TOS/i.test(entrant)) return result;
      const bots = this.activeBotNames.filter((name) => name !== entrant && getCharacter(name));
      if (!bots.length) return result;

      const entrantIsBot = Boolean(getCharacter(entrant));
      if (entrantIsBot) {
        const friends = bots
          .map((name) => ({ name, score: relationshipScore(this.social, name, entrant) }))
          .filter((row) => row.score >= 18)
          .sort((a, b) => b.score - a.score);
        if (friends.length && Math.random() < 0.38) {
          const speaker = randomOf(friends.slice(0, 4)).name;
          this.aiQueue.push({
            speaker,
            text: simpleEntryLine(entrant, true),
            source: "built-in",
            intent: "arrival-greeting",
            target: entrant,
            topic: "greeting"
          });
        }
      } else {
        const familiar = bots
          .map((name) => ({
            name,
            score: relationshipScore(this.social, name, entrant),
            interactions: relationshipInteractions(this.social, name, entrant)
          }))
          .filter((row) => row.interactions > 0 || row.score >= 10)
          .sort((a, b) => (b.interactions * 5 + b.score) - (a.interactions * 5 + a.score));

        if (familiar.length && Math.random() < 0.62) {
          const speaker = randomOf(familiar.slice(0, 4)).name;
          this.aiQueue.push({
            speaker,
            text: simpleEntryLine(entrant, true),
            source: "built-in",
            intent: "arrival-greeting",
            target: entrant,
            topic: "greeting"
          });
        } else if (Math.random() < 0.11) {
          const talkers = bots.filter((name) => activityRole(name) === "talker");
          const speaker = randomOf(talkers.length ? talkers : bots);
          this.aiQueue.push({
            speaker,
            text: simpleEntryLine(entrant, false),
            source: "built-in",
            intent: "stranger-greeting",
            target: entrant,
            topic: "asl"
          });
        }
      }
    }

    if (leave) {
      const departed = leave[1];
      if (/^TOS/i.test(departed) || getCharacter(departed) === null) return result;
      const friends = this.activeBotNames
        .filter((name) => name !== departed)
        .map((name) => ({ name, score: relationshipScore(this.social, name, departed) }))
        .filter((row) => row.score >= 25);
      if (friends.length && Math.random() < 0.16) {
        const speaker = randomOf(friends).name;
        this.aiQueue.push({
          speaker,
          text: simpleLeaveLine(departed),
          source: "built-in",
          intent: "departure-reaction",
          target: departed,
          topic: "greeting"
        });
      }
    }

    return result;
  }

  parseGroqMessages(content, max = 10, defaultTarget = "room") {
    const parsed = super.parseGroqMessages(content, max, defaultTarget);
    const out = [];

    for (const item of parsed) {
      const normalized = normalize1996Text(item.text);
      if (!normalized || !eraLanguageAllowed(normalized)) continue;
      const chunks = splitAolSend(normalized, 108);
      for (let i = 0; i < chunks.length; i += 1) {
        out.push({
          ...item,
          text: chunks[i],
          intent: i === 0 ? item.intent : "continuation"
        });
        if (out.length >= max) return out;
      }
    }
    return out;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") {
      const normalized = normalize1996Text(text);
      if (!normalized || !eraLanguageAllowed(normalized)) return false;
      return super.say(from, normalized, kind, source, meta);
    }
    return super.say(from, text, kind, source, meta);
  }

  builtInHumanReply(human) {
    const replies = super.builtInHumanReply(human);
    if (!replies.length) return replies;
    const direct = human?.target && human.target !== "room";
    const count = direct ? (Math.random() < 0.48 ? 2 : 1) : (Math.random() < 0.24 ? 2 : 1);
    return replies.slice(0, count);
  }

  async generateGroqHumanReply(human) {
    const ranked = this.rankedResponders(human, 6);
    const rankedNames = new Set(ranked.map((c) => c.name));
    const extras = chooseAuthenticParticipants(
      this.activeCharacters().filter((c) => !rankedNames.has(c.name)),
      recentSpeakerNames(this.history, 8),
      3,
      Date.now()
    );
    const participants = [...ranked.slice(0, 5), ...extras];
    const participantNames = [...new Set(participants.map((c) => c.name))];
    const profiles = participants.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);
    const memory = humanMemoryPrompt(this.social, human.from, participantNames, 6);
    const relationships = relationshipPrompt(this.social, [...participantNames, human.from], 10);
    const threads = threadPrompt(this.social, Date.now(), 4);
    this.sceneSeq += 1;
    const sceneId = `a${this.sceneSeq}`;

    const prompt = `${roomRealityPrompt()}\n\nROOM: People Connection / Town Square. Current time: ${simulatedDateTimeLabel()}.\n\nFIXED PEOPLE WHO MAY SPEAK:\n${this.promptProfiles(profiles, 8)}\n\nRELATIONSHIPS:\n${relationships}\n\nWHAT THESE BOTS ACTUALLY REMEMBER ABOUT ${human.from}:\n${memory}\nUse a memory only if that specific bot witnessed it.\n\nACTIVE THREADS:\n${threads}\n\nRECENT VISIBLE SCROLL (people may have missed parts of it):\n${this.recentTranscript(14) || "The room just opened."}\n\n${human.from} just typed: ${human.text}\nTopic hints: ${topicNamesForPrompt(human.text)}\nLikely people who noticed: ${ranked.map((c) => c.name).join(", ")}.\n\nThe room director has already decided that somebody noticed this message. Produce only 1-3 PUBLIC ROOM sends. Exactly one send must naturally acknowledge or answer ${human.from}; a second bot MAY react to that answer; an optional third send may be unrelated cross-talk from an existing thread. Do not make the whole room pivot to the human. ${human.target !== "room" ? `${human.from} directly addressed ${human.target}, so ${human.target} should normally be the one who answers.` : "Pick one person who actually cares or happened to notice."}\n\nKeep each send short enough for old AOL: ideally 2-12 words and never more than about two screen lines. It is fine to answer imperfectly, ask 'what do u mean', disagree, miss part of the message, or answer an earlier point. Do not summarize. Do not sound helpful or polished. Use screen names only when a real chatter would. Occasional lol/heh/:)/brb is fine; do not stuff slang into every line.\n\nOutput JSON only:\n{"messages":[{"speaker":"JennJenn","text":"...","target":"${human.from}","intent":"reply","topic":"general"}]}\nOnly active bot speakers: ${this.activeBotNames.join(", ")}.`;

    const messages = await this.callGroq(prompt, 320, 3, human.from);
    return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));
  }

  async generateGroqBatch() {
    const now = Date.now();
    const recent = recentSpeakerNames(this.history, 12);
    const selected = chooseAuthenticParticipants(this.activeCharacters(), recent, 8, now);
    if (selected.length < 3) return super.generateGroqBatch();

    const names = selected.map((c) => c.name);
    const humanNames = this.humanNames();
    const relationships = relationshipPrompt(this.social, [...names, ...humanNames], 12);
    const threads = threadPrompt(this.social, now, 5);
    const roles = names.map((name) => `${name}:${activityRole(name, now)}`).join(", ");
    this.sceneSeq += 1;
    const sceneId = `r${this.sceneSeq}`;

    const prompt = `${roomRealityPrompt(now)}\n\nROOM: People Connection / Town Square. Current time: ${simulatedDateTimeLabel(now)}. Room mood: ${roomMood(now).id}.\n\nPOSSIBLE SPEAKERS:\n${this.promptProfiles(selected, 8)}\nSession activity roles: ${roles}. Talkers can dominate; occasional people speak now and then; lurkers often say nothing at all.\n\nRELATIONSHIPS:\n${relationships}\n\nACTIVE THREADS:\n${threads}\n\nHumans present: ${humanNames.join(", ") || "none"}. They are just room members, not the audience for every line.\n\nRECENT VISIBLE SCROLL:\n${this.recentTranscript(16) || "The room just opened."}\n\nGenerate 7-10 NEXT PUBLIC-ROOM sends. This must look like a crowded 1995-1996 AOL transcript, NOT a scripted scene with a clean beginning/middle/end. Keep 2-4 overlapping exchanges alive. One exchange can dominate for 2-3 lines, then another line can cut across it. Some questions should go unanswered. At least one message should receive no acknowledgement. Somebody may answer a line that is already 2-4 messages old. A short greeting, asl?, brb, wb, random opinion, or 'who r u talking to?' can appear if natural.\n\nDo not make every line connected to the previous one. Do not make everyone unique: a talkative regular can speak several times while several listed occupants never speak. Friends use shorthand and callbacks; rivals needle each other. Strangers are less familiar. One person may suddenly drop a strange mundane detail from work/home and the room may or may not pick it up.\n\nKeep most sends 2-12 words and under about 108 characters. Rarely split a thought into two consecutive sends. Use imperfect punctuation/capitalization and plain ASCII-era emoticons only. No modern slang, emoji, therapy-speak, customer-service tone, narration, stage directions, or 'as an AI'. Do not mention the year unless somebody actually asks.\n\nOutput JSON only:\n{"messages":[{"speaker":"CyberDude","text":"...","target":"room","intent":"cross-talk","topic":"general"}]}\nOnly active bot speakers: ${this.activeBotNames.join(", ")}.`;

    const messages = await this.callGroq(prompt, 700, 10, "room");
    return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));
  }

  maybeIgnorePendingHuman(now = Date.now()) {
    if (!this.pendingHumans?.length || this.tos) return false;
    this.pendingHumans = coalescePendingHumans(this.pendingHumans);
    const human = this.pendingHumans[0];

    if (human.__authRespond === undefined) {
      const decision = humanEngagementDecision(human, {
        history: this.history,
        queueLength: this.aiQueue?.length || 0,
        occupancy: this.visibleUsers().length,
        now
      });
      human.__authRespond = decision.respond;
      human.__authChance = decision.chance;
      this.lastEngagementDecision = {
        from: human.from,
        text: human.text.slice(0, 80),
        respond: decision.respond,
        chance: Math.round(decision.chance * 100),
        at: now
      };
    }

    if (human.__authRespond) return false;

    // The authentic failure mode: the message simply scrolls by while the room
    // continues doing whatever it was already doing.
    this.pendingHumans.shift();
    this.humanReplyDueAt = 0;
    this.scheduledHumanAt = 0;
    if (this.aiQueue?.length) this.nextBotAt = Math.min(this.nextBotAt, now + 900 + Math.floor(Math.random() * 1800));
    return true;
  }

  maybeAbruptConnectionDrop(now = Date.now()) {
    if (now < this.nextConnectionDropAt || this.tos) return;
    this.nextConnectionDropAt = nextAbruptDropAt(now);
    if (!shouldAbruptDrop(this.activeBotNames.length)) return;

    const recent = new Set(recentSpeakerNames(this.history, 5));
    const candidates = shuffled(this.activeBotNames.filter((name) => !recent.has(name)));
    const name = candidates[0];
    if (!name) return;

    this.activeBotNames = this.activeBotNames.filter((bot) => bot !== name);
    this.targetOccupancy = Math.max(18, Math.min(23, this.targetOccupancy - 1));
    this.suppressSocialExitReaction = true;
    super.system(`${name} has left the room.`);
    this.suppressSocialExitReaction = false;
    this.broadcastPresence();
    this.persistSocial(true);
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    const now = Date.now();

    // Own the population target before the older director gets a chance to choose
    // 24 or 25; historical AOL public rooms stopped at 23.
    if (now >= this.targetChangesAt) {
      this.targetOccupancy = authenticRoomTarget();
      this.targetChangesAt = now + 65000 + Math.floor(Math.random() * 130000);
    }
    this.targetOccupancy = Math.min(23, this.targetOccupancy);

    this.trimToHistoricalRoomCap();
    const ignored = this.maybeIgnorePendingHuman(now);
    this.maybeAbruptConnectionDrop(now);

    await super.tick(ignored ? false : forceSoon);

    this.targetOccupancy = Math.min(23, this.targetOccupancy);
    this.trimToHistoricalRoomCap();
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      pass: "1996-authenticity-v10",
      authenticity: {
        hardRoomCap: 23,
        occupancy: this.visibleUsers().length,
        lastHumanDecision: this.lastEngagementDecision,
        nextAbruptDropInMs: Math.max(0, this.nextConnectionDropAt - now),
        activity: this.activeBotNames.slice(0, 18).map((bot) => `${bot}:${activityRole(bot, now)}`)
      }
    };
  }
}
