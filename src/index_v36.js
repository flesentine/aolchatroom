import baseWorker, { ChatRoom as V35ChatRoom } from "./index_v35.js";
import { getCharacter } from "./characters.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";
import { evaluateWorldClaim, worldTruthPrompt } from "./world_model.js";
import { auditWorldHistory } from "./world_audit.js";
import { moderateVoiceHabits, voicePolicyPrompt } from "./voice_policy.js";

const PASS = "world-model-consolidation-v36";
const AI_SOURCES = new Set(["gemini", "groq", "workers-ai", "ai"]);
const OLD_V35_VOICE_MARKER = "\nV35 1996 CHAT REGISTER:";

async function json(response) {
  try { return await response.json(); } catch { return { ok: false, error: "non-json response" }; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      const base = await baseWorker.fetch(request, env).then(json);
      return Response.json({
        ...base,
        ok: base?.ok !== false,
        pass: PASS,
        deployVersion: 36,
        v36: {
          authoritativeWorldModel: true,
          independentWorldAudit: true,
          publicClaimProvenance: true,
          roomChatterIsNotEvidence: true,
          genericPublicClaimTypes: ["schedule", "status", "novelty", "availability", "result", "sports-detail", "patch-detail"],
          unifiedVoicePolicy: true,
          v35CompatibilityFacade: true,
          statusEndpoint: "/api/v36-status"
        }
      });
    }
    if (url.pathname === "/api/v36-status") {
      const room = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(room);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v36-status"));
    }
    if (url.pathname === "/api/everything" || url.pathname === "/api/full-status") {
      const room = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(room);
      const [base, v36] = await Promise.all([
        baseWorker.fetch(request, env).then(json),
        env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v36-status")).then(json)
      ]);
      return Response.json({
        ...base,
        ok: base?.ok !== false,
        pass: PASS,
        deployVersion: 36,
        endpoints: { ...(base?.endpoints || {}), v36: "/api/v36-status" },
        diagnostics: { ...(base?.diagnostics || {}), architectureV36: v36 },
        v36: { worldModelConsolidated: true, independentAudit: true, unifiedVoicePolicy: true }
      });
    }
    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends V35ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v36Stats = { voiceHabitChanges: 0, worldProvenanceTagged: 0, auditReviewFindings: 0 };
  }

  recentVoiceRows(max = 18) {
    return (this.history || []).filter((row) => row?.kind === "bot").slice(-max);
  }

  applyVoicePolicy(speaker, text) {
    const character = getCharacter(speaker) || {};
    const roomRecent = this.recentVoiceRows(18);
    const ownRecent = roomRecent.filter((row) => row?.from === speaker);
    const result = moderateVoiceHabits(text, {
      speaker,
      seed: this.history?.length || 0,
      configuredHabits: character?.typing?.habits || [],
      ownRecent,
      roomRecent
    });
    if (result.changed) {
      this.v36Stats.voiceHabitChanges += result.changes.length;
      if (result.changes.some((change) => change.key === "lol")) this.bumpV35?.("lolRepetitionsSoftened");
      this.broadcast?.({ type: "v36_voice", action: "habit-softened", speaker, changes: result.changes, at: Date.now() });
    }
    return result.text;
  }

  softenRepeatedHabits(speaker, text) {
    return this.applyVoicePolicy(speaker, text);
  }

  moderateEraLaughter(speaker, text) {
    return this.applyVoicePolicy(speaker, text);
  }

  brainPrompt(active, reason, human = null) {
    let base = super.brainPrompt(active, reason, human);
    const marker = base.lastIndexOf(OLD_V35_VOICE_MARKER);
    if (marker >= 0) base = base.slice(0, marker);
    return `${base}\n\n${worldTruthPrompt(this.culture || {}, Date.now())}\n\n${voicePolicyPrompt(this.recentVoiceRows(18))}`;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const result = super.say(from, text, kind, source, meta);
    if (!result || kind !== "bot" || !AI_SOURCES.has(String(source || ""))) return result;
    const row = (this.history || [])[this.history.length - 1];
    if (!row || row.from !== from) return result;
    const speaker = getCharacter(from) || {};
    const evaluation = evaluateWorldClaim(row.text, {
      culture: this.culture || {},
      now: Number(row.at || Date.now()),
      recentContext: this.recentContextText?.(10) || "",
      speaker,
      meta: row
    });
    row.worldEpistemic = evaluation.epistemic;
    row.worldClaimType = evaluation.claim?.type || "";
    row.worldEvidence = evaluation.evidence ? {
      date: evaluation.evidence.date,
      type: evaluation.evidence.type,
      state: evaluation.evidence.state,
      source: evaluation.evidence.source
    } : null;
    this.v36Stats.worldProvenanceTagged += 1;
    return result;
  }

  worldAudit(floor = 0) {
    return auditWorldHistory(this.history || [], this.culture || {}, floor, getCharacter);
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    const floor = includeAll ? 0 : Number(this.realismHarnessStartedAt || Date.now());
    const audit = this.worldAudit(floor);
    this.v36Stats.auditReviewFindings = audit.needsReview;
    report.pass = PASS;
    report.v36Architecture = {
      authoritativeWorldModel: true,
      independentWorldAudit: audit,
      unifiedVoicePolicy: true,
      publicClaimProvenance: true
    };
    if (audit.needsReview) {
      report.regressionFlags = Array.isArray(report.regressionFlags) ? report.regressionFlags : [];
      report.regressionFlags.push(`v36 independent world-audit review findings: ${audit.needsReview}`);
    }
    return report;
  }

  v36Snapshot() {
    const audit = this.worldAudit(0);
    return {
      pass: PASS,
      simulatedDateTime: simulatedDateTimeLabel(),
      simulatedDate: simulatedDateLabel(),
      architecture: {
        authoritativeWorldModel: true,
        independentWorldAudit: true,
        publicClaimProvenance: true,
        unifiedVoicePolicy: true,
        compatibilityFacade: "v35_world_guard.js"
      },
      stats: { ...this.v36Stats },
      audit
    };
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/v36-status") return Response.json({ ok: true, ...this.v36Snapshot() });
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try { return Response.json({ ...(await response.json()), pass: PASS, v36: this.v36Snapshot() }); }
    catch { return response; }
  }

  debugState(name) {
    return { ...super.debugState(name), pass: PASS, v36: this.v36Snapshot() };
  }
}
