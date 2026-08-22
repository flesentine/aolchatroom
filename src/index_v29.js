import baseWorker, { ChatRoom as LifeBibleChatRoom } from "./index_v28.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V29_HARNESS_START_KEY = "realismHarnessV29Start";
const DEPARTURE_STATE_KEY = "departureStateV29";
const AI_SOURCES = new Set(["gemini", "groq", "workers-ai", "ai"]);
const STRONG_MIN_MS = 2500;
const STRONG_MAX_MS = 11000;
const SOFT_MIN_MS = 45000;
const SOFT_MAX_MS = 150000;
const RETURN_MIN_MS = 6 * 60 * 1000;
const RETURN_MAX_MS = 18 * 60 * 1000;

const STRONG_DEPARTURE = /(?:\bgotta\s+(?:go|run|split)\b|\b(?:i'?m|im)\s+(?:out|leaving|heading\s+out|headed\s+out|going\s+to\s+bed|heading\s+to\s+bed|headed\s+to\s+bed|logging\s+off|signing\s+off)\b|\b(?:i'?ll|ill|i\s+will|gonna|going\s+to|need\s+to)\b.{0,24}\b(?:bail|head\s+out|log\s+off|sign\s+off|go\s+to\s+bed|hit\s+the\s+hay|crash)\b|\b(?:good\s*night|night\s+(?:all|ppl|guys|everyone)|bye\s+(?:guys|everyone|all|ppl)|later\s+ppl|cya\s+all|catch\s+(?:you|u)\s+later)\b)/i;
const SOFT_DEPARTURE = /(?:\b(?:should|probably\s+should|probably\s+gonna|might\s+have\s+to|better)\b.{0,32}\b(?:bail|leave|head\s+out|get\s+off|log\s+off|sign\s+off|go\s+to\s+bed|hit\s+the\s+hay|crash)\b|\b(?:getting|pretty|really|so)\s+(?:late|tired)\b.{0,44}\b(?:bail|bed|head\s+out|get\s+off|log\s+off|sign\s+off|crash|in\s+a\s+sec|soon)\b)/i;

function compact(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rangedDelay(seed, min, max) {
  const span = Math.max(1, max - min + 1);
  return min + (hashString(seed) % span);
}

function departureStrength(text) {
  const value = compact(text, 320);
  if (!value) return "";
  if (STRONG_DEPARTURE.test(value)) return "strong";
  if (SOFT_DEPARTURE.test(value)) return "soft";
  return "";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        room: "Town Square",
        simulatedDate: simulatedDateLabel(),
        simulatedDateTime: simulatedDateTimeLabel(),
        pass: "departure-follow-through-v29",
        providerPriority: PROVIDER_PRIORITY,
        departures: {
          aiFarewellsCausePresenceExit: true,
          softLeaveIntentCanLinger: true,
          hardFarewellDelayMs: [STRONG_MIN_MS, STRONG_MAX_MS],
          softLeaveDelayMs: [SOFT_MIN_MS, SOFT_MAX_MS],
          postExitReturnCooldownMinutes: [Math.round(RETURN_MIN_MS / 60000), Math.round(RETURN_MAX_MS / 60000)],
          queuedLinesPurgedOnExit: true,
          builtInPresenceChurnPreserved: true,
          statusEndpoint: "/api/departure-status"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/departure-status") {
      const id = env.CHAT_ROOMS.idFromName("town-square");
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/departure-status"));
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends LifeBibleChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v29Loaded = false;
    this.pendingDepartures = new Map();
    this.departedUntil = new Map();
    this.v29Stats = {
      aiDepartureSignals: 0,
      strongSignals: 0,
      softSignals: 0,
      departuresCompleted: 0,
      queuedLinesPurged: 0,
      builtInDeparturesObserved: 0,
      cooldownRosterSkips: 0
    };
  }

  async ensureState() {
    await super.ensureState();
    if (this.v29Loaded) return;

    const [saved, harness] = await Promise.all([
      this.ctx.storage.get(DEPARTURE_STATE_KEY),
      this.ctx.storage.get(V29_HARNESS_START_KEY)
    ]);

    if (saved && saved.version === 1) {
      for (const row of saved.pending || []) {
        if (row?.name && Number(row.dueAt || 0) > Date.now()) this.pendingDepartures.set(row.name, row);
      }
      for (const row of saved.cooldowns || []) {
        if (row?.name && Number(row.until || 0) > Date.now()) this.departedUntil.set(row.name, Number(row.until));
      }
    }

    let started = Number(harness || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V29_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v29Loaded = true;
  }

  persistDepartureState() {
    const now = Date.now();
    const pending = [...this.pendingDepartures.values()].filter((row) => Number(row.dueAt || 0) > now);
    const cooldowns = [...this.departedUntil.entries()]
      .filter(([, until]) => Number(until || 0) > now)
      .map(([name, until]) => ({ name, until }));
    const promise = this.ctx.storage.put(DEPARTURE_STATE_KEY, { version: 1, pending, cooldowns, updatedAt: now });
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(promise);
    else promise.catch(() => {});
  }

  scheduleDeparture(name, text, strength, now = Date.now()) {
    if (!name || !this.activeBotNames?.includes(name) || !strength) return;
    const existing = this.pendingDepartures.get(name);
    const delay = strength === "strong"
      ? rangedDelay(`${name}|${text}|${Math.floor(now / 1000)}`, STRONG_MIN_MS, STRONG_MAX_MS)
      : rangedDelay(`${name}|${text}|${Math.floor(now / 5000)}`, SOFT_MIN_MS, SOFT_MAX_MS);
    const dueAt = now + delay;

    // A definite farewell upgrades/accelerates a vague earlier "I should go soon".
    if (existing && Number(existing.dueAt || 0) <= dueAt && existing.strength === "strong") return;
    if (existing && existing.strength === "soft" && strength === "soft" && Number(existing.dueAt || 0) <= dueAt) return;

    this.pendingDepartures.set(name, {
      name,
      strength,
      dueAt,
      signaledAt: now,
      text: compact(text, 180)
    });
    this.v29Stats.aiDepartureSignals += 1;
    if (strength === "strong") this.v29Stats.strongSignals += 1;
    else this.v29Stats.softSignals += 1;
    this.persistDepartureState();
    this.broadcast({
      type: "departure_intent",
      action: "scheduled",
      speaker: name,
      strength,
      dueInMs: delay,
      at: now
    });
  }

  markReturnCooldown(name, now = Date.now(), reason = "departure") {
    const delay = rangedDelay(`${name}|${reason}|${Math.floor(now / 10000)}`, RETURN_MIN_MS, RETURN_MAX_MS);
    this.departedUntil.set(name, now + delay);
  }

  performDeparture(name, reason = "ai-farewell", now = Date.now()) {
    if (!this.activeBotNames?.includes(name)) {
      this.pendingDepartures.delete(name);
      return false;
    }

    const before = (this.aiQueue || []).length;
    this.aiQueue = (this.aiQueue || []).filter((item) => item?.speaker !== name);
    const purged = before - this.aiQueue.length;
    this.v29Stats.queuedLinesPurged += purged;

    this.pendingDepartures.delete(name);
    this.activeBotNames = this.activeBotNames.filter((bot) => bot !== name);
    this.markReturnCooldown(name, now, reason);

    if (this.social?.presence) {
      this.social.presence.online = [...this.activeBotNames];
      this.social.presence.lastChangeAt = now;
      this.social.presence.lastChurnAt = now;
    }

    this.system(`${name} has left the room.`);
    this.broadcastPresence();
    this.persistSocial?.(true);
    this.persistDepartureState();
    this.v29Stats.departuresCompleted += 1;

    this.broadcast({
      type: "departure_intent",
      action: "completed",
      speaker: name,
      reason,
      purgedQueuedLines: purged,
      at: now
    });
    return true;
  }

  processPendingDepartures(now = Date.now()) {
    for (const [name, row] of [...this.pendingDepartures.entries()]) {
      if (!this.activeBotNames?.includes(name)) {
        this.pendingDepartures.delete(name);
        continue;
      }
      if (now >= Number(row.dueAt || 0)) this.performDeparture(name, `ai-${row.strength}-farewell`, now);
    }

    for (const [name, until] of [...this.departedUntil.entries()]) {
      if (now >= Number(until || 0)) this.departedUntil.delete(name);
    }
  }

  desiredRoster(now = Date.now()) {
    const base = super.desiredRoster(now);
    const filtered = (base || []).filter((name) => {
      const blocked = now < Number(this.departedUntil.get(name) || 0);
      if (blocked) this.v29Stats.cooldownRosterSkips += 1;
      return !blocked;
    });
    return filtered;
  }

  announceBotLeave(name, now = Date.now()) {
    const wasPresent = this.activeBotNames?.includes(name);
    const result = super.announceBotLeave(name, now);
    if (wasPresent && !this.activeBotNames?.includes(name)) {
      this.pendingDepartures.delete(name);
      this.markReturnCooldown(name, now, "built-in-churn");
      this.v29Stats.builtInDeparturesObserved += 1;
      this.persistDepartureState();
    }
    return result;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const result = super.say(from, text, kind, source, meta);
    if (result && kind === "bot" && AI_SOURCES.has(String(source || ""))) {
      const strength = departureStrength(text);
      if (strength) this.scheduleDeparture(from, text, strength, Date.now());
    }
    return result;
  }

  brainPrompt(active, reason, human = null) {
    const base = super.brainPrompt(active, reason, human);
    const pending = [...this.pendingDepartures.values()]
      .filter((row) => this.activeBotNames?.includes(row.name))
      .map((row) => `${row.name}: ${row.strength} leave intention, about ${Math.max(0, Math.round((row.dueAt - Date.now()) / 1000))}s remaining`)
      .slice(0, 6);
    const extra = [
      "DEPARTURE FOLLOW-THROUGH:",
      "- If a character says they are definitely logging off, heading to bed, leaving, bailing, or saying goodbye, that is a real action commitment. Do not plan later conversation turns for them.",
      "- A vague 'I should probably go soon' may linger briefly, but should not turn into twenty more minutes of normal chatter.",
      "- Do not make multiple people announce bedtime just because one person does. Each character decides independently based on their own local time and situation."
    ];
    if (pending.length) extra.push(`- CURRENT PENDING EXITS: ${pending.join("; ")}.`);
    return `${base}\n\n${extra.join("\n")}`;
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    this.processPendingDepartures(Date.now());
    const result = await super.tick(forceSoon);
    this.processPendingDepartures(Date.now());
    return result;
  }

  v29Snapshot(now = Date.now()) {
    return {
      ...this.v29Stats,
      pending: [...this.pendingDepartures.values()].map((row) => ({
        name: row.name,
        strength: row.strength,
        dueInMs: Math.max(0, Number(row.dueAt || 0) - now),
        text: row.text
      })),
      returnCooldowns: [...this.departedUntil.entries()]
        .map(([name, until]) => ({ name, remainingMs: Math.max(0, Number(until || 0) - now) }))
        .filter((row) => row.remainingMs > 0)
    };
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    report.pass = "departure-follow-through-v29";
    report.scope = includeAll ? "all retained messages" : "messages since v29 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.v29DepartureFollowThrough = {
      aiDepartureSignals: Number(this.v29Stats.aiDepartureSignals || 0),
      departuresCompleted: Number(this.v29Stats.departuresCompleted || 0),
      pending: this.pendingDepartures.size,
      queuedLinesPurged: Number(this.v29Stats.queuedLinesPurged || 0)
    };
    return report;
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/departure-status") {
      this.processPendingDepartures(Date.now());
      return Response.json({ ok: true, pass: "departure-follow-through-v29", departures: this.v29Snapshot() });
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({ ...data, pass: "departure-follow-through-v29", v29: this.v29Snapshot() });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return { ...base, pass: "departure-follow-through-v29", v29: this.v29Snapshot() };
  }
}
