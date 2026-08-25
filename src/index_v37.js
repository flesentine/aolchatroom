import baseWorker, { ChatRoom as V36ChatRoom } from "./index_v36.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";
import {
  createConversationState,
  isDirectHumanQuestion,
  observeConversationMessage,
  reconstructConversationState,
  snapshotConversationState
} from "./conversation_state.js";
import {
  buildContextPacket,
  packetContainsRequiredContext,
  structuralShadowMove
} from "./conversation_director.js";

const PASS = "conversation-director-shadow-v37";

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
          oneMoveDirectorContract: true,
          deterministicHumanObligationScaffold: true,
          contextPacketGate: true,
          failureAttributionFromShadow: true,
          legacySceneDirectorIsolated: true,
          legacyPlannerStillAuthoritative: true,
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
          failureAttributionEnabled: true
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
    this.v37Stats = {
      observedMessages: 0,
      humanMessagesObserved: 0,
      directHumanQuestionsObserved: 0,
      contextPacketsBuilt: 0,
      contextPacketGatePasses: 0,
      contextPacketGateFailures: 0,
      structuralShadowMoves: 0,
      roomHumanMovesNeedingSpeakerSelection: 0,
      semanticRepairOverrides: 0,
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
    this.v37ConversationState = reconstructConversationState(this.history || [], { maxRows: 40 });
    this.v37Loaded = true;
  }

  recordV37Shadow(row) {
    const packet = buildContextPacket({
      history: this.history || [],
      state: this.v37ConversationState,
      triggerRow: row,
      onlineBots: [...(this.activeBotNames || [])],
      maxRelevant: 10
    });
    this.v37Stats.contextPacketsBuilt += 1;

    const requirement = {
      openHumanQuestion: isDirectHumanQuestion(row)
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

    this.lastV37Shadow = {
      at: Date.now(),
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
      note: "Shadow diagnostics only. v36/legacy routing remains authoritative and this decision is never emitted."
    };
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const result = super.say(from, text, kind, source, meta);
    if (!result) return result;

    const row = (this.history || [])[this.history.length - 1];
    if (!row) return result;
    this.v37ConversationState = observeConversationMessage(this.v37ConversationState, row);
    this.v37Stats.observedMessages += 1;

    if (kind === "human") {
      this.v37Stats.humanMessagesObserved += 1;
      if (isDirectHumanQuestion(row)) this.v37Stats.directHumanQuestionsObserved += 1;
      this.recordV37Shadow(row);
    }
    return result;
  }

  v37Snapshot() {
    return {
      ok: true,
      pass: PASS,
      generatedAt: Date.now(),
      simulatedDate: simulatedDateLabel(),
      simulatedDateTime: simulatedDateTimeLabel(),
      mode: {
        shadowOnly: true,
        visibleRoutingChanges: false,
        legacyPlannerAuthoritative: true,
        legacySceneDirectorImportedByNewPath: false,
        semanticRepairOverrides: Number(this.v37Stats.semanticRepairOverrides || 0)
      },
      state: snapshotConversationState(this.v37ConversationState),
      stats: {
        ...this.v37Stats,
        failures: { ...this.v37Stats.failures }
      },
      lastShadow: this.lastV37Shadow
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
