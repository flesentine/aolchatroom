import v39Worker, { ChatRoom as V39ChatRoom } from "./index_v39_coherence.js";
import {
  activeHumanConnectionCount,
  attachmentIsLogicallyActive,
  cleanLogicalHumanName,
  logicalHumanNames,
  markHumanDisconnectPending,
  markHumanSuperseded
} from "./presence_guard_v39.js";
import {
  applyErrorChallengePlan,
  auditHistoricalDateClaims,
  historicalDateMismatch,
  isExplicitErrorChallenge
} from "./v39_capture_fixes.js";

const HUMAN_REPLACEMENT_WINDOW_MS = 5000;

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await v39Worker.fetch(request, env);
    const url = new URL(request.url);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v39: {
        ...(data.v39 || {}),
        logicalHumanPresenceDeduplication: true,
        newestSameNameSessionWins: true,
        pendingDisconnectSocketsExcludedFromPresence: true,
        legacyQuickBackgroundSuppressed: true,
        explicitErrorChallengeRepair: true,
        relativePublicDateValidation: true
      }
    });
  }
};

export class ChatRoom extends V39ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v39HumanReplacementAt = new Map();
    this.v39PresenceFixStats = {
      humanSessionReplacements: 0,
      duplicateEnterAnnouncementsSuppressed: 0,
      pendingCloseSocketsMarked: 0,
      supersededCloseCallbacksIgnored: 0
    };
    this.v39CaptureFixStats = {
      legacyQuickBackgroundCallsSuppressed: 0,
      explicitErrorChallengesRepaired: 0,
      historicalDateClaimsBlocked: 0
    };
  }

  humanSocketRows() {
    return (this.ctx.getWebSockets?.() || []).map((ws) => {
      let attachment = {};
      try { attachment = ws.deserializeAttachment?.() || {}; } catch {}
      return { ws, attachment };
    });
  }

  humanNames() {
    return logicalHumanNames(this.humanSocketRows().map((row) => row.attachment));
  }

  activeHumanConnectionCount(name) {
    return activeHumanConnectionCount(this.humanSocketRows().map((row) => row.attachment), name);
  }

  replaceExistingHumanSessions(name, now = Date.now()) {
    const target = cleanLogicalHumanName(name);
    const rows = this.humanSocketRows().filter((row) =>
      attachmentIsLogicallyActive(row.attachment)
      && cleanLogicalHumanName(row.attachment?.name) === target
    );
    if (!rows.length) return 0;

    this.v39HumanReplacementAt.set(target, now);
    for (const row of rows) {
      try { row.ws.serializeAttachment(markHumanSuperseded(row.attachment, now)); } catch {}
      try { row.ws.close(4001, "replaced by newer session"); } catch {}
    }
    this.v39PresenceFixStats.humanSessionReplacements += rows.length;
    return rows.length;
  }

  // v11's old qbg quick-background generator is still reachable through inherited
  // scheduler code. v37 lively ambient is authoritative now, so never allow that
  // legacy side path to make a second provider call or inject Mistral/Groq chatter.
  async generateGroqBatch() {
    this.v39CaptureFixStats.legacyQuickBackgroundCallsSuppressed += 1;
    return [];
  }

  lineViolation(text, now = Date.now(), context = this.recentContextText?.() || "", speaker = "") {
    const mismatch = historicalDateMismatch(text, now);
    if (mismatch) return mismatch;
    return super.lineViolation(text, now, context, speaker);
  }

  noteViolation(violation, stage, speaker = "") {
    if (violation?.kind === "historical-date-mismatch") this.v39CaptureFixStats.historicalDateClaimsBlocked += 1;
    return super.noteViolation(violation, stage, speaker);
  }

  async voiceBrainPlan(plan, active, human = null) {
    if (!human || !isExplicitErrorChallenge(human?.text || "")) return super.voiceBrainPlan(plan, active, human);
    const repairedPlan = applyErrorChallengePlan(plan, human);
    const voiced = await super.voiceBrainPlan(repairedPlan, active, human);
    this.v39CaptureFixStats.explicitErrorChallengesRepaired += 1;
    if (this.v39LastCoherenceLock) this.v39LastCoherenceLock.mode = "challenge";
    return voiced;
  }

  system(text, ...args) {
    const match = /^(.+?) has entered the room\.$/.exec(String(text || ""));
    if (match) {
      const name = cleanLogicalHumanName(match[1]);
      const replacedAt = Number(this.v39HumanReplacementAt.get(name) || 0);
      if (replacedAt && Date.now() - replacedAt <= HUMAN_REPLACEMENT_WINDOW_MS) {
        this.v39HumanReplacementAt.delete(name);
        this.v39PresenceFixStats.duplicateEnterAnnouncementsSuppressed += 1;
        // A reconnect that already entered the v39 grace path should still let
        // v39 clear its pending-disconnect token and count the transient reconnect.
        if (this.v39PendingHumanDisconnects?.has(name)) return super.system(text, ...args);
        return false;
      }
    }
    return super.system(text, ...args);
  }

  webSocketClose(ws, code = 1005, reason = "", wasClean = false) {
    let attachment = {};
    try { attachment = ws?.deserializeAttachment?.() || {}; } catch {}
    if (attachment?.v39Superseded) {
      this.v39PresenceFixStats.supersededCloseCallbacksIgnored += 1;
      return;
    }

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      ws.serializeAttachment(markHumanDisconnectPending(attachment, token, Date.now()));
      this.v39PresenceFixStats.pendingCloseSocketsMarked += 1;
    } catch {}

    return super.webSocketClose(ws, code, reason, wasClean);
  }

  historicalAudit(includeAll = false) {
    const base = super.historicalAudit(includeAll);
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || Date.now());
    const relativeDates = auditHistoricalDateClaims(this.history || [], floor);
    return {
      ...base,
      violations: Number(base?.violations || 0) + relativeDates.violations,
      blockers: Number(base?.blockers || 0) + relativeDates.blockers,
      examples: [...(base?.examples || []), ...(relativeDates.examples || [])].slice(-8),
      v39HistoricalDateViolations: relativeDates.violations,
      v39HistoricalDateExamples: relativeDates.examples
    };
  }

  v39Snapshot(now = Date.now()) {
    const base = super.v39Snapshot(now);
    const rows = this.humanSocketRows();
    const attachments = rows.map((row) => row.attachment);
    const logicalHumans = logicalHumanNames(attachments);
    const rawNames = attachments.map((attachment) => cleanLogicalHumanName(attachment?.name));
    const pending = attachments.filter((attachment) => attachment?.v39DisconnectPending).length;
    const superseded = attachments.filter((attachment) => attachment?.v39Superseded).length;
    return {
      ...base,
      humanPresenceIdentity: {
        logicalHumans,
        logicalHumanCount: logicalHumans.length,
        rawSocketCount: rows.length,
        duplicateSocketCount: Math.max(0, rawNames.length - new Set(rawNames).size),
        pendingCloseSocketCount: pending,
        supersededSocketCount: superseded,
        policy: "screen name is one logical room identity; pending/old same-name sockets do not increase humanCount"
      },
      presenceFixStats: { ...this.v39PresenceFixStats },
      captureFixStats: { ...this.v39CaptureFixStats },
      historicalDateAuditAllRetained: auditHistoricalDateClaims(this.history || [], 0),
      captureFixPolicy: {
        legacyQuickBackgroundDisabled: true,
        v37LivelyAmbientOnlyBackgroundModelPath: true,
        explicitErrorChallengeRepair: true,
        relativePublicDateClaimsValidated: true,
        providerOrder: ["gemini", "mistral", "groq"]
      }
    };
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const name = cleanLogicalHumanName(url.searchParams.get("name"));
      this.replaceExistingHumanSessions(name, Date.now());
    }
    return super.fetch(request);
  }
}
