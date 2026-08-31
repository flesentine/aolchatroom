import v39Worker, { ChatRoom as V39ChatRoom } from "./index_v39_coherence.js";
import {
  activeHumanConnectionCount,
  attachmentIsLogicallyActive,
  cleanLogicalHumanName,
  logicalHumanNames,
  markHumanDisconnectPending,
  markHumanSuperseded
} from "./presence_guard_v39.js";

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
        pendingDisconnectSocketsExcludedFromPresence: true
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
      presenceFixStats: { ...this.v39PresenceFixStats }
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
