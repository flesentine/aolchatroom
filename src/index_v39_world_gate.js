import presenceWorker, { ChatRoom as PresenceFixedChatRoom } from "./index_v39_presence_fix.js";
import { getCharacter } from "./characters.js";
import {
  auditFutureGameProductHistory,
  auditedPublicClaimViolation,
  futureGameProductViolation,
  normalizeEraConsoleLabels
} from "./v39_public_world_gate.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await presenceWorker.fetch(request, env);
    const url = new URL(request.url);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v39: {
        ...(data.v39 || {}),
        futureGameProductBoundary: true,
        auditedPublicClaimsBlockedPreDisplay: true,
        periodConsoleLabelNormalization: true
      }
    });
  }
};

export class ChatRoom extends PresenceFixedChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v39WorldGateStats = {
      futureGameProductLinesBlocked: 0,
      auditedPublicClaimsBlocked: 0,
      consoleLabelsNormalized: 0
    };
  }

  lineViolation(text, now = Date.now(), context = this.recentContextText?.() || "", speaker = "") {
    const futureGame = futureGameProductViolation(text, now, context);
    if (futureGame) return futureGame;

    const audited = auditedPublicClaimViolation(text, {
      culture: this.culture || {},
      now,
      context,
      speaker: getCharacter(speaker) || {}
    });
    if (audited) return audited;

    return super.lineViolation(text, now, context, speaker);
  }

  noteViolation(violation, stage, speaker = "") {
    if (violation?.kind === "future-game-product") this.v39WorldGateStats.futureGameProductLinesBlocked += 1;
    if (violation?.kind === "unsupported-audited-public-claim") this.v39WorldGateStats.auditedPublicClaimsBlocked += 1;
    return super.noteViolation(violation, stage, speaker);
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const normalized = kind === "bot" ? normalizeEraConsoleLabels(text) : text;
    if (normalized !== text) this.v39WorldGateStats.consoleLabelsNormalized += 1;
    return super.say(from, normalized, kind, source, meta);
  }

  historicalAudit(includeAll = false) {
    const base = super.historicalAudit(includeAll);
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || Date.now());
    const futureGames = auditFutureGameProductHistory(this.history || [], floor);
    return {
      ...base,
      violations: Number(base?.violations || 0) + futureGames.violations,
      blockers: Number(base?.blockers || 0) + futureGames.blockers,
      examples: [...(base?.examples || []), ...(futureGames.examples || [])].slice(-8),
      v39FutureGameProductViolations: futureGames.violations,
      v39FutureGameProductExamples: futureGames.examples
    };
  }

  v39Snapshot(now = Date.now()) {
    const base = super.v39Snapshot(now);
    return {
      ...base,
      worldGateStats: { ...this.v39WorldGateStats },
      futureGameProductAuditAllRetained: auditFutureGameProductHistory(this.history || [], 0),
      worldGatePolicy: {
        futureGameProductBoundary: true,
        goldenEyeN64NotBefore: "1997-08-25",
        tonyHawkProSkaterNotBefore: "1999-08-31",
        auditedPublicClaimsBlockedBeforeDisplay: true,
        independentAuditAndSurfaceGateShareEvidenceModel: true,
        ps1BackLabelNormalizedToPlayStation: true
      }
    };
  }
}
