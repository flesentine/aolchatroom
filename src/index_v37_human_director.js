import freeProviderWorker, { ChatRoom as FreeProviderChatRoom } from "./index_v37_free_providers.js";
import { ChatRoom as ContinuityFallbackChatRoom } from "./index_v14.js";
import { getCharacter } from "./characters.js";
import {
  buildContextPacket,
  directorPrompt,
  parseDirectorMove,
  reconstructConversationState,
  structuralShadowMove
} from "./conversation_director.js";
import { contextualHumanMoveType, contextualStructuralMove } from "./human_move_context_v37.js";

const DIRECTOR_MAX_TOKENS = 360;

function clean(value, max = 320) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await freeProviderWorker.fetch(request, env);
    const url = new URL(request.url);
    if (!["/api/health", "/api/everything", "/api/full-status"].includes(url.pathname)) return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v37: {
        ...(data.v37 || {}),
        directHumanDirectorAuthoritative: true,
        legacyBrainGetsSecondVoteOnDirectHuman: false,
        contextualHumanFatigueObservation: true,
        pivotBreaksLegacySceneCarry: true,
        ambientStillLegacyAuthoritative: true
      }
    });
  }
};

export class ChatRoom extends FreeProviderChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37HumanDirectorStats = {
      eligibleDirectHumanTurns: 0,
      contextualPivots: 0,
      directorCalls: 0,
      directorSuccesses: 0,
      directorRejects: 0,
      directorProviderFailures: 0,
      structuralFallbacks: 0,
      voicedMoves: 0,
      voiceFallbacks: 0,
      pivotScenesClosed: 0,
      pivotSceneCarryBreaks: 0,
      legacyBrainBypasses: 0
    };
    this.v37LastHumanDirector = null;
  }

  repairedHumanTrigger(human) {
    this.repairHumanTarget?.(human, Date.now());
    const row = this.humanHistoryRow?.(human) || null;
    if (!row) return {
      kind: "human",
      from: human?.from || "",
      text: human?.text || "",
      target: human?.target || "room",
      replyTo: human?.replyTo || "",
      at: Number(human?.at || Date.now())
    };
    return {
      ...row,
      kind: "human",
      from: human?.from || row.from,
      text: human?.text || row.text,
      target: human?.target || row.target || "room",
      replyTo: human?.replyTo || row.replyTo || ""
    };
  }

  humanDirectorPacket(human) {
    const trigger = this.repairedHumanTrigger(human);
    const state = reconstructConversationState(this.history || [], { maxRows: 40, now: Date.now() });
    return buildContextPacket({
      history: this.history || [],
      state,
      triggerRow: trigger,
      onlineBots: [...(this.activeBotNames || [])],
      maxRelevant: 10,
      roomName: "Town Square",
      roomKind: "general public chat room"
    });
  }

  directHumanDirectorEligible(packet) {
    return Boolean(packet?.obligation?.locked && packet?.obligation?.speaker && packet?.obligation?.target);
  }

  async callAuthoritativeHumanDirector(packet) {
    const providers = [];
    this.v35StructuredGenerationDepth = Number(this.v35StructuredGenerationDepth || 0) + 1;
    try {
      providers.push(...(this.orderedReadyProviders?.(Date.now()) || []));
    } finally {
      this.v35StructuredGenerationDepth = Math.max(0, Number(this.v35StructuredGenerationDepth || 0) - 1);
    }

    const prompt = directorPrompt(packet, {
      extra: "This is an authoritative direct-human turn. Return exactly one move. The legacy multi-move scene planner will not get a second vote."
    });

    for (const provider of providers) {
      this.v37HumanDirectorStats.directorCalls += 1;
      const startedAt = Date.now();
      let result;
      try {
        this.v35StructuredGenerationDepth = Number(this.v35StructuredGenerationDepth || 0) + 1;
        result = await this.callProvider(provider, prompt, DIRECTOR_MAX_TOKENS);
      } catch (error) {
        this.v37HumanDirectorStats.directorProviderFailures += 1;
        this.noteProviderFailure?.(provider, 0, null, error?.message || "v37 Director connection error");
        continue;
      } finally {
        this.v35StructuredGenerationDepth = Math.max(0, Number(this.v35StructuredGenerationDepth || 0) - 1);
      }

      if (!result?.ok) {
        this.v37HumanDirectorStats.directorProviderFailures += 1;
        if (Number(result?.status || 0) === 200) this.noteOutputReject?.(provider, "v37 Director returned no readable output");
        else this.noteProviderFailure?.(provider, Number(result?.status || 0), result?.response || null, result?.error?.message || "v37 Director provider failed");
        continue;
      }

      const parsed = parseDirectorMove(result.content, {
        onlineBots: packet.onlineBots || [],
        humans: [packet.trigger?.from].filter(Boolean),
        obligation: packet.obligation || null
      });
      if (!parsed.ok) {
        this.v37HumanDirectorStats.directorRejects += 1;
        this.noteOutputReject?.(provider, `v37 Director rejected: ${parsed.error}`);
        continue;
      }

      this.noteProviderSuccess?.(provider, result.model, Date.now() - startedAt, 0);
      this.v37HumanDirectorStats.directorSuccesses += 1;
      return { move: parsed.move, provider };
    }
    return null;
  }

  activeForHumanMove(speaker) {
    const selected = [];
    const seen = new Set();
    const add = (character) => {
      if (!character?.name || seen.has(character.name)) return;
      seen.add(character.name);
      selected.push(character);
    };
    add(getCharacter(speaker));
    for (const character of this.activeCharacters?.() || []) add(character);
    return selected.slice(0, 8);
  }

  closeLegacySceneForPivot(human, move) {
    if (move?.sceneAction !== "replace") return;
    const row = this.humanHistoryRow?.(human) || null;
    const sceneId = row?.sceneId || "";
    if (!sceneId || typeof this.openScenes !== "function") return;
    const scene = (this.openScenes(Date.now()) || []).find((item) => item?.id === sceneId);
    if (!scene || scene.status === "closed") return;
    const now = Date.now();
    scene.status = "closed";
    scene.closedAt = now;
    scene.closeReason = "v37 human pivot";
    if (this.sceneStats) this.sceneStats.closed = Number(this.sceneStats.closed || 0) + 1;
    this.v37HumanDirectorStats.pivotScenesClosed += 1;
    this.broadcast?.({ type: "scene_plan", action: "v37-human-pivot-close", sceneId, turns: Number(scene.turns || 0), at: now });
  }

  async generateHumanReplan(human) {
    const packet = this.humanDirectorPacket(human);
    if (!this.directHumanDirectorEligible(packet)) return super.generateHumanReplan(human);

    this.v37HumanDirectorStats.eligibleDirectHumanTurns += 1;
    this.v37HumanDirectorStats.legacyBrainBypasses += 1;
    const contextual = contextualHumanMoveType(packet);
    let decision = null;

    // An obvious repetition-fatigue signal is an observation about the exchange,
    // so it does not need another model call to decide whether to deepen the topic.
    if (contextual.moveType === "pivot") {
      const structural = contextualStructuralMove(packet, structuralShadowMove(packet));
      if (structural?.complete) {
        decision = { move: structural, provider: "context-observation" };
        this.v37HumanDirectorStats.contextualPivots += 1;
      }
    }

    if (!decision) decision = await this.callAuthoritativeHumanDirector(packet);
    if (!decision) {
      const structural = contextualStructuralMove(packet, structuralShadowMove(packet));
      if (structural?.complete) {
        decision = { move: structural, provider: "structural-fallback" };
        this.v37HumanDirectorStats.structuralFallbacks += 1;
      }
    }

    if (!decision?.move) {
      const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
      this.v37HumanDirectorStats.voiceFallbacks += fallback.length ? 1 : 0;
      return fallback.map((item) => ({ ...item, source: "built-in", _v37DirectHuman: true }));
    }

    const move = decision.move;
    this.closeLegacySceneForPivot(human, move);
    const active = this.activeForHumanMove(move.speaker);
    const plan = {
      provider: decision.provider,
      reason: "v37-human-director",
      subject: clean(move.subject, 160),
      goal: clean(move.goal, 420),
      moves: [{
        speaker: move.speaker,
        target: move.target,
        intent: move.moveType,
        topic: "general",
        meaning: clean(move.goal, 420)
      }],
      createdAt: Date.now()
    };

    const voiced = await this.voiceBrainPlan(plan, active, human);
    if (Array.isArray(voiced) && voiced.length) {
      this.v37HumanDirectorStats.voicedMoves += 1;
      this.v37LastHumanDirector = {
        at: Date.now(),
        trigger: { from: packet.trigger?.from, target: packet.trigger?.target, text: clean(packet.trigger?.text, 180) },
        provider: decision.provider,
        move: { speaker: move.speaker, target: move.target, moveType: move.moveType, sceneAction: move.sceneAction, subject: move.subject },
        contextEvidence: move.contextEvidence || contextual.evidence || null
      };
      return voiced.slice(0, 1).map((line) => ({
        ...line,
        _v37DirectHuman: true,
        _v37SceneAction: move.sceneAction,
        _v37MoveType: move.moveType,
        _v37DirectorProvider: decision.provider,
        replyTo: move.replyTo || line.replyTo || ""
      }));
    }

    const fallback = ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human) || [];
    this.v37HumanDirectorStats.voiceFallbacks += fallback.length ? 1 : 0;
    return fallback.map((item) => ({ ...item, source: "built-in", _v37DirectHuman: true }));
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    const pivot = reason === "human-replan" && (lines || []).some((line) => line?._v37SceneAction === "replace");
    const queued = super.queueScenePlan(lines, reason, trigger, front);
    if (!pivot || !queued) return queued;

    const planId = this.currentScenePlan?.id || "";
    if (planId) {
      this.clearSceneCarryPlan?.(planId);
      for (const item of this.aiQueue || []) {
        if (item?._scenePlanId !== planId) continue;
        delete item._continuitySceneId;
      }
      this.v37HumanDirectorStats.pivotSceneCarryBreaks += 1;
    }
    return queued;
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        directHumanDirectorAuthoritative: true,
        legacyBrainGetsSecondVoteOnDirectHuman: false,
        contextualHumanFatigueObservation: true,
        pivotBreaksLegacySceneCarry: true,
        ambientStillLegacyAuthoritative: true
      },
      humanDirector: {
        ...this.v37HumanDirectorStats,
        last: this.v37LastHumanDirector
      }
    };
  }
}
