import v41Worker, { ChatRoom as V41RosterChatRoom } from "./index_v41_bot_roster_reentry.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import {
  evaluateHumanReplanPrimaryResponse,
  evaluatePrimaryHumanVoice
} from "./generation_contract_v41.js";

const PASS = "generation-contract-v41-2b";

function clean(value, max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sameHuman(a, b) {
  if (!a || !b) return false;
  const aId = clean(a.messageId, 80);
  const bId = clean(b.messageId, 80);
  if (aId && bId) return aId === bId;
  return clean(a.from, 32) === clean(b.from, 32) && clean(a.text, 220) === clean(b.text, 220);
}

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

async function roomV41Status(env, roomName = "town-square") {
  try {
    const id = env.CHAT_ROOMS.idFromName(roomName);
    const response = await env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v41-status"));
    return await json(response);
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomName = url.searchParams.get("room") || "town-square";

    if (url.pathname === "/api/v41-status") {
      const id = env.CHAT_ROOMS.idFromName(roomName);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v41-status"));
    }

    const response = await v41Worker.fetch(request, env);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;

    const runtime = url.pathname === "/api/everything" || url.pathname === "/api/full-status"
      ? await roomV41Status(env, roomName)
      : null;

    return Response.json({
      ...data,
      pass: PASS,
      deployVersion: 41,
      v41: {
        ...(data.v41 || {}),
        phase: "2B",
        primaryHumanVoiceGenerationContract: true,
        semanticOmissionFailsClosedToExistingHumanFallback: true,
        requiredHumanReplanResponseMustBeFirst: true,
        missingRequiredHumanReplanResponseDropsSideChatter: true,
        providerIndependentHumanFallback: true,
        invalidFallbackDoesNotRetryProviderReplan: true,
        noAdditionalProviderCall: true,
        providerRoutingUnchanged: true,
        phase1DOwnershipPreserved: true,
        humanReconnectLifecycleAuthority: true,
        legacyV39ReconnectOverridesBypassedInV41Production: true,
        ...(runtime ? { runtime } : {})
      }
    });
  }
};

export class ChatRoom extends V41RosterChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v41GenerationStats = {
      primaryVoiceContractsChecked: 0,
      primaryVoiceContractsPassed: 0,
      primaryVoiceContractsRejected: 0,
      missingPrimaryLineRejects: 0,
      routingMismatchRejects: 0,
      missingRecognizedObligationRejects: 0,
      clarificationGroundingRejects: 0,
      humanReplanPrimaryChecks: 0,
      humanReplanPrimaryPassed: 0,
      humanReplanPrimaryRejected: 0,
      humanReplanFallbacks: 0,
      humanReplanSideLinesDiscarded: 0,
      humanReplanFallbackRejects: 0,
      humanReplanFailClosedConsumes: 0
    };
    this.v41LastGenerationContract = null;
    this.v41LastHumanReplanContract = null;
    this.v41FailedClosedHuman = null;
  }

  noteGenerationContract(evaluation, plan, lines, human) {
    if (!evaluation?.enforced) return;
    this.v41GenerationStats.primaryVoiceContractsChecked += 1;
    if (evaluation.ok) this.v41GenerationStats.primaryVoiceContractsPassed += 1;
    else {
      this.v41GenerationStats.primaryVoiceContractsRejected += 1;
      if (evaluation.reason === "missing-primary-line") this.v41GenerationStats.missingPrimaryLineRejects += 1;
      else if (/^primary-(?:speaker|target)-mismatch$/.test(evaluation.reason || "")) this.v41GenerationStats.routingMismatchRejects += 1;
      else if (evaluation.reason === "clarification-ungrounded") this.v41GenerationStats.clarificationGroundingRejects += 1;
      else if (/^missing-/.test(evaluation.reason || "")) this.v41GenerationStats.missingRecognizedObligationRejects += 1;
    }

    this.v41LastGenerationContract = {
      at: Date.now(),
      ok: Boolean(evaluation.ok),
      reason: evaluation.reason || "",
      human: human ? {
        from: clean(human.from, 32),
        target: clean(human.target || "room", 32),
        text: clean(human.text, 1800),
        replyTo: clean(human.replyTo, 120),
        messageId: clean(human.messageId, 120)
      } : null,
      move: evaluation.contract?.move || null,
      requirements: [...(evaluation.contract?.requirements || [])],
      multiPart: Boolean(evaluation.contract?.multiPart),
      clarification: Boolean(evaluation.contract?.clarification),
      coverage: (evaluation.coverage || []).map((row) => ({ ...row })),
      surface: clean(lines?.[0]?.text, 180)
    };
  }

  noteHumanReplanContract(evaluation, lines, human, fallback = null) {
    if (!evaluation?.enforced) return;
    this.v41GenerationStats.humanReplanPrimaryChecks += 1;
    if (evaluation.ok) this.v41GenerationStats.humanReplanPrimaryPassed += 1;
    else {
      this.v41GenerationStats.humanReplanPrimaryRejected += 1;
      this.v41GenerationStats.humanReplanSideLinesDiscarded += Array.isArray(lines) ? lines.length : 0;
      if (fallback) this.v41GenerationStats.humanReplanFallbacks += 1;
    }
    this.v41LastHumanReplanContract = {
      at: Date.now(),
      ok: Boolean(evaluation.ok),
      reason: evaluation.reason || "",
      obligation: evaluation.obligation || null,
      human: human ? {
        from: clean(human.from, 32),
        target: clean(human.target || "room", 32),
        text: clean(human.text, 180),
        replyTo: clean(human.replyTo, 80)
      } : null,
      firstSurface: clean(lines?.[0]?.text, 180),
      discardedLines: evaluation.ok ? 0 : (Array.isArray(lines) ? lines.length : 0),
      fallback: fallback ? {
        speaker: clean(fallback.speaker, 32),
        target: clean(fallback.target || "room", 32),
        text: clean(fallback.text, 180),
        source: clean(fallback.source, 32)
      } : null
    };
  }

  async voiceBrainPlan(plan, active, human = null) {
    const voiced = await super.voiceBrainPlan(plan, active, human);
    const evaluation = evaluatePrimaryHumanVoice({
      plan,
      lines: voiced,
      human,
      history: this.history || []
    });
    this.noteGenerationContract(evaluation, plan, voiced, human);
    if (!evaluation.enforced || evaluation.ok) return voiced;

    this.broadcast?.({
      type: "generation_contract",
      action: "v41-primary-voice-rejected",
      reason: evaluation.reason,
      speaker: evaluation.contract?.move?.speaker || "",
      target: evaluation.contract?.move?.target || human?.from || "room",
      requirements: evaluation.contract?.requirements || [],
      at: Date.now()
    });

    // v37's authoritative human Director already treats [] as Voice failure and
    // routes to its established provider-independent built-in fallback.
    return [];
  }

  v41DeterministicHumanFallback(human) {
    // Do not dynamically dispatch through later provider-aware builtInHumanReply
    // overrides: v19.2 intentionally suppresses built-ins whenever a provider is
    // configured. Use the same provider-independent continuity fallback that v37
    // invokes when its authoritative Voice path fails.
    return ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
  }

  async generateHumanReplan(human) {
    this.v41FailedClosedHuman = null;
    const lines = await super.generateHumanReplan(human);
    const evaluation = evaluateHumanReplanPrimaryResponse({
      lines,
      human,
      history: this.history || []
    });
    if (!evaluation.enforced || evaluation.ok) {
      this.noteHumanReplanContract(evaluation, lines, human, null);
      return lines;
    }

    // A direct/reply-anchored human turn owns the first response slot. If the
    // inherited human-replan path produced only tail chatter (or put it first),
    // discard the whole batch before queueing and use only the established
    // provider-independent deterministic fallback.
    const builtIn = this.v41DeterministicHumanFallback(human);
    const fallback = Array.isArray(builtIn) ? builtIn.slice(0, 1) : [];
    const fallbackEvaluation = evaluateHumanReplanPrimaryResponse({
      lines: fallback,
      human,
      history: this.history || []
    });
    const acceptedFallback = fallbackEvaluation.enforced && fallbackEvaluation.ok ? fallback : [];
    if (!acceptedFallback.length) {
      this.v41GenerationStats.humanReplanFallbackRejects += 1;
      this.v41FailedClosedHuman = {
        messageId: clean(human?.messageId, 80),
        from: clean(human?.from, 32),
        text: clean(human?.text, 220)
      };
    }
    this.noteHumanReplanContract(evaluation, lines, human, acceptedFallback[0] || null);

    this.broadcast?.({
      type: "generation_contract",
      action: "v41-human-replan-primary-fail-closed",
      reason: evaluation.reason,
      expectedSpeaker: evaluation.obligation?.speaker || "",
      expectedTarget: evaluation.obligation?.target || human?.from || "",
      discardedLines: Array.isArray(lines) ? lines.length : 0,
      fallbackAccepted: Boolean(acceptedFallback.length),
      at: Date.now()
    });

    return acceptedFallback.map((line) => ({ ...line, _v41PrimaryFailClosed: true }));
  }

  async handlePendingHumanWithAi(now = Date.now()) {
    const result = await super.handlePendingHumanWithAi(now);
    const failedClosed = this.v41FailedClosedHuman;
    if (result !== "failed" || !failedClosed) return result;

    const index = (this.pendingHumans || []).findIndex((human) => sameHuman(human, failedClosed));
    this.v41FailedClosedHuman = null;
    if (index < 0) return result;

    const [consumed] = this.pendingHumans.splice(index, 1);
    this.v41GenerationStats.humanReplanFailClosedConsumes += 1;
    this.broadcast?.({
      type: "generation_contract",
      action: "v41-human-replan-failed-closed-consumed",
      human: clean(consumed?.from, 32),
      messageId: clean(consumed?.messageId, 80),
      at: Date.now()
    });
    return "failed-closed";
  }

  v41Snapshot(now = Date.now()) {
    const base = super.v41Snapshot(now);
    return {
      ...base,
      pass: PASS,
      phase: "2B",
      generationContract: {
        stats: { ...this.v41GenerationStats },
        last: this.v41LastGenerationContract,
        lastHumanReplan: this.v41LastHumanReplanContract
      },
      policy: {
        ...(base.policy || {}),
        phase2GenerationContractStillDeferred: false,
        primaryHumanVoiceSemanticContract: true,
        semanticOmissionFailsClosedToExistingHumanFallback: true,
        recognizedHardObligations: ["price", "quantity", "multipart-polarity"],
        clarificationMustRemainGrounded: true,
        pivotSemanticShiftRemainsAllowed: true,
        conservativeUnprovableParaphrasesRemainAllowed: true,
        requiredHumanReplanPrimaryResponseMustBeFirst: true,
        requiredHumanReplanResponderFromDirectTargetOrReplyAnchor: true,
        missingRequiredHumanReplanResponseDropsEntireTail: true,
        failedHumanReplanUsesProviderIndependentV14Fallback: true,
        failedHumanReplanUsesOnlyValidatedBuiltInFallback: true,
        invalidValidatedFallbackConsumesLegacyRetry: true,
        noAdditionalProviderCall: true,
        providerRoutingUnchanged: true,
        phase1DOwnershipPolicyUnchanged: true,
        legacyVoiceSuccessCountersRemainSurfaceGenerationCounters: true
      }
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/v41-status") {
      await this.ensureState();
      return Response.json(this.v41Snapshot(Date.now()));
    }
    return super.fetch(request);
  }

  debugState(name) {
    return {
      ...super.debugState(name),
      pass: PASS,
      deployVersion: 41,
      v41GenerationContract: this.v41Snapshot(Date.now())
    };
  }
}
