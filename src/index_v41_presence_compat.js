import coherenceWorker, { ChatRoom as V41CoherenceCompatChatRoom } from "./index_v41_coherence_compat.js";
import {
  activeHumanConnectionCount,
  cleanLogicalHumanName,
  logicalHumanNames
} from "./presence_guard_v39.js";
import { auditHistoricalDateClaims } from "./v39_capture_fixes.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await coherenceWorker.fetch(request, env);
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

export class ChatRoom extends V41CoherenceCompatChatRoom {
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

  async generateGroqBatch() {
    this.v39CaptureFixStats.legacyQuickBackgroundCallsSuppressed += 1;
    return [];
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
