import baseWorker from "./index_v34.js";
import { getCharacter } from "./characters.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";
import { publicWorldViolation, auditPublicHistory, v35Grade } from "./v35_world_guard.js";
import { V35PlumbingChatRoom, DIRECT_PRESENCE_LOCK_MS } from "./v35_plumbing.js";

const PASS = "plumbing-correctness-v35";
const MIGRATION_VERSION = 1;

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

async function json(response) {
  try { return await response.json(); } catch { return { ok: false, error: "non-json response" }; }
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
        pass: PASS,
        deployVersion: 35,
        inherits: "everything-status-v34 + surgical-realism-v33 + natural-typing-v32 + emergent-life-v31",
        v35: {
          engagementGateOnAiFastPath: true,
          directConversationPresenceLockMs: DIRECT_PRESENCE_LOCK_MS,
          selfTargetHardBlock: true,
          parseQueueSurfacePublicValidation: true,
          fallbackQueueValidation: true,
          historicalAuditAffectsScore: true,
          legacyEmergentAndBotMemoryCleanup: true,
          workersAiExcludedFromStructuredBrain: true,
          persistedLifetimeAndBootCounters: true,
          v31CreativityPreserved: true,
          v32TypingPreserved: true,
          statusEndpoint: "/api/v35-status",
          comprehensiveEndpoint: "/api/everything"
        },
        aiProviders: { groq: Boolean(env.GROQ_API_KEY), gemini: Boolean(env.GEMINI_API_KEY), workersAI: Boolean(env.AI) }
      });
    }

    if (url.pathname === "/api/v35-status") {
      const room = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(room);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v35-status"));
    }

    if (url.pathname === "/api/everything" || url.pathname === "/api/full-status") {
      const room = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(room);
      const [base, v35] = await Promise.all([
        baseWorker.fetch(request, env).then(json),
        env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v35-status")).then(json)
      ]);
      return Response.json({
        ...base,
        ok: base?.ok !== false,
        pass: PASS,
        deployVersion: 35,
        endpoints: { ...(base?.endpoints || {}), v35: "/api/v35-status" },
        diagnostics: { ...(base?.diagnostics || {}), correctnessV35: v35 },
        v35: { plumbingAndCorrectness: true, v34ComprehensiveRuntimePreserved: true }
      });
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends V35PlumbingChatRoom {
  async ensureState() {
    await super.ensureState();
    if (this.v35MigrationVersion >= MIGRATION_VERSION) return;
    this.sanitizeLegacyMemory(Date.now());
    this.v35MigrationVersion = MIGRATION_VERSION;
    this.persistV35State(true);
  }

  sanitizeLegacyMemory(now = Date.now()) {
    let emergentPurged = 0;
    for (const [name, facts] of Object.entries(this.emergentLife31?.byBot || {})) {
      const kept = (facts || []).filter((fact) => {
        const at = Number(fact?.createdAt || fact?.lastMentionedAt || now);
        if (!publicWorldViolation(fact?.text || "", this.culture, at, "")) return true;
        emergentPurged += 1; return false;
      });
      this.emergentLife31.byBot[name] = kept;
    }
    if (emergentPurged) {
      this.v35Stats.emergentFactsPurged = Number(this.v35Stats.emergentFactsPurged || 0) + emergentPurged;
      this.v35BootStats.emergentFactsPurged = Number(this.v35BootStats.emergentFactsPurged || 0) + emergentPurged;
      this.persistEmergentLife?.(true);
    }

    let episodicPurged = 0;
    for (const [bot, episodes] of Object.entries(this.memory23?.byBot || {})) {
      const kept = (episodes || []).filter((episode) => {
        const text = String(episode?.text || "");
        const generatedByBot = /^I said to\b/i.test(text) || Boolean(getCharacter(episode?.about));
        if (!generatedByBot) return true;
        const at = Number(episode?.at || now);
        const sourceIndex = episode?.sourceMessageId ? (this.history || []).findIndex((r) => r?.messageId === episode.sourceMessageId) : -1;
        const context = sourceIndex >= 0 ? (this.history || []).slice(Math.max(0, sourceIndex - 8), sourceIndex).map((r) => r?.text || "").join(" ") : "";
        const sourceText = sourceIndex >= 0 ? String(this.history[sourceIndex]?.text || text) : text;
        if (!publicWorldViolation(sourceText, this.culture, at, context)) return true;
        episodicPurged += 1; return false;
      });
      this.memory23.byBot[bot] = kept;
    }
    if (episodicPurged) {
      this.v35Stats.episodicMemoriesPurged = Number(this.v35Stats.episodicMemoriesPurged || 0) + episodicPurged;
      this.v35BootStats.episodicMemoriesPurged = Number(this.v35BootStats.episodicMemoriesPurged || 0) + episodicPurged;
      this.persistMemory23?.(true);
    }
  }

  historicalAudit(includeAll = false) {
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || Date.now());
    return auditPublicHistory(this.history || [], this.culture, floor);
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    const audit = this.historicalAudit(includeAll);
    if (Array.isArray(report.components)) {
      report.components = report.components.map((c) => c?.name === "Historical cutoff"
        ? { ...c, score: clamp(100 - audit.violations * 22), details: { ...(c.details || {}), v35PublicWorldViolations: audit.violations, v35Examples: audit.examples } }
        : c);
      const weight = report.components.reduce((s, c) => s + Number(c.weight || 0), 0);
      if (weight) {
        report.score = Math.round(clamp(report.components.reduce((s, c) => s + Number(c.score || 0) * Number(c.weight || 0), 0) / weight));
        report.grade = v35Grade(report.score);
      }
    }
    if (audit.violations) {
      report.regressionFlags = Array.isArray(report.regressionFlags) ? report.regressionFlags : [];
      const flag = `v35 public/historical world violations: ${audit.violations}`;
      if (!report.regressionFlags.includes(flag)) report.regressionFlags.push(flag);
    }
    report.pass = PASS;
    report.scope = includeAll ? "all retained messages" : "messages since v35 correctness activation";
    report.v35Correctness = {
      historicalAudit: audit,
      engagementFastPathWired: true,
      directConversationPresenceLock: true,
      selfTargetHardBlock: true,
      parseQueueSurfaceValidation: true,
      workersAiStructuredBrainDisabled: true,
      migrationVersion: this.v35MigrationVersion
    };
    return report;
  }

  v35Snapshot(now = Date.now()) {
    this.cleanupPresenceLocks(now);
    return {
      pass: PASS,
      harnessStartedAt: this.realismHarnessStartedAt,
      bootStartedAt: this.v35BootStartedAt,
      migrationVersion: this.v35MigrationVersion,
      lifetime: { ...this.v35Stats },
      sinceObjectStart: { ...this.v35BootStats },
      counterScopes: { v35LifetimePersisted: true, v35SinceObjectStart: true, inheritedVersionCountersMayResetOnDurableObjectRestart: true },
      directPresenceLocks: [...this.v35PresenceLocks.values()].map((r) => ({ name: r.name, human: r.human, reason: r.reason, remainingMs: Math.max(0, Number(r.until || 0) - now) })),
      structuredBrainProviders: ["gemini", "groq"],
      workersAiStillAvailableForNonBrainFallback: true,
      historicalAuditAllRetained: this.historicalAudit(true)
    };
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/v35-status") {
      return Response.json({ ok: true, pass: PASS, simulatedDateTime: simulatedDateTimeLabel(), diagnostics: this.v35Snapshot(Date.now()) });
    }
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try { return Response.json({ ...(await response.json()), pass: PASS, v35: this.v35Snapshot(Date.now()) }); }
    catch { return response; }
  }

  debugState(name) {
    return { ...super.debugState(name), pass: PASS, v35: this.v35Snapshot(Date.now()) };
  }
}
