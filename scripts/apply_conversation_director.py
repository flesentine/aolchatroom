from pathlib import Path

root = Path(__file__).resolve().parents[1]
index_path = root / "src" / "index.js"
app_path = root / "public" / "app.js"
package_path = root / "package.json"
readme_path = root / "README.md"

text = index_path.read_text()

old = 'import { calendarChatterLine } from "./calendar.js";\n'
new = '''import { calendarChatterLine } from "./calendar.js";\nimport {\n  chooseSceneSpec,\n  pickSceneParticipants,\n  sceneRelationshipSummary,\n  sceneDirectorPrompt,\n  buildFallbackScene,\n  pacingDelay,\n  recentSpeakerNames,\n  roomMood\n} from "./director.js";\n'''
assert old in text
text = text.replace(old, new, 1)

text = text.replace('const HUMAN_AI_COOLDOWN_MS = 7000;\nconst BACKGROUND_AI_COOLDOWN_MS = 65000;', 'const HUMAN_AI_COOLDOWN_MS = 8000;\nconst BACKGROUND_AI_COOLDOWN_MS = 90000;', 1)

old = '    this.lastBackgroundAiAt = 0;\n    this.aiStatus = env.GROQ_API_KEY ? "Groq configured" : "Built-in 1996 chatter";'
new = '    this.lastBackgroundAiAt = 0;\n    this.sceneSeq = 0;\n    this.aiStatus = env.GROQ_API_KEY ? "Groq configured" : "Built-in 1996 chatter";'
assert old in text
text = text.replace(old, new, 1)

start = text.index('  builtInHumanReply(human) {')
end = text.index('\n  recentThreadMessage(thread) {', start)
replacement = '''  builtInHumanReply(human) {\n    const ranked = this.rankedResponders(human, 9);\n    const replies = [];\n    const topic = inferConversationTopic(human.text);\n\n    for (const character of ranked) {\n      const text = chooseDistinctLine(\n        () => renderDirectedFallback(character, human),\n        [...this.history, ...replies.map((r) => ({ from: r.speaker, text: r.text }))],\n        character.name,\n        18\n      );\n      if (!text) continue;\n      replies.push({\n        speaker: character.name,\n        text,\n        source: "built-in",\n        intent: "reply",\n        target: human.from,\n        topic\n      });\n      break;\n    }\n\n    // A real room rarely stops after a single answer. Let another regular react\n    // to the first answer, then occasionally let a third person pile on.\n    if (replies.length && ranked.length > 1) {\n      const first = replies[0];\n      const second = ranked.find((character) => character.name !== first.speaker);\n      if (second) {\n        const text = chooseDistinctLine(\n          () => renderReaction(second, { from: first.speaker, text: first.text, kind: "bot", topic }),\n          [...this.history, ...replies.map((r) => ({ from: r.speaker, text: r.text }))],\n          second.name,\n          22\n        );\n        if (text) replies.push({\n          speaker: second.name,\n          text,\n          source: "built-in",\n          intent: "follow-up",\n          target: first.speaker,\n          topic\n        });\n      }\n    }\n\n    if (replies.length >= 2 && ranked.length > 2 && Math.random() < 0.42) {\n      const prior = replies[replies.length - 1];\n      const third = ranked.find((character) => !replies.some((reply) => reply.speaker === character.name));\n      if (third) {\n        const text = chooseDistinctLine(\n          () => renderReaction(third, { from: prior.speaker, text: prior.text, kind: "bot", topic }),\n          [...this.history, ...replies.map((r) => ({ from: r.speaker, text: r.text }))],\n          third.name,\n          22\n        );\n        if (text) replies.push({\n          speaker: third.name,\n          text,\n          source: "built-in",\n          intent: "pile-on",\n          target: prior.speaker,\n          topic\n        });\n      }\n    }\n\n    return replies.slice(0, 3);\n  }\n'''
text = text[:start] + replacement + text[end:]

# Add built-in scene bursts before the ordinary ambient selector.
needle = '''  builtInAmbient() {\n    const humans = this.humanNames();\n'''
insert = '''  builtInAmbient() {\n    const humans = this.humanNames();\n\n    // Roughly one out of three idle moments begins a small multi-turn scene.\n    // These are intentionally mundane; the room should feel like people with\n    // lives, not a museum of 1996 references.\n    if (this.activeBotNames.length >= 3 && Math.random() < 0.34) {\n      this.sceneSeq += 1;\n      const scene = buildFallbackScene(\n        this.activeCharacters(),\n        (a, b) => relationshipScore(this.social, a, b),\n        this.sceneSeq\n      );\n      if (scene.length) {\n        const [first, ...rest] = scene;\n        this.aiQueue.push(...rest);\n        return first;\n      }\n    }\n'''
assert needle in text
text = text.replace(needle, insert, 1)

# Human replies go to the front of the queue so a human never waits behind a\n# seven-line autonomous conversation.
old = '''      for (const reply of replies.slice(0, 3)) {\n        this.aiQueue.push({\n          ...reply,\n          source: reply.source || source,\n          intent: reply.intent || "reply",\n          target: reply.target || human.from,\n          topic: reply.topic || inferConversationTopic(human.text)\n        });\n      }\n'''
new = '''      const priorityReplies = replies.slice(0, 5).map((reply) => ({\n        ...reply,\n        source: reply.source || source,\n        intent: reply.intent || "reply",\n        target: reply.target || human.from,\n        topic: reply.topic || inferConversationTopic(human.text)\n      }));\n      if (priorityReplies.length) this.aiQueue.unshift(...priorityReplies);\n'''
assert old in text
text = text.replace(old, new, 1)

# Variable pacing: fast during an active burst, slower between conversations.
old = '    this.nextBotAt = now + 2100 + Math.floor(Math.random() * 4300);'
new = '    this.nextBotAt = now + pacingDelay(this.aiQueue.length, next?.intent || "");'
assert old in text
text = text.replace(old, new, 1)

# Reject excessive filler from an AI batch. One tiny reaction is realistic; a\n# wall of "lol / yeah / no way" is not.
old = '''      if (!activeNames.has(speaker) || !text || text.length > 140 || !botLineAllowed(text)) continue;\n      if (isTooSimilar(text, tempHistory, speaker)) continue;\n      const item = {\n'''
new = '''      if (!activeNames.has(speaker) || !text || text.length > 180 || !botLineAllowed(text)) continue;\n      if (isTooSimilar(text, tempHistory, speaker)) continue;\n      const filler = /^(lol+|yeah|yep|nah|no way|whatever|haha+|what|wow|true|same|ok|k)$/i.test(text.trim());\n      const fillerAlready = accepted.some((row) => /^(lol+|yeah|yep|nah|no way|whatever|haha+|what|wow|true|same|ok|k)$/i.test(row.text.trim()));\n      if (filler && fillerAlready) continue;\n      if (accepted.length && accepted[accepted.length - 1].speaker === speaker && Math.random() < 0.7) continue;\n      const item = {\n'''
assert old in text
text = text.replace(old, new, 1)

# Replace the human AI prompt with a mini-conversation rather than isolated replies.
start = text.index('  async generateGroqHumanReply(human) {')
end = text.index('\n  async generateGroqBatch() {', start)
human_fn = '''  async generateGroqHumanReply(human) {\n    const ranked = this.rankedResponders(human, 7);\n    const extras = shuffled(this.activeCharacters().filter((c) => !ranked.some((r) => r.name === c.name))).slice(0, 3);\n    const participants = [...ranked, ...extras];\n    const humanNames = this.humanNames().join(", ") || "none";\n    const participantNames = participants.map((c) => c.name);\n    const memory = humanMemoryPrompt(this.social, human.from, participantNames, 7);\n    const relationships = relationshipPrompt(this.social, [...participantNames, human.from], 12);\n    const threads = threadPrompt(this.social, Date.now(), 4);\n    this.sceneSeq += 1;\n    const sceneId = `h${this.sceneSeq}`;\n\n    const prompt = `ROOM: People Connection / Town Square. Current simulated time: ${simulatedDateTimeLabel()}. Everyone believes this is 1996.\n\nFIXED FICTIONAL CHARACTER PROFILES:\n${this.promptProfiles(participants, 10)}\n\nRELATIONSHIPS THAT MATTER:\n${relationships}\n\nWHAT INDIVIDUAL BOTS ACTUALLY REMEMBER ABOUT ${human.from}:\n${memory}\nOnly let a bot refer to a remembered fact if that bot's memory line above says it remembers it.\n\nACTIVE CONVERSATIONS:\n${threads}\n\nHumans currently here: ${humanNames}. Do not invent facts about humans.\n\nRecent room:\n${this.recentTranscript(26) || "The room just opened."}\n\nLatest HUMAN message:\n${human.from}: ${human.text}\nLikely responders: ${ranked.map((c) => c.name).join(", ")}.\n\nWrite a 3-5 line MINI-CONVERSATION, not 3 independent answers. Line 1 or 2 must genuinely engage ${human.from}. Then another bot should react to that answer, challenge it, ask for a detail, add a specific opinion, or briefly continue another thread. It is good to ask ${human.from} one natural follow-up question when appropriate. ${human.target !== "room" ? `${human.from} directly addressed ${human.target}; ${human.target} should normally answer first.` : "Choose whoever actually cares about the subject."}\n\nIMPORTANT: substance beats filler. Do not make the batch mostly 'lol', 'yeah', 'no way', or generic agreement. At least two lines must add a concrete opinion, detail, question, anecdote, disagreement, or new information. Most lines can be 2-15 words, but one line may be 15-28 words if someone is telling a small story. People interrupt, tease, misunderstand, and disagree. They do NOT sound like assistants. Do not force 1990s references into every line; ordinary work, friends, dating, family, money, food, boredom, and weird daily events are better.\n\nOutput JSON only:\n{"messages":[{"speaker":"JennJenn","text":"...","target":"${human.from}","intent":"reply","topic":"music"}]}\n\nOnly active bot speakers: ${this.activeBotNames.join(", ")}.`;\n\n    const messages = await this.callGroq(prompt, 430, 5, human.from);\n    return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));\n  }\n'''
text = text[:start] + human_fn + text[end:]

# Replace autonomous AI generation with a directed scene / cross-talk batch.
start = text.index('  async generateGroqBatch() {')
end = text.index('\n  debugState(name) {', start)
batch_fn = '''  async generateGroqBatch() {\n    const currentThreads = activeThreads(this.social, Date.now());\n    const humanNames = this.humanNames();\n    const recentSpeakers = recentSpeakerNames(this.history, 10);\n    const scene = chooseSceneSpec({\n      now: Date.now(),\n      hasThreads: currentThreads.length > 0,\n      hasHumans: humanNames.length > 0\n    });\n    const selected = pickSceneParticipants(\n      this.activeCharacters(),\n      (a, b) => relationshipScore(this.social, a, b),\n      recentSpeakers,\n      8\n    );\n    const participantNames = selected.map((character) => character.name);\n    const relationshipNames = [...participantNames, ...humanNames];\n    this.sceneSeq += 1;\n    const sceneId = `g${this.sceneSeq}`;\n\n    const prompt = `ROOM: People Connection / Town Square. Current simulated time: ${simulatedDateTimeLabel()}. Everyone believes it is 1996.\n\nCONVERSATION DIRECTOR:\n${sceneDirectorPrompt(scene)}\n\nPeople chosen for this scene: ${participantNames.join(", ")}. Their relationship flavor: ${sceneRelationshipSummary(selected, (a, b) => relationshipScore(this.social, a, b))}.\n\nFIXED PROFILES:\n${this.promptProfiles(selected, 8)}\n\nRELATIONSHIPS:\n${relationshipPrompt(this.social, relationshipNames, 12)}\n\nACTIVE THREADS:\n${threadPrompt(this.social, Date.now(), 4)}\n\nHumans present: ${humanNames.join(", ") || "none"}.\n\nRecent room:\n${this.recentTranscript(28) || "The room just opened."}\n\nGenerate 7-10 NEXT chat lines as a little social scene with an arc. Someone introduces a concrete thought/story/question; somebody responds; somebody asks a follow-up or disagrees; somebody else may jump in; then let the subject mutate, resolve, or get interrupted. About 20% of the lines may be cross-talk from a second conversation. Use relationships: friends have shorthand and callbacks, rivals needle each other, strangers are less familiar.\n\nDo NOT write 7 disconnected one-liners. Do NOT make everyone politely agree. Do NOT make the room a 1996 trivia exhibit. Most people talk about ordinary life. Avoid empty filler; at most one line in the whole batch can be only 'lol', 'yeah', 'nah', 'no way', etc. Most messages should be 2-15 words, with occasional 15-30 word story lines. Questions should often get an actual answer. Let characters have bad takes, partial information, petty opinions, and different levels of interest. A human may be included naturally if they recently spoke, but bots must be able to sustain the room without them.\n\nOutput JSON only:\n{"messages":[{"speaker":"CyberDude","text":"...","target":"WebMasterJ","intent":"scene-reply","topic":"general"}]}\n\nOnly use active bot speakers from: ${this.activeBotNames.join(", ")}.`;\n\n    const messages = await this.callGroq(prompt, 720, 10, "room");\n    return messages.map((message, index) => ({ ...message, sceneId, beat: index + 1 }));\n  }\n'''
text = text[:start] + batch_fn + text[end:]

# Add mood/scene info to debug state.
old = '''      pass: 2,\n      simulated: simulatedDateTimeLabel(),\n      roster: this.activeBotNames.length,\n'''
new = '''      pass: 2.5,\n      simulated: simulatedDateTimeLabel(),\n      mood: roomMood().id,\n      queue: this.aiQueue.length,\n      roster: this.activeBotNames.length,\n'''
assert old in text
text = text.replace(old, new, 1)

index_path.write_text(text)

# Make scene/beat visible in ?debug=1 metadata.
app = app_path.read_text()
old = '      meta.textContent = ` [${item.source}/${item.intent || "chat"}${target}]`;'
new = '      const scene = item.sceneId ? ` • ${item.sceneId}${item.beat ? `#${item.beat}` : ""}` : "";\n      meta.textContent = ` [${item.source}/${item.intent || "chat"}${target}${scene}]`;'
assert old in app
app = app.replace(old, new, 1)
app_path.write_text(app)

# Include director in syntax checks and bump version.
pkg = package_path.read_text()
pkg = pkg.replace('"version": "0.5.0"', '"version": "0.6.0"')
pkg = pkg.replace('node --check src/characters.js && node --check src/chatter.js && node --check src/index.js', 'node --check src/characters.js && node --check src/chatter.js && node --check src/calendar.js && node --check src/director.js && node --check src/index.js')
package_path.write_text(pkg)

readme = readme_path.read_text()
marker = '\n## Current behavior\n'
addition = '''\n## Pass 2.5: conversation director\n\nThe room now prioritizes social scenes over isolated one-liners:\n\n- Groq background calls generate 7-10 turn mini-scenes in one request, with an opener, answers, follow-ups, disagreement, pile-ons, and occasional cross-talk.\n- Human messages generate a 3-5 line mini-conversation so another bot can react to the first answer instead of everyone independently replying to the human.\n- Built-in fallback chatter can also launch multi-turn scenes about ordinary work, roommates, dating, money, cars, VHS rentals, phone calls, dumb purchases, and other mundane life.\n- Human replies jump to the front of the room queue; autonomous conversations resume afterward instead of making a person wait behind them.\n- Conversation pacing speeds up during an active exchange and slows down between scenes.\n- AI batches allow occasional longer story lines and reject repeated one-word filler.\n- A rotating room mood (chatty, goofy, nosy, argumentative, scattered, late-night) changes the kind of interaction the director asks for.\n- The director explicitly avoids turning the room into 1996 trivia. Most chatter should be ordinary life, with period details emerging naturally.\n- Debug mode shows scene ids and beat numbers so a multi-message arc is easy to inspect.\n'''
if '## Pass 2.5: conversation director' not in readme:
    assert marker in readme
    readme = readme.replace(marker, addition + marker, 1)
readme_path.write_text(readme)
