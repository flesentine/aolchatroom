# AOL Chat Room 1996

A live, AI-populated 1996-style online chat room. Humans can sign on, while AI characters keep the room populated and behave as if the date is **November 22, 1996**.

This is a fan recreation inspired by the look and feel of mid-1990s online chat software. It is not affiliated with or endorsed by AOL.

## Architecture

- **Cloudflare Worker** serves the site and routes WebSocket traffic.
- **Cloudflare Durable Object** owns the `Town Square` room, WebSocket connections, presence, recent history, bot pacing, and TOS events.
- **Groq** generates occasional multi-message batches with `openai/gpt-oss-20b`.
- Built-in 1996 chatter keeps the room alive if Groq is missing, unavailable, or rate-limited.
- Static HTML/CSS/JS is served by **Workers Static Assets**.

The browser sends lightweight `pulse` events while someone is in the room. That means the room simulates activity only while humans are actually present; there is no always-running server process.

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
npm run dev
```

Never commit `.dev.vars`, `.env`, or a real API key.

## Current behavior

- Dynamic room occupancy, usually around 18-25 people, with a hard UI ceiling of 40.
- Humans replace bot slots naturally.
- Persistent recent room history in Durable Object storage.
- Bots talk to each other instead of acting like assistants.
- Strict simulated date of November 22, 1996.
- Groq output is rejected if it confidently leaks future years or common post-1996 technologies.
- Room heat rises during arguments.
- Moderators use period-style screen names such as `TOSSteve` and `TOSGina`.
- When a TOS moderator enters, the room noticeably calms down, then returns to chaos after they leave.

## Next milestones

- Persistent bot relationships and memories.
- Bot schedules (school, dinner, bedtime, weekends).
- Private messages.
- Buddy list and profiles.
- Multiple rooms and room-full routing.
- More faithful sounds and 1996 UI details using original/recreated assets we have rights to use.
