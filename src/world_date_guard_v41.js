import { getCharacter } from "./characters.js";
import { auditEraHistory, hardEraViolation } from "./quality_guard_v38.js";
import { auditFutureEventHistory, futureEventViolation } from "./coherence_guard_v39.js";
import { auditHistoricalDateClaims, historicalDateMismatch } from "./v39_capture_fixes.js";
import {
  auditFutureGameProductHistory,
  auditedPublicClaimViolation,
  futureGameProductViolation,
  normalizeEraConsoleLabels
} from "./v39_public_world_gate.js";

function appendAudit(base, audit, violationKey, examplesKey) {
  return {
    ...base,
    violations: Number(base?.violations || 0) + Number(audit?.violations || 0),
    blockers: Number(base?.blockers || 0) + Number(audit?.blockers || 0),
    examples: [...(base?.examples || []), ...(audit?.examples || [])].slice(-8),
    [violationKey]: Number(audit?.violations || 0),
    [examplesKey]: audit?.examples || []
  };
}

export class WorldDateGuardAuthority {
  constructor(room) {
    this.room = room;
  }

  lineViolation(text, now = Date.now(), context = "", speaker = "", delegate) {
    const futureGame = futureGameProductViolation(text, now, context);
    if (futureGame) return futureGame;

    const audited = auditedPublicClaimViolation(text, {
      culture: this.room.culture || {},
      now,
      context,
      speaker: getCharacter(speaker) || {}
    });
    if (audited) return audited;

    const relativeDate = historicalDateMismatch(text, now);
    if (relativeDate) return relativeDate;

    const futureEvent = futureEventViolation(text, now);
    if (futureEvent) return futureEvent;

    const hardEra = hardEraViolation(text, now);
    if (hardEra) return hardEra;

    return delegate();
  }

  noteViolation(violation, stage, speaker = "", delegate) {
    if (violation?.kind === "future-game-product" && this.room.v39WorldGateStats) {
      this.room.v39WorldGateStats.futureGameProductLinesBlocked += 1;
    }
    if (violation?.kind === "unsupported-audited-public-claim" && this.room.v39WorldGateStats) {
      this.room.v39WorldGateStats.auditedPublicClaimsBlocked += 1;
    }
    if (violation?.kind === "historical-date-mismatch" && this.room.v39CaptureFixStats) {
      this.room.v39CaptureFixStats.historicalDateClaimsBlocked += 1;
    }
    if (violation?.kind === "future-era-event" && this.room.v39Stats) {
      this.room.v39Stats.futureEventLinesBlocked += 1;
    }
    if (violation?.kind === "future-era-technology" && this.room.v38QualityStats) {
      this.room.v38QualityStats.eraLinesBlocked += 1;
    }
    return delegate();
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}, delegate) {
    const normalized = kind === "bot" ? normalizeEraConsoleLabels(text) : text;
    if (normalized !== text && this.room.v39WorldGateStats) {
      this.room.v39WorldGateStats.consoleLabelsNormalized += 1;
    }
    return delegate(normalized);
  }

  historicalAudit(includeAll = false, delegate) {
    const floor = includeAll ? 0 : Number(this.room.realismHarnessStartedAt || Date.now());
    let result = delegate();

    result = appendAudit(
      result,
      auditEraHistory(this.room.history || [], floor),
      "v38EraViolations",
      "v38EraExamples"
    );
    result = appendAudit(
      result,
      auditFutureEventHistory(this.room.history || [], floor),
      "v39FutureEventViolations",
      "v39FutureEventExamples"
    );
    result = appendAudit(
      result,
      auditHistoricalDateClaims(this.room.history || [], floor),
      "v39HistoricalDateViolations",
      "v39HistoricalDateExamples"
    );
    result = appendAudit(
      result,
      auditFutureGameProductHistory(this.room.history || [], floor),
      "v39FutureGameProductViolations",
      "v39FutureGameProductExamples"
    );
    return result;
  }

  snapshot() {
    return {
      authority: "v41-world-date-guard",
      lineViolationOrder: [
        "future-game-product",
        "unsupported-audited-public-claim",
        "historical-date-mismatch",
        "future-era-event",
        "future-era-technology",
        "legacy-baseline"
      ],
      consoleLabelNormalization: true,
      historicalAuditConsolidated: true,
      legacyV38V39CountersPreserved: true,
      legacyV38V39GuardOverridesBypassedInV41Production: true
    };
  }
}
