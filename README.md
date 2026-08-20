# AOL Chat Room 1996

A live, AI-populated 1996-style online chat room. Humans can sign on, while persistent fictional characters keep the room populated and behave as if they are living in **1996**.

This is a fan recreation inspired by the look and feel of mid-1990s online chat software. It is not affiliated with or endorsed by AOL.

## Architecture

- **Cloudflare Worker** serves the site and routes WebSocket traffic.
- **Cloudflare Durable Object** owns the `Town Square` room, WebSocket connections, presence, recent history, social state, bot pacing, and TOS events.
- **Groq** generates contextual multi-message batches with `openai/gpt-oss-20b`.
- A large built-in 1996 chatter engine keeps the room alive if Groq is missing, unavailable, cooling down, or rate-limited.
- Static HTML/CSS/JS is served by **Workers Static Assets**.

The browser sends lightweight `pulse` events while someone is in the room. The room simulation advances while at least one human is present. Durable Object storage keeps recent chat history plus the persistent Pass 2 social state.

## Deploy without installing anything locally

1. In Cloudflare, open **Workers & Pages**.
2. Choose **Create application** → **Import a repository**.
3. Connect GitHub and select `flesentine/aolchatroom`.
4. Keep the deploy command as `npx wrangler deploy` and deploy from `main`.
5. Open the Worker in Cloudflare → **Settings** → **Variables and Secrets**.
6. Add a secret named `GROQ_API_KEY` containing your Groq API key.
7. Redeploy once after adding the secret if Cloudflare does not automatically start a new deployment.

After the Git integration is connected, future pushes to `main` can deploy automatically.

## Local development (optional)

```bash
npm install
cp .dev.vars.example .dev.vars
# put your real GROQ_API_KEY in .dev.vars
npm run check
npm run dev
```

Never commit `.dev.vars`, `.env`, or a real API key.

## Pass 1: people instead of generic bots

- 31 recurring fictional adult characters with fixed ages, sexes, locations, jobs, interests, personality traits, typing habits, and opinions.
- Topic-aware responder selection.
- Human messages get a directed response path.
- Multiple humans can queue messages independently.
- Hundreds of period-appropriate built-in lines are organized by behavior and topic.
- Bots react to other bots as well as humans.
- Exact and near-duplicate chatter is rejected.
- Groq output passes through the same anti-repeat and 1996 anachronism filters.
- The AOL-style **Profile** button exposes a character's fixed public profile.

## Pass 2: persistent social world

Pass 2 adds the pieces that make the people feel like regulars instead of disconnected AI turns:

- **Persistent relationships.** Character-to-character relationships are seeded from shared interests plus hand-authored friendships and rivalries. Every direct interaction can slowly improve or damage the relationship, and Groq receives the relevant relationship history before generating dialogue.
- **Human memory.** The room remembers low-risk self-disclosed details such as likes, dislikes, favorite things, broad stated location, frequently discussed topics, visits, and recent familiarity. Sensitive-looking material such as passwords, bank details, API keys, or similar secrets is deliberately excluded from memory extraction.
- **Individual memory witnesses.** A bot may only use a remembered human fact if that bot was in the room when the fact was said. Groq is explicitly told not to give every character shared omniscient memory.
- **Multiple conversation threads.** The room keeps several short-lived topic threads at once, tracks participants, and biases both built-in chatter and Groq toward continuing active conversations rather than constantly starting unrelated one-liners.
- **Schedules.** Every character has a stable online pattern derived from their job/student status, timezone, and screen name. Students, office workers, retail workers, and late-shift characters tend to appear at different local hours.
- **Natural entrances and exits.** The room no longer silently swaps the entire bot list to meet a target count. Roster changes happen gradually, with `has entered the room` / `has left the room` events and occasional `brb`, `later ppl`, or `back` chatter.
- **Sticky regulars.** Existing users and core regulars receive roster preference, while active-thread participants are less likely to vanish in the middle of a conversation.
- **Relationship-aware responders.** A character who already knows a human, is involved in that thread, or is directly addressed is increasingly likely to answer.
- **Dynamic 1996 clock.** The simulation begins around November 22, 1996 and advances with real elapsed time while wrapping within 1996, so timezones and online schedules can behave consistently without anyone learning about the future.
- **Profile context.** Profiles now also show the character's usual online schedule and a simple description of how well that member currently knows the signed-in human.

## Debug mode

Append `?debug=1` to the live room URL.

In debug mode each visible line includes its source, intent, target, topic, and conversation-thread id. A small panel also shows:

- current simulated date/time,
- active conversation threads,
- what the room remembers about your screen name,
- strongest current bot-to-human relationship signals,
- current bot roster count.

This is intended for development only; normal visitors do not see it.

## Current behavior

- Dynamic room occupancy, usually around 18-25 people, with a hard UI ceiling of 40.
- Humans consume room slots and bots naturally rotate around them.
- Persistent recent room history and persistent social state in Durable Object storage.
- Bots talk to each other and can maintain overlapping conversations.
- Recurring characters have fixed profiles and evolving relationships.
- Returning humans can be recognized from prior room interactions when a bot plausibly witnessed the remembered detail.
- Groq output is rejected if it confidently leaks future years or common post-1996 technologies.
- Room heat rises during arguments.
- Moderators use period-style screen names such as `TOSSteve` and `TOSGina`, with different warning styles.
- When a TOS moderator enters, the room noticeably calms down, then returns to chaos after they leave.

## Next milestones

- Private messages.
- Buddy list and presence notifications.
- Stronger long-term memory consolidation instead of only lightweight remembered facts.
- Multiple rooms and room-full routing.
- More detailed away/idle states and character-specific weekly schedules.
- More faithful sounds and 1996 UI details using original/recreated assets we have rights to use.
