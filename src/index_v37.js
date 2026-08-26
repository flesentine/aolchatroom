import baseWorker, { ChatRoom as V36ChatRoom } from "./index_v36.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";
import {
  applySceneObservation,
  createConversationState,
  isDirectHumanQuestion,
  observeConversationMessage,
  reconstructConversationState,
  snapshotConversationState
} from "./conversation_state.js";
import {
  attributeDirectorFailure,
  buildContextPacket,
  directorPrompt,
  packetContainsRequiredContext,
  parseDirectorMove,
  shadowDirectorMayRun,
  structuralShadowMove
} from "./conversation_director.js";

const PASS = "conversation-director-shadow-v37";
const SHADOW_MAX_TOKENS = 360;
const SHADOW_PROVIDERS = new Set(["gemini", "groq"]);
const SHADOW_HISTORY_LIMIT = 24;
const SHADOW_PENDING_LIMIT = 12;
const SHADOW_PENDING_MAX_AGE_MS = 5 * 60 * 1000;
const SHADOW_MIN_BUFFERED_LINES = 2;
const SHADOW_MIN_INTERVAL_MS = 30000;
const SHADOW_PROVIDER_FAILURE_PAUSE_MS = 120000;

function compact(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

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
        deployVersion: 37,
        v37: {
          shadowOnly: true,
          visibleRoutingChanges: false,
          conversationStateObservationOnly: true,
          projectedShadowStateSeparate: true,
          oneMoveDirectorContract: true,
          aiShadowDirectorEnabled: true,
          deterministicHumanObligationScaffold: true,
          contextPacketGate: true,
          failureAttributionFromShadow: true,
          legacySceneDirectorIsolated: true,
          legacyPlannerStillAuthoritative: true,
          shadowProviderHealthDoesNotMutateLegacyBreakers: true,
          shadowYieldsToProduction: true,
          shadowSingleProviderAttempt: true,
          shadowMinBufferedLines: SHADOW_MIN_BUFFERED_LINES,
          shadowMinIntervalMs: SHADOW_MIN_INTERVAL_MS,
          statusEndpoint: "/api/v37-status"
        }
      });
    }

    if (url.pathname === "/api/v37-status") {
      const room = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(room);
      return env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v37-status"));
    }

    if (url.pathname === "/api/everything" || url.pathname === "/api/full-status") {
      const room = url.searchParams.get("room") || "town-square";
      const id = env.CHAT_ROOMS.idFromName(room);
      const [base, v37] = await Promise.all([
        baseWorker.fetch(request, env).then(json),
        env.CHAT_ROOMS.get(id).fetch(new Request("https://room.internal/v37-status")).then(json)
      ]);
      return Response.json({
        ...base,
        ok: base?.ok !== false,
        pass: PASS,
        deployVersion: 37,
        endpoints: { ...(base?.endpoints || {}), v37: "/api/v37-status" },
        diagnostics: { ...(base?.diagnostics || {}), conversationDirectorV37: v37 },
        v37: {
          shadowOnly: true,
          noVisibleRoutingChanges: true,
          legacyDirectorIsolated: true,
          contextPacketGate: true,
          failureAttributionEnabled: true,
          aiShadowDirectorEnabled: true,
          shadowYieldsToProduction: true,
          shadowSingleProviderAttempt: true
        }
      });
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends V36ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37Loaded = false;
    this.v37ConversationState = createConversationState();
    this.v37ProjectedState = createConversationState();
    this.v37ShadowChain = Promise.resolve();
    this.v37ShadowHistory = [];
    this.v37PendingShadows = [];
    this.v37ShadowSeq = 0;
    this.v37LastShadowCallAt = 0;
    this.v37ShadowPauseUntil = 0;
    this.v37Stats = {
      observedMessages: 0,
      humanMessagesObserved: 0,
      directHumanQuestionsObserved: 0,
      contextPacketsBuilt: 0,
      contextPacketGatePasses: 0,
      contextPacketGateFailures: 0,
      structuralShadowMoves: 0,
      roomHumanMovesNeedingSpeakerSelection: 0,
      aiShadowCalls: 0,
      aiShadowSuccesses: 0,
      aiShadowRejects: 0,
      aiShadowNoProvider: 0,
      aiShadowFailovers: 0,
      aiShadowLastLatencyMs: 0,
      aiShadowDeferred: 0,
      aiShadowProductionYieldSkips: 0,
      aiShadowExpired: 0,
      aiShadowBacklogDrops: 0,
      semanticRepairOverrides: 0,
      provider: {
        gemini: { calls: 0, successes: 0, failures: 0, rejects: 0 },
        groq: { calls: 0, successes: 0, failures: 0, rejects: 0 }
      },
      failures: {
        contextState: 0,
        director: 0,
        voice: 0,
        provider: 0,
        validator: 0
      }
    };
    this.lastV37Shadow = null;
  }

  async ensureState() {
    await super.ensureState();
    if (this.v37Loaded) return;
    const reconstructed = reconstructConversationState(this.history || [], { maxRows: 40 });
    this.v37ConversationState = reconstructed;
    this.v37ProjectedState = reconstructConversationState(this.history || [], { maxRows: 40 });
    this.v37Loaded = true;
  }

  pushShadowHistory(shadow) {
    const copy = JSON.parse(JSON.stringify(shadow));
    this.v37ShadowHistory.push(copy);
    this.v37ShadowHistory = this.v37ShadowHistory.slice(-SHADOW_HISTORY_LIMIT);
    this.lastV37Shadow = copy;
  }

  replaceShadowHistory(shadow) {
    const copy = JSON.parse(JSON.stringify(shadow));
    const index = this.v37ShadowHistory.findIndex((row) => row.id === shadow.id);
    if (index >= 0) this.v37ShadowHistory[index] = copy;
    else this.v37ShadowHistory.push(copy);
    this.v37ShadowHistory = this.v37ShadowHistory.slice(-SHADOW_HISTORY_LIMIT);
    this.lastV37Shadow = copy;
  }

  recordV37Shadow(row) {
    const packet = buildContextPacket({
      history: this.history || [],
      state: this.v37ProjectedState,
      triggerRow: row,
      onlineBots: [...(this.activeBotNames || [])],
      maxRelevant: 10
    });
    this.v37Stats.contextPacketsBuilt += 1;

    const requirement = {
      openHumanQuestion: isDirectHumanQuestion(row),
      replyToId: row?.replyTo || ""
    };
    const packetOk = packetContainsRequiredContext(packet, requirement);
    if (packetOk) this.v37Stats.contextPacketGatePasses += 1;
    else {
      this.v37Stats.contextPacketGateFailures += 1;
      this.v37Stats.failures.contextState += 1;
    }

    const move = structuralShadowMove(packet);
    if (move?.complete) this.v37Stats.structuralShadowMoves += 1;
    else if (move?.needsSpeakerSelection) this.v37Stats.roomHumanMovesNeedingSpeakerSelection += 1;

    const shadow = {
      id: `shadow-${++this.v37ShadowSeq}`,
      at: Date.now(),
      completedAt: 0,
      trigger: {
        messageId: packet.triggerMessageId || "",
        from: row?.from || "",
        target: row?.target || "room",
        text: compact(row?.text, 160)
      },
      packetGate: packetOk ? "pass" : "fail",
      packet: {
        lineCount: packet.lines?.length || 0,
        hasOpenHumanQuestion: Boolean(packet.openHumanQuestion),
        exactReplyTo: packet.exactReplyTo?.messageId || "",
        activeSubject: packet.activeScene?.subject || "",
        previousSubject: packet.previousScene?.subject || "",
        referents: (packet.recentReferents || []).map((ref) => ref.value).slice(0, 5),
        obligation: packet.obligation || null
      },
      structuralMove: move,
      ai: {
        status: packetOk ? "pending-production-yield" : "skipped-context-gate",
        provider: "",
        latencyMs: 0,
        move: null,
        error: packetOk ? "" : "context packet gate failed",
        deferReason: ""
      },
      failureCategory: packetOk ? "" : "context/state",
      note: "Shadow diagnostics only. v36/legacy routing remains authoritative and this decision is never emitted."
    };
    this.pushShadowHistory(shadow);
    return { packet, packetOk, shadow };
  }

  shadowReadyProviders(now = Date.now()) {
    const configured = new Set(this.configuredProviders?.() || []);
    return [...SHADOW_PROVIDERS].filter((provider) => {
      if (!configured.has(provider)) return false;
      const hardReady = typeof this.providerReady === "function" ? this.providerReady(provider, now) : true;
      const softReady = typeof this.softReady === "function" ? this.softReady(provider, now) : true;
      return hardReady && softReady;
    });
  }

  enqueueV37DirectorShadow(packet, shadow) {
    this.v37PendingShadows.push({ packet, shadow, queuedAt: Date.now() });
    this.v37Stats.aiShadowDeferred += 1;
    while (this.v37PendingShadows.length > SHADOW_PENDING_LIMIT) {
      const dropped = this.v37PendingShadows.shift();
      if (!dropped?.shadow) continue;
      this.v37Stats.aiShadowBacklogDrops += 1;
      dropped.shadow.ai.status = "skipped-shadow-backlog";
      dropped.shadow.ai.error = "shadow backlog exceeded safe limit";
      dropped.shadow.completedAt = Date.now();
      this.replaceShadowHistory(dropped.shadow);
    }
  }

  expireOldV37Shadows(now = Date.now()) {
    while (this.v37PendingShadows.length) {
      const first = this.v37PendingShadows[0];
      if (now - Number(first?.queuedAt || now) <= SHADOW_PENDING_MAX_AGE_MS) break;
      this.v37PendingShadows.shift();
      if (!first?.shadow) continue;
      this.v37Stats.aiShadowExpired += 1;
      first.shadow.ai.status = "skipped-shadow-stale";
      first.shadow.ai.error = "shadow decision became stale while production had priority";
      first.shadow.completedAt = now;
      this.replaceShadowHistory(first.shadow);
    }
  }

  maybeRunV37Shadow(now = Date.now()) {
    this.expireOldV37Shadows(now);
    const pending = this.v37PendingShadows[0];
    if (!pending) return;

    const providers = this.shadowReadyProviders(now);
    const gate = shadowDirectorMayRun({
      now,
      pendingHumanCount: this.pendingHumans?.length || 0,
      aiQueueLength: this.aiQueue?.length || 0,
      aiStatus: this.aiStatus || "",
      lastShadowCallAt: this.v37LastShadowCallAt,
      shadowPauseUntil: this.v37ShadowPauseUntil,
      minBufferedLines: SHADOW_MIN_BUFFERED_LINES,
      minIntervalMs: SHADOW_MIN_INTERVAL_MS,
      readyProviderCount: providers.length
    });

    if (!gate.ok) {
      if (pending.shadow?.ai?.deferReason !== gate.reason) {
        this.v37Stats.aiShadowProductionYieldSkips += 1;
        pending.shadow.ai.status = "deferred-production-priority";
        pending.shadow.ai.deferReason = gate.reason;
        this.replaceShadowHistory(pending.shadow);
      }
      return;
    }

    this.v37PendingShadows.shift();
    this.v37LastShadowCallAt = now;
    pending.shadow.ai.status = "queued-after-production";
    pending.shadow.ai.deferReason = "";
    this.replaceShadowHistory(pending.shadow);
    this.queueV37DirectorShadow(pending.packet, pending.shadow, providers[0]);
  }

  async runV37DirectorShadow(packet, shadow, preferredProvider = "") {
    if (!packet || !shadow || shadow.packetGate !== "pass") return;
    const providers = this.shadowReadyProviders(Date.now());
    const provider = preferredProvider && providers.includes(preferredProvider)
      ? preferredProvider
      : providers[0];

    if (!provider) {
      this.v37Stats.aiShadowNoProvider += 1;
      shadow.ai.status = "skipped-no-provider";
      shadow.ai.error = "no structured shadow provider ready";
      shadow.failureCategory = "provider";
      shadow.completedAt = Date.now();
      this.replaceShadowHistory(shadow);
      return;
    }

    const prompt = directorPrompt(packet);
    this.v37Stats.aiShadowCalls += 1;
    if (this.v37Stats.provider[provider]) this.v37Stats.provider[provider].calls += 1;
    const startedAt = Date.now();
    let result;
    try {
      result = await this.callProvider(provider, prompt, SHADOW_MAX_TOKENS);
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      this.v37Stats.aiShadowLastLatencyMs = latencyMs;
      this.v37Stats.failures.provider += 1;
      if (this.v37Stats.provider[provider]) this.v37Stats.provider[provider].failures += 1;
      this.v37ShadowPauseUntil = Date.now() + SHADOW_PROVIDER_FAILURE_PAUSE_MS;
      shadow.ai = {
        ...shadow.ai,
        status: "provider-failure",
        provider,
        latencyMs,
        move: null,
        error: compact(error?.message || "shadow provider connection error", 180),
        deferReason: ""
      };
      shadow.failureCategory = "provider";
      shadow.completedAt = Date.now();
      this.replaceShadowHistory(shadow);
      return;
    }

    const latencyMs = Date.now() - startedAt;
    this.v37Stats.aiShadowLastLatencyMs = latencyMs;
    if (!result?.ok) {
      this.v37Stats.failures.provider += 1;
      if (this.v37Stats.provider[provider]) this.v37Stats.provider[provider].failures += 1;
      this.v37ShadowPauseUntil = Date.now() + SHADOW_PROVIDER_FAILURE_PAUSE_MS;
      shadow.ai = {
        ...shadow.ai,
        status: "provider-failure",
        provider,
        latencyMs,
        move: null,
        error: compact(result?.error?.message || `provider status ${result?.status || 0}`, 180),
        deferReason: ""
      };
      shadow.failureCategory = "provider";
      shadow.completedAt = Date.now();
      this.replaceShadowHistory(shadow);
      return;
    }

    const parsed = parseDirectorMove(result.content, {
      onlineBots: packet.onlineBots || [],
      humans: this.humanNames?.() || [],
      obligation: packet.obligation || null
    });
    if (!parsed.ok) {
      this.v37Stats.aiShadowRejects += 1;
      this.v37Stats.failures.director += 1;
      if (this.v37Stats.provider[provider]) this.v37Stats.provider[provider].rejects += 1;
      shadow.ai = {
        ...shadow.ai,
        status: "director-reject",
        provider,
        latencyMs,
        move: null,
        error: parsed.error,
        deferReason: ""
      };
      shadow.failureCategory = "director";
      shadow.completedAt = Date.now();
      this.replaceShadowHistory(shadow);
      return;
    }

    this.v37Stats.aiShadowSuccesses += 1;
    if (this.v37Stats.provider[provider]) this.v37Stats.provider[provider].successes += 1;
    shadow.ai = {
      ...shadow.ai,
      status: "success",
      provider,
      latencyMs,
      move: parsed.move,
      error: "",
      deferReason: ""
    };
    shadow.failureCategory = "";
    shadow.completedAt = Date.now();
    this.v37ProjectedState = applySceneObservation(this.v37ProjectedState, {
      subject: parsed.move.subject,
      sceneAction: parsed.move.sceneAction,
      participants: [parsed.move.speaker, parsed.move.target],
      lastMessageId: parsed.move.replyTo || packet.triggerMessageId,
      now: shadow.completedAt
    });
    this.replaceShadowHistory(shadow);
  }

  queueV37DirectorShadow(packet, shadow, preferredProvider = "") {
    this.v37ShadowChain = this.v37ShadowChain
      .then(() => this.runV37DirectorShadow(packet, shadow, preferredProvider))
      .catch((error) => {
        this.v37Stats.failures.provider += 1;
        this.v37ShadowPauseUntil = Date.now() + SHADOW_PROVIDER_FAILURE_PAUSE_MS;
        shadow.ai.status = "shadow-runtime-error";
        shadow.ai.error = compact(error?.message || "shadow runtime error", 180);
        shadow.failureCategory = "provider";
        shadow.completedAt = Date.now();
        this.replaceShadowHistory(shadow);
      });
    if (typeof this.ctx.waitUntil === "function") this.ctx.waitUntil(this.v37ShadowChain);
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const result = super.say(from, text, kind, source, meta);
    if (!result) return result;

    const row = (this.history || [])[this.history.length - 1];
    if (!row) return result;
    this.v37ConversationState = observeConversationMessage(this.v37ConversationState, row);
    this.v37ProjectedState = observeConversationMessage(this.v37ProjectedState, row);
    this.v37Stats.observedMessages += 1;

    if (kind === "human") {
      this.v37Stats.humanMessagesObserved += 1;
      if (isDirectHumanQuestion(row)) this.v37Stats.directHumanQuestionsObserved += 1;
      const { packet, packetOk, shadow } = this.recordV37Shadow(row);
      if (packetOk) this.enqueueV37DirectorShadow(packet, shadow);
    }
    return result;
  }

  async tick(forceSoon = false) {
    const result = await super.tick(forceSoon);
    this.maybeRunV37Shadow(Date.now());
    return result;
  }

  v37Snapshot() {
    const now = Date.now();
    return {
      ok: true,
      pass: PASS,
      generatedAt: now,
      simulatedDate: simulatedDateLabel(),
      simulatedDateTime: simulatedDateTimeLabel(),
      mode: {
        shadowOnly: true,
        visibleRoutingChanges: false,
        legacyPlannerAuthoritative: true,
        legacySceneDirectorImportedByNewPath: false,
        semanticRepairOverrides: Number(this.v37Stats.semanticRepairOverrides || 0),
        shadowProviders: [...SHADOW_PROVIDERS],
        providerHealthIsolation: "shadow calls never invoke legacy provider success/failure/reject bookkeeping",
        providerTrafficIsolation: "shadow waits for production buffer, never runs during provider retry, and makes one provider attempt only",
        shadowMinBufferedLines: SHADOW_MIN_BUFFERED_LINES,
        shadowMinIntervalMs: SHADOW_MIN_INTERVAL_MS
      },
      observedState: snapshotConversationState(this.v37ConversationState),
      projectedShadowState: snapshotConversationState(this.v37ProjectedState),
      shadowScheduling: {
        pending: this.v37PendingShadows.length,
        lastShadowCallAgoMs: this.v37LastShadowCallAt ? Math.max(0, now - this.v37LastShadowCallAt) : null,
        shadowPauseRemainingMs: Math.max(0, this.v37ShadowPauseUntil - now),
        productionAiQueueLength: this.aiQueue?.length || 0,
        productionPendingHumanCount: this.pendingHumans?.length || 0,
        productionAiStatus: this.aiStatus || ""
      },
      stats: {
        ...this.v37Stats,
        provider: JSON.parse(JSON.stringify(this.v37Stats.provider)),
        failures: { ...this.v37Stats.failures }
      },
      lastShadow: this.lastV37Shadow,
      recentShadowDecisions: this.v37ShadowHistory.slice(-12)
    };
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    if (url.pathname === "/v37-status") return Response.json(this.v37Snapshot());
    return super.fetch(request);
  }

  debugState(name) {
    const base = super.debugState(name);
    return { ...base, pass: PASS, v37: this.v37Snapshot() };
  }
}
