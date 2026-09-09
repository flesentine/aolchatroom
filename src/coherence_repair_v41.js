import {
  inferClarificationTarget,
  withCoherenceConstraint
} from "./coherence_guard_v39.js";
import {
  applyErrorChallengePlan,
  isExplicitErrorChallenge
} from "./v39_capture_fixes.js";

export class CoherenceRepairAuthority {
  constructor(room) {
    this.room = room;
    this.lastTargetRepair = null;
    this.lastCoherenceLock = null;
    this.repairStats = {
      clarificationTargetRepairs: 0,
      coherenceVoiceLocks: 0
    };
    this.captureFixStats = {
      explicitErrorChallengesRepaired: 0
    };
  }

  explicitBotMention(text = "") {
    const lower = String(text || "").toLowerCase();
    return (this.room.activeBotNames || []).find((name) =>
      lower.includes(String(name || "").toLowerCase())
    ) || "";
  }

  resolveDirectTarget(text, sender = "", delegate) {
    const explicit = this.explicitBotMention(text);
    const baseline = delegate();
    if (explicit) return baseline;

    const repair = inferClarificationTarget(
      this.room.history || [],
      text,
      sender,
      this.room.activeBotNames || [],
      Date.now()
    );
    if (!repair?.name) return baseline;

    if (repair.messageId && this.room.pendingHumanReplyTo instanceof Map) {
      this.room.pendingHumanReplyTo.set(sender, repair.messageId);
    }
    this.room.setFocus?.(sender, repair.name, Date.now(), "v39-clarification-repair");
    this.repairStats.clarificationTargetRepairs += 1;
    this.lastTargetRepair = {
      at: Date.now(),
      human: sender,
      text: String(text || "").slice(0, 220),
      baseline,
      repairedTarget: repair.name,
      replyTo: repair.messageId || "",
      anchor: repair.text,
      score: repair.score,
      reason: repair.reason
    };
    return repair.name;
  }

  async voiceBrainPlan(plan, active, human = null, delegate) {
    if (!human) return delegate(plan);

    const challenged = isExplicitErrorChallenge(human?.text || "");
    const repairedPlan = challenged ? applyErrorChallengePlan(plan, human) : plan;
    const enriched = withCoherenceConstraint(repairedPlan, this.room.history || [], human);

    if (enriched?.constraint?.text) {
      this.repairStats.coherenceVoiceLocks += 1;
      this.lastCoherenceLock = {
        at: Date.now(),
        human: human?.from || enriched.constraint.trigger?.from || "",
        trigger: String(enriched.constraint.trigger?.text || human?.text || "").slice(0, 220),
        anchorFrom: enriched.constraint.anchor?.from || "",
        anchorText: String(enriched.constraint.anchor?.text || "").slice(0, 220),
        mode: enriched.constraint.mode || "direct"
      };
    }

    const voiced = await delegate(enriched.plan);

    if (challenged) {
      this.captureFixStats.explicitErrorChallengesRepaired += 1;
      if (this.lastCoherenceLock) this.lastCoherenceLock.mode = "challenge";
    }
    return voiced;
  }

  legacyV39Stats() {
    return { ...this.repairStats };
  }

  legacyCaptureFixStats() {
    return { ...this.captureFixStats };
  }

  legacyLastTargetRepair() {
    return this.lastTargetRepair ? { ...this.lastTargetRepair } : null;
  }

  legacyLastCoherenceLock() {
    return this.lastCoherenceLock ? { ...this.lastCoherenceLock } : null;
  }

  snapshot() {
    return {
      authority: "v41-coherence-repair",
      clarificationTargetRepair: true,
      humanVoiceCoherenceLock: true,
      explicitErrorChallengeRepair: true,
      repairStats: this.legacyV39Stats(),
      captureFixStats: this.legacyCaptureFixStats(),
      lastTargetRepair: this.legacyLastTargetRepair(),
      lastCoherenceLock: this.legacyLastCoherenceLock(),
      stateOwnedByAuthority: true,
      legacyV39CountersPreserved: true,
      legacyV39RepairOverridesBypassedInV41Production: true
    };
  }
}
