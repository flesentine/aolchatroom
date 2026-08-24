import { ChatRoom as V34ChatRoom } from "./index_v34.js";
import { getCharacter } from "./characters.js";
import { activityRole, nextAbruptDropAt, shouldAbruptDrop } from "./authenticity.js";
import { recentSpeakerNames } from "./director.js";
import { publicWorldViolation } from "./v35_world_guard.js";

export const V35_STATE_KEY = "v35State";
export const V35_HARNESS_START_KEY = "realismHarnessV35Start";
export const DIRECT_PRESENCE_LOCK_MS = 110 * 1000;
const PERSIST_MS = 5000;
const AI_SOURCES = new Set(["gemini", "groq", "workers-ai", "ai"]);

export function defaultV35Stats() {
  return {
    engagementFastPathChecks: 0, engagementFastPathPassed: 0, engagementFastPathIgnored: 0,
    directPresenceLocksCreated: 0, directPresenceLocksExtended: 0,
    abruptDropDeferrals: 0, rosterLockPreservations: 0, forcedCapLockEvictions: 0,
    selfTargetsBlocked: 0, generatedLinesBlocked: 0, queuedLinesBlocked: 0, surfaceLinesBlocked: 0,
    futureClaimsBlocked: 0, unsupportedPublicClaimsBlocked: 0,
    unsupportedPublicDetailsBlocked: 0, relativeScheduleClaimsBlocked: 0,
    queueSanitizations: 0, workersBrainSkips: 0,
    emergentFactsPurged: 0, episodicMemoriesPurged: 0
  };
}

function compact(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export class V35PlumbingChatRoom extends V34ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v35Loaded = false;
    this.v35Stats = defaultV35Stats();
    this.v35BootStats = defaultV35Stats();
    this.v35BootStartedAt = Date.now();
    this.v35PresenceLocks = new Map();
    this.v35LastPersistAt = 0;
    this.v35MigrationVersion = 0;
    this.v35StructuredBrainDepth = 0;
    this.v35BrainSkipNoted = false;
  }

  async ensureState() {
    await super.ensureState();
    if (this.v35Loaded) return;
    const [saved, harness] = await Promise.all([
      this.ctx.storage.get(V35_STATE_KEY), this.ctx.storage.get(V35_HARNESS_START_KEY)
    ]);
    if (saved?.version === 1) {
      this.v35Stats = { ...defaultV35Stats(), ...(saved.stats || {}) };
      this.v35MigrationVersion = Number(saved.migrationVersion || 0);
      for (const row of saved.presenceLocks || []) {
        if (row?.name && Number(row.until || 0) > Date.now()) this.v35PresenceLocks.set(row.name, row);
      }
    }
    let started = Number(harness || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V35_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v35Loaded = true;
  }

  persistV35State(force = false) {
    if (!this.v35Loaded) return;
    const now = Date.now();
    if (!force && now - this.v35LastPersistAt < PERSIST_MS) return;
    this.v35LastPersistAt = now;
    const payload = {
      version: 1,
      migrationVersion: this.v35MigrationVersion,
      stats: { ...this.v35Stats },
      presenceLocks: [...this.v35PresenceLocks.values()].filter((r) => Number(r.until || 0) > now),
      updatedAt: now
    };
    const p = this.ctx.storage.put(V35_STATE_KEY, payload);
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(p); else p.catch(() => {});
  }

  bumpV35(key, n = 1) {
    this.v35Stats[key] = Number(this.v35Stats[key] || 0) + n;
    this.v35BootStats[key] = Number(this.v35BootStats[key] || 0) + n;
    this.persistV35State(false);
  }

  recentContextText(max = 10) {
    return (this.history || []).slice(-max).map((r) => r?.text || "").join(" ");
  }

  lineViolation(text, now = Date.now(), context = this.recentContextText(), speaker = "") {
    const profile = typeof speaker === "string" ? (getCharacter(speaker) || {}) : (speaker || {});
    return publicWorldViolation(text, this.culture, now, context, profile);
  }

  noteViolation(v, stage, speaker = "") {
    if (!v) return;
    this.bumpV35(stage === "parse" ? "generatedLinesBlocked" : stage === "queue" ? "queuedLinesBlocked" : "surfaceLinesBlocked");
    if (v.kind === "future-public-claim") this.bumpV35("futureClaimsBlocked");
    else if (v.kind === "unsupported-public-detail") this.bumpV35("unsupportedPublicDetailsBlocked");
    else if (v.kind === "unsupported-relative-schedule") this.bumpV35("relativeScheduleClaimsBlocked");
    else this.bumpV35("unsupportedPublicClaimsBlocked");
    this.broadcast?.({ type: "v35_guard", action: "blocked", stage, speaker, kind: v.kind, reason: v.reason || "", title: v.title || "", notBefore: v.notBefore || "", text: v.text || "", at: Date.now() });
  }

  filterGeneratedRows(rows, stage = "parse") {
    const out = [];
    let context = this.recentContextText(10);
    for (const item of rows || []) {
      if (!item?.speaker || !item?.text) continue;
      if (item.target && item.target !== "room" && item.target === item.speaker) {
        this.bumpV35("selfTargetsBlocked");
        continue;
      }
      const v = this.lineViolation(item.text, Date.now(), context, item.speaker);
      context += ` ${item.text}`;
      if (v) { this.noteViolation(v, stage, item.speaker); continue; }
      out.push(item);
    }
    return out;
  }

  parseGroqMessages(content, max = 10, defaultTarget = "room") {
    return this.filterGeneratedRows(super.parseGroqMessages(content, max, defaultTarget), "parse").slice(0, max);
  }

  validateBrainMoves(rawMoves, activeNames) {
    const out = [];
    let context = this.recentContextText(10);
    for (const move of super.validateBrainMoves(rawMoves, activeNames)) {
      if (move.target && move.target !== "room" && move.target === move.speaker) {
        this.bumpV35("selfTargetsBlocked");
        continue;
      }
      const v = this.lineViolation(move.meaning, Date.now(), context, move.speaker);
      context += ` ${move.meaning}`;
      if (v) { this.noteViolation(v, "parse", move.speaker); continue; }
      out.push(move);
    }
    return out;
  }

  queueAiLines(lines, reason = "scene") {
    return super.queueAiLines(this.filterGeneratedRows(lines, "queue"), reason);
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    return super.queueScenePlan(this.filterGeneratedRows(lines, "queue"), reason, trigger, front);
  }

  sanitizeUnplannedQueue() {
    if (!this.aiQueue?.length) return 0;
    const kept = [];
    let context = this.recentContextText(10);
    for (const item of this.aiQueue) {
      if (item?._scenePlanId || item?.source === "built-in") { kept.push(item); context += ` ${item?.text || ""}`; continue; }
      if (item?.target && item.target !== "room" && item.target === item.speaker) { this.bumpV35("selfTargetsBlocked"); continue; }
      const v = this.lineViolation(item?.text || "", Date.now(), context, item?.speaker || "");
      context += ` ${item?.text || ""}`;
      if (v) { this.noteViolation(v, "queue", item?.speaker || ""); continue; }
      kept.push(item);
    }
    const removed = this.aiQueue.length - kept.length;
    this.aiQueue = kept;
    if (removed) this.bumpV35("queueSanitizations", removed);
    return removed;
  }

  async handlePendingHumanWithAi(now = Date.now()) {
    if (!this.pendingHumans?.length) return super.handlePendingHumanWithAi(now);
    const human = this.pendingHumans[0];
    const undecided = human?.__authRespond === undefined;
    const ignored = this.maybeIgnorePendingHuman(now);
    if (undecided) {
      this.bumpV35("engagementFastPathChecks");
      this.bumpV35(ignored ? "engagementFastPathIgnored" : "engagementFastPathPassed");
    }
    if (ignored) return "ignored";
    return super.handlePendingHumanWithAi(now);
  }

  lockDirectConversation(bot, human, now = Date.now(), reason = "direct-exchange") {
    if (!bot || !getCharacter(bot) || !this.activeBotNames?.includes(bot)) return;
    const old = this.v35PresenceLocks.get(bot);
    this.v35PresenceLocks.set(bot, { name: bot, human: compact(human, 24), until: Math.max(now + DIRECT_PRESENCE_LOCK_MS, Number(old?.until || 0)), lastAt: now, reason });
    this.bumpV35(old ? "directPresenceLocksExtended" : "directPresenceLocksCreated");
  }

  cleanupPresenceLocks(now = Date.now()) {
    let changed = false;
    for (const [name, row] of this.v35PresenceLocks) {
      if (now >= Number(row.until || 0) || !this.activeBotNames?.includes(name)) { this.v35PresenceLocks.delete(name); changed = true; }
    }
    if (changed) this.persistV35State(false);
  }

  presenceLocked(name, now = Date.now()) {
    const row = this.v35PresenceLocks.get(name);
    return Boolean(row && now < Number(row.until || 0));
  }

  pushMessage(message) {
    const result = super.pushMessage(message);
    const row = (this.history || [])[this.history.length - 1];
    if (!row) return result;
    const humans = new Set(this.humanNames?.() || []);
    if (row.kind === "human" && row.target && row.target !== "room" && getCharacter(row.target)) this.lockDirectConversation(row.target, row.from, Number(row.at || Date.now()), "human-direct");
    else if (row.kind === "bot" && humans.has(row.target) && getCharacter(row.from)) this.lockDirectConversation(row.from, row.target, Number(row.at || Date.now()), "bot-reply");
    return result;
  }

  desiredRoster(now = Date.now()) {
    this.cleanupPresenceLocks(now);
    const base = super.desiredRoster(now) || [];
    if (!base.length) return base;
    const locked = [...this.v35PresenceLocks.keys()].filter((n) => this.activeBotNames?.includes(n) && this.presenceLocked(n, now));
    const missing = locked.filter((n) => !base.includes(n));
    if (missing.length) this.bumpV35("rosterLockPreservations", missing.length);
    return [...locked, ...base.filter((n) => !locked.includes(n))].slice(0, base.length);
  }

  trimToHistoricalRoomCap() {
    const maxBots = Math.max(0, 23 - this.humanNames().length - (this.tos ? 1 : 0));
    if (this.activeBotNames.length <= maxBots) return;
    const now = Date.now();
    const rank = { lurker: 0, occasional: 1, talker: 2 };
    const ordered = [...this.activeBotNames].sort((a, b) => {
      const al = this.presenceLocked(a, now) ? 1 : 0, bl = this.presenceLocked(b, now) ? 1 : 0;
      if (al !== bl) return al - bl;
      return (rank[activityRole(a)] ?? 1) - (rank[activityRole(b)] ?? 1);
    });
    const remove = new Set(ordered.slice(0, this.activeBotNames.length - maxBots));
    for (const name of remove) if (this.presenceLocked(name, now)) this.bumpV35("forcedCapLockEvictions");
    this.activeBotNames = this.activeBotNames.filter((n) => !remove.has(n));
    this.suppressSocialExitReaction = true;
    for (const name of remove) super.system(`${name} has left the room.`);
    this.suppressSocialExitReaction = false;
    this.broadcastPresence(); this.persistSocial(true);
  }

  maybeAbruptConnectionDrop(now = Date.now()) {
    if (now < Number(this.nextConnectionDropAt || 0) || this.tos) return;
    this.nextConnectionDropAt = nextAbruptDropAt(now);
    if (!shouldAbruptDrop(this.activeBotNames.length)) return;
    const recent = new Set(recentSpeakerNames(this.history, 5));
    const candidates = this.activeBotNames.filter((n) => !recent.has(n) && !this.presenceLocked(n, now));
    const name = candidates[Math.floor(Math.random() * candidates.length)];
    if (!name) { if (this.v35PresenceLocks.size) this.bumpV35("abruptDropDeferrals"); return; }
    this.activeBotNames = this.activeBotNames.filter((n) => n !== name);
    this.targetOccupancy = Math.max(18, Math.min(23, this.targetOccupancy - 1));
    this.suppressSocialExitReaction = true; super.system(`${name} has left the room.`); this.suppressSocialExitReaction = false;
    this.broadcastPresence(); this.persistSocial(true);
  }

  async callBrainProvider(prompt, activeNames, reason) {
    this.v35StructuredBrainDepth += 1; this.v35BrainSkipNoted = false;
    try { return await super.callBrainProvider(prompt, activeNames, reason); }
    finally { this.v35StructuredBrainDepth = Math.max(0, this.v35StructuredBrainDepth - 1); this.v35BrainSkipNoted = false; }
  }

  orderedReadyProviders(now = Date.now()) {
    const providers = super.orderedReadyProviders(now);
    if (!this.v35StructuredBrainDepth) return providers;
    const filtered = providers.filter((p) => p !== "workers-ai");
    if (filtered.length !== providers.length && !this.v35BrainSkipNoted) { this.v35BrainSkipNoted = true; this.bumpV35("workersBrainSkips"); }
    return filtered;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot" && meta?.target && meta.target !== "room" && meta.target === from) { this.bumpV35("selfTargetsBlocked"); return false; }
    if (kind === "bot" && AI_SOURCES.has(String(source || ""))) {
      const v = this.lineViolation(text, Date.now(), this.recentContextText(10), from);
      if (v) { this.noteViolation(v, "surface", from); return false; }
    }
    return super.say(from, text, kind, source, meta);
  }

  async tick(forceSoon = false) {
    await this.ensureState();
    this.cleanupPresenceLocks(Date.now());
    this.sanitizeUnplannedQueue();
    const result = await super.tick(forceSoon);
    this.sanitizeUnplannedQueue();
    return result;
  }
}
