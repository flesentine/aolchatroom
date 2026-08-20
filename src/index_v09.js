import baseWorker, { ChatRoom as CultureChatRoom } from "./index_v08.js";
import { roomMood } from "./director.js";
import {
  firstHumanReplyDelay,
  queuedMessageDelay,
  ambientRoomDelay,
  quietRetryDelay,
  coalescePendingHumans
} from "./timing.js";

export default baseWorker;

export class ChatRoom extends CultureChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.humanReplyDueAt = 0;
    this.scheduledHumanAt = 0;
    this.lastTimedBotAt = 0;
  }

  scheduleHumanReply(now = Date.now(), forceSoon = false) {
    if (!this.pendingHumans?.length) {
      this.humanReplyDueAt = 0;
      this.scheduledHumanAt = 0;
      return 0;
    }

    this.pendingHumans = coalescePendingHumans(this.pendingHumans);
    const human = this.pendingHumans[0];
    const humanAt = Number(human?.at || now);

    if (!this.humanReplyDueAt || this.scheduledHumanAt !== humanAt) {
      this.scheduledHumanAt = humanAt;
      this.humanReplyDueAt = now + firstHumanReplyDelay(human, {
        occupancy: this.visibleUsers?.().length || 20
      });
    } else if (forceSoon) {
      // A second line arriving while somebody is "reading/typing" should not cause
      // the reply to pop instantly. Give them a little time to absorb it.
      this.humanReplyDueAt = Math.max(
        this.humanReplyDueAt,
        now + 1200 + Math.floor(Math.random() * 1400)
      );
    }

    return this.humanReplyDueAt;
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    const now = Date.now();

    if (this.pendingHumans?.length && !this.tos) {
      const due = this.scheduleHumanReply(now, forceSoon);
      if (due > now) {
        // Base message handling tries to pull nextBotAt down to ~600 ms after a
        // human speaks. Replace that with our actual human reaction/typing time.
        this.nextBotAt = due;
        await super.tick(false);
        // Presence reconciliation or other bookkeeping in super.tick must not
        // accidentally make the queued human answer immediate again.
        if (this.pendingHumans?.length && !this.tos) this.nextBotAt = Math.max(this.nextBotAt, due);
        return;
      }
      this.nextBotAt = now;
    }

    const beforeHistoryLength = this.history?.length || 0;
    const beforePendingLength = this.pendingHumans?.length || 0;

    await super.tick(false);

    const after = Date.now();
    const afterPendingLength = this.pendingHumans?.length || 0;
    const newMessages = (this.history || []).slice(beforeHistoryLength);
    const emittedBot = [...newMessages].reverse().find((row) => row?.kind === "bot" || row?.kind === "tos") || null;

    if (afterPendingLength < beforePendingLength) {
      this.humanReplyDueAt = 0;
      this.scheduledHumanAt = 0;
    }

    // If another human line is waiting, let that line establish the next due time
    // instead of immediately draining it on the next 1.5 second browser pulse.
    if (this.pendingHumans?.length && !this.tos) {
      const due = this.scheduleHumanReply(after, false);
      this.nextBotAt = due;
      return;
    }

    if (emittedBot) {
      this.lastTimedBotAt = after;
      const next = this.aiQueue?.[0] || null;
      const mood = roomMood(after).id;
      const occupancy = this.visibleUsers?.().length || 20;
      const delay = next
        ? queuedMessageDelay(next, emittedBot, { occupancy, mood })
        : ambientRoomDelay({ occupancy, mood });

      // Groq latency can consume most of the base timer because the old code used
      // the timestamp from before the API call. Always schedule from *after* the
      // message actually appeared on screen.
      this.nextBotAt = after + delay;
      return;
    }

    // A filtered/empty generation should not cause a hot retry loop.
    if (!this.tos && (!this.nextBotAt || this.nextBotAt <= after)) {
      this.nextBotAt = after + quietRetryDelay();
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    const now = Date.now();
    return {
      ...base,
      timing: {
        nextMessageInMs: Math.max(0, Math.round((this.nextBotAt || now) - now)),
        humanReplyInMs: this.humanReplyDueAt ? Math.max(0, Math.round(this.humanReplyDueAt - now)) : 0,
        pendingHumans: this.pendingHumans?.length || 0,
        mode: "human reaction + per-character typing + room pacing"
      }
    };
  }
}
