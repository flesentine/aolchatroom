import { filterSelfDialogueLines } from "./coherence_guard_v39.js";

export class V39BackgroundCompatibilityAuthority {
  constructor(room) {
    this.room = room;
    this.backgroundStats = {
      selfDialogueLinesBlocked: 0,
      backgroundPlansFiltered: 0
    };
    this.captureFixStats = {
      legacyQuickBackgroundCallsSuppressed: 0
    };
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false, delegate) {
    if (reason !== "background") return delegate(lines, reason, trigger, front);

    const filtered = filterSelfDialogueLines(lines || []);
    if (filtered.blocked.length) {
      this.backgroundStats.selfDialogueLinesBlocked += filtered.blocked.length;
      this.backgroundStats.backgroundPlansFiltered += 1;
      this.room.broadcast?.({
        type: "scene_plan",
        action: "v39-self-dialogue-lines-blocked",
        blocked: filtered.blocked.length,
        kept: filtered.kept.length,
        reasons: [...new Set(filtered.blocked.map((row) => row._v39SelfDialogueReason).filter(Boolean))],
        at: Date.now()
      });
    }
    return delegate(filtered.kept, reason, trigger, front);
  }

  suppressLegacyQuickBackground() {
    this.captureFixStats.legacyQuickBackgroundCallsSuppressed += 1;
    return [];
  }

  legacyV39Stats() {
    return { ...this.backgroundStats };
  }

  legacyCaptureFixStats() {
    return { ...this.captureFixStats };
  }

  snapshot() {
    return {
      authority: "v41-v39-background-compatibility",
      backgroundStats: this.legacyV39Stats(),
      captureFixStats: this.legacyCaptureFixStats(),
      stateOwnedByAuthority: true,
      selfDialogueFilteringBackgroundOnly: true,
      legacyQuickBackgroundDisabled: true,
      legacyV39CountersAndBroadcastPreserved: true
    };
  }
}
