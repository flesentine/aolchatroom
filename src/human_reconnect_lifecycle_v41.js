import {
  attachmentIsLogicallyActive,
  cleanLogicalHumanName,
  markHumanDisconnectPending,
  markHumanSuperseded
} from "./presence_guard_v39.js";

export const V41_HUMAN_RECONNECT_GRACE_MS = 5000;
export const V41_HUMAN_REPLACEMENT_WINDOW_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attachmentOf(ws) {
  try { return ws?.deserializeAttachment?.() || {}; } catch { return {}; }
}

function token(now = Date.now()) {
  return `${now}-${Math.random().toString(36).slice(2, 9)}`;
}

export class HumanReconnectLifecycleAuthority {
  constructor(room, {
    graceMs = V41_HUMAN_RECONNECT_GRACE_MS,
    replacementWindowMs = V41_HUMAN_REPLACEMENT_WINDOW_MS,
    sleepFn = sleep
  } = {}) {
    this.room = room;
    this.graceMs = graceMs;
    this.replacementWindowMs = replacementWindowMs;
    this.sleepFn = sleepFn;
  }

  humanSocketRows() {
    if (typeof this.room.humanSocketRows === "function") return this.room.humanSocketRows();
    return (this.room.ctx?.getWebSockets?.() || []).map((ws) => ({ ws, attachment: attachmentOf(ws) }));
  }

  replaceExistingHumanSessions(name, now = Date.now()) {
    const target = cleanLogicalHumanName(name);
    const rows = this.humanSocketRows().filter((row) =>
      attachmentIsLogicallyActive(row.attachment)
      && cleanLogicalHumanName(row.attachment?.name) === target
    );
    if (!rows.length) return 0;

    this.room.v39HumanReplacementAt?.set?.(target, now);
    for (const row of rows) {
      try { row.ws.serializeAttachment(markHumanSuperseded(row.attachment, now)); } catch {}
      try { row.ws.close(4001, "replaced by newer session"); } catch {}
    }
    if (this.room.v39PresenceFixStats) {
      this.room.v39PresenceFixStats.humanSessionReplacements += rows.length;
    }
    return rows.length;
  }

  noteTransientReconnect(name, pending, now = Date.now()) {
    this.room.v39PendingHumanDisconnects?.delete?.(name);
    if (this.room.v39Stats) this.room.v39Stats.transientHumanReconnects += 1;
    this.room.broadcast?.({
      type: "connection_guard",
      action: "v39-transient-human-reconnect",
      name,
      closeCode: pending?.code,
      closeReason: pending?.reason,
      reconnectAfterMs: Math.max(0, now - Number(pending?.at || now)),
      at: now
    });
  }

  system(text, delegate) {
    const match = /^(.+?) has entered the room\.$/.exec(String(text || ""));
    if (!match) return delegate();

    const now = Date.now();
    const name = cleanLogicalHumanName(match[1]);
    const pending = this.room.v39PendingHumanDisconnects?.get?.(name) || null;
    const replacedAt = Number(this.room.v39HumanReplacementAt?.get?.(name) || 0);
    const replacedRecently = replacedAt && now - replacedAt <= this.replacementWindowMs;

    if (replacedRecently) {
      this.room.v39HumanReplacementAt.delete(name);
      if (this.room.v39PresenceFixStats) {
        this.room.v39PresenceFixStats.duplicateEnterAnnouncementsSuppressed += 1;
      }

      if (pending && now - Number(pending.at || 0) <= this.graceMs) {
        this.noteTransientReconnect(name, pending, now);
        return false;
      }

      // Preserve the legacy edge case: when an old pending token already aged
      // out, v39 presence counted the duplicate-enter suppression attempt but
      // delegated so the normal enter line could still be emitted.
      if (pending) return delegate();
      return false;
    }

    if (pending && now - Number(pending.at || 0) <= this.graceMs) {
      this.noteTransientReconnect(name, pending, now);
      return false;
    }

    return delegate();
  }

  webSocketClose(ws, code = 1005, reason = "", wasClean = false, commit) {
    const attachment = attachmentOf(ws);
    if (attachment?.v39Superseded) {
      if (this.room.v39PresenceFixStats) {
        this.room.v39PresenceFixStats.supersededCloseCallbacksIgnored += 1;
      }
      return;
    }

    const now = Date.now();
    const disconnectToken = token(now);
    try {
      ws.serializeAttachment(markHumanDisconnectPending(attachment, disconnectToken, now));
      if (this.room.v39PresenceFixStats) {
        this.room.v39PresenceFixStats.pendingCloseSocketsMarked += 1;
      }
    } catch {}

    const name = cleanLogicalHumanName(attachment?.name);
    const pending = {
      token: disconnectToken,
      at: now,
      code: Number(code || 0),
      reason: String(reason || "").slice(0, 160),
      wasClean: Boolean(wasClean)
    };
    this.room.v39PendingHumanDisconnects?.set?.(name, pending);
    if (this.room.v39Stats) this.room.v39Stats.humanDisconnectsDeferred += 1;

    const settle = async () => {
      await this.sleepFn(this.graceMs);
      const current = this.room.v39PendingHumanDisconnects?.get?.(name);
      if (!current || current.token !== disconnectToken) return;

      const stillConnected = (this.room.humanNames?.() || []).includes(name);
      this.room.v39PendingHumanDisconnects.delete(name);
      if (stillConnected) {
        if (this.room.v39Stats) this.room.v39Stats.transientHumanReconnects += 1;
        return;
      }

      if (this.room.v39Stats) this.room.v39Stats.humanDisconnectsCommitted += 1;
      return commit();
    };

    const task = settle();
    if (typeof this.room.ctx?.waitUntil === "function") this.room.ctx.waitUntil(task);
    else task.catch(() => {});
  }

  snapshot(now = Date.now()) {
    const pending = [...(this.room.v39PendingHumanDisconnects?.entries?.() || [])].map(([name, row]) => ({
      name,
      ageMs: Math.max(0, now - Number(row.at || now)),
      graceRemainingMs: Math.max(0, this.graceMs - (now - Number(row.at || now))),
      code: row.code,
      reason: row.reason,
      wasClean: row.wasClean
    }));
    return {
      authority: "v41-human-reconnect-lifecycle",
      graceMs: this.graceMs,
      replacementWindowMs: this.replacementWindowMs,
      pendingHumanDisconnects: pending,
      legacyV39CountersPreserved: true,
      finalCommittedCloseDelegatesBelowV39ReconnectOverrides: true
    };
  }
}
