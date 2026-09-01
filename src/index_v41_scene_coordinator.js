import v40Worker, { ChatRoom as V40ChatRoom } from "./index_v40_scene_continuity.js";
import { ChatRoom as HumanDirectorChatRoom } from "./index_v37_human_director.js";
import { V38_TOPIC_COOLDOWN_MS } from "./quality_guard_v38.js";
import {
  SceneCoordinator,
  V41_FATIGUE_CLOSE_TURNS,
  V41_LEGACY_TOPIC_COOLDOWN_MS
} from "./scene_coordinator_v41.js";

const PASS = "scene-coordinator-v41-1a";

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

    const response = await v40Worker.fetch(request, env);
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
      endpoints: { ...(data.endpoints || {}), v41: "/api/v41-status" },
      v41: {
        sceneCoordinator: true,
        phase: "1A",
        preservesV17SceneIds: true,
        ownsAmbientMomentumDecision: true,
        ownsHumanSceneProtectionDecision: true,
        ownsTurnFatigueDecision: true,
        ownsModernSceneCloseDecision: true,
        ownsFinalExistingSceneContinuationDecision: true,
        v17AgeAndStorageLifecycleRemainBaseOwned: true,
        noProviderRoutingChange: true,
        statusEndpoint: "/api/v41-status",
        ...(runtime ? { runtime } : {})
      }
    });
  }
};

export class ChatRoom extends V40ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.sceneCoordinator = new SceneCoordinator(this);
    this.v41DeferringLegacyFinishFatigue = false;
  }

  currentAmbientMomentum(now = Date.now()) {
    return this.sceneCoordinator.ambientMomentum(now);
  }

  fatiguedScene(now = Date.now()) {
    return this.sceneCoordinator.fatiguedScene(now);
  }

  sceneForMessage(message, now = Date.now()) {
    // Skip only the v37 lively closed-scene veto so the coordinator owns the final
    // continuation decision. HumanDirector's lookup is the immediately preceding
    // semantic scene layer and still preserves the _v37ForceNewScene pivot rule.
    const scene = HumanDirectorChatRoom.prototype.sceneForMessage.call(this, message, now);
    if (!scene) return null;
    const decision = this.sceneCoordinator.continuationDecision(scene, message, now);
    if (decision.allow) return scene;
    if (this.sceneIsClosed?.(scene)) {
      this.v37LivelyAmbientStats.closedSceneResurrectionBlocks += 1;
    }
    return null;
  }

  closeExhaustedAmbientScenes(now = Date.now()) {
    const closed = this.sceneCoordinator.closeExhaustedScenes({
      source: "v37-ambient-exhaustion",
      reason: "v37 lively ambient fatigue boundary",
      now,
      minTurns: V41_FATIGUE_CLOSE_TURNS
    });

    for (const row of closed) {
      if (row.topic && row.topic !== "general" && this.topicFatigueUntil instanceof Map) {
        const until = now + V41_LEGACY_TOPIC_COOLDOWN_MS;
        this.topicFatigueUntil.set(row.topic, Math.max(until, Number(this.topicFatigueUntil.get(row.topic) || 0)));
      }
      this.v37LivelyAmbientStats.exhaustedScenesClosedBeforePlan += 1;
      this.broadcast?.({
        type: "scene_plan",
        action: "v37-lively-fatigue-close",
        sceneId: row.sceneId,
        topic: row.topic,
        turns: row.turns,
        at: now
      });
    }
    return closed.length;
  }

  applyRoomTopicFatigue(now = Date.now()) {
    const fatigue = this.detectRoomTopicFatigue(now);
    this.pruneV38TopicCooling(now);

    for (const row of fatigue.topics || []) {
      const previous = Number(this.v38TopicCooling.get(row.topic) || 0);
      if (previous <= now) this.v38QualityStats.topicFatigueActivations += 1;
      const until = now + V38_TOPIC_COOLDOWN_MS;
      this.v38TopicCooling.set(row.topic, Math.max(until, previous));
      if (this.topicFatigueUntil instanceof Map) {
        this.topicFatigueUntil.set(row.topic, Math.max(until, Number(this.topicFatigueUntil.get(row.topic) || 0)));
      }
    }

    const cooling = this.activeV38TopicCooling(now);
    if (!cooling.length) return fatigue;

    const closed = this.sceneCoordinator.closeTopicFatigueScenes(cooling, now);
    for (const row of closed) {
      this.v38QualityStats.topicFatigueSceneCloses += 1;
      this.broadcast?.({
        type: "scene_plan",
        action: "v38-room-topic-fatigue-close",
        sceneId: row.sceneId,
        topic: row.topic,
        turns: row.turns,
        at: now
      });
    }
    return fatigue;
  }

  closeLegacySceneForPivot(human, move) {
    if (move?.sceneAction !== "replace") return;
    const row = this.humanHistoryRow?.(human) || null;
    const sceneId = row?.sceneId || "";
    const closed = this.sceneCoordinator.closeHumanPivotScene(sceneId, Date.now());
    if (!closed) return;

    this.v37HumanDirectorStats.pivotScenesClosed += 1;
    this.broadcast?.({
      type: "scene_plan",
      action: "v37-human-pivot-close",
      sceneId: closed.sceneId,
      turns: closed.turns,
      at: closed.at
    });
  }

  recentSceneHuman(sceneId, now = Date.now()) {
    // v26's finishPlan contains the oldest remaining direct scene-close loop. During
    // a coordinated background completion, make that compatibility loop observe a
    // protected scene so the SceneCoordinator can own the identical close decision
    // and then replay v26's legacy cooldown/counter/broadcast side effects below.
    if (this.v41DeferringLegacyFinishFatigue) {
      return { kind: "human", from: "__v41_scene_coordinator__", sceneId, at: now };
    }
    return super.recentSceneHuman(sceneId, now);
  }

  finishPlan(plan, status, reason = "") {
    const coordinateLegacyFatigue = status === "completed" && plan?.reason === "background";
    if (!coordinateLegacyFatigue) return super.finishPlan(plan, status, reason);

    let result;
    this.v41DeferringLegacyFinishFatigue = true;
    try {
      result = super.finishPlan(plan, status, reason);
    } finally {
      this.v41DeferringLegacyFinishFatigue = false;
    }

    const now = Date.now();
    const closed = this.sceneCoordinator.closeExhaustedScenes({
      source: "v26-finish-plan",
      reason: "conversation fatigue",
      now,
      minTurns: V41_FATIGUE_CLOSE_TURNS
    });

    for (const row of closed) {
      const until = now + V41_LEGACY_TOPIC_COOLDOWN_MS;
      if (row.topic && row.topic !== "general" && this.topicFatigueUntil instanceof Map) {
        const oldUntil = Number(this.topicFatigueUntil.get(row.topic) || 0);
        if (until > oldUntil) {
          this.topicFatigueUntil.set(row.topic, until);
          this.v26Stats.topicCooldownsStarted += 1;
        }
      }
      this.v26Stats.fatiguedScenesClosed += 1;
      this.broadcast?.({
        type: "scene_plan",
        action: "fatigue-close",
        sceneId: row.sceneId,
        topic: row.topic,
        turns: row.turns,
        at: now
      });
    }
    return result;
  }

  v41Snapshot(now = Date.now()) {
    return {
      pass: PASS,
      deployVersion: 41,
      phase: "1A",
      coordinator: this.sceneCoordinator.snapshot(now),
      policy: {
        v17SceneIdentityAndHydrationPreserved: true,
        ambientMomentumRoutedThroughCoordinator: true,
        v26FinishFatigueRoutedThroughCoordinator: true,
        v37AmbientExhaustionRoutedThroughCoordinator: true,
        v37HumanPivotCloseRoutedThroughCoordinator: true,
        v38RoomTopicFatigueCloseRoutedThroughCoordinator: true,
        closedSceneContinuationRoutedThroughCoordinator: true,
        existingLayerCountersAndBroadcastActionsPreserved: true,
        v17AgeAndStorageLifecycleRemainBaseOwnedIn1A: true,
        noProviderRoutingChange: true,
        noAdditionalProviderCall: true
      }
    };
  }

  realismReport(includeAll = false) {
    return {
      ...super.realismReport(includeAll),
      v41SceneCoordinator: this.v41Snapshot(Date.now())
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/v41-status") {
      await this.ensureState();
      return Response.json(this.v41Snapshot(Date.now()));
    }

    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      pass: PASS,
      deployVersion: 41,
      v41SceneCoordinator: this.v41Snapshot(Date.now())
    });
  }

  debugState(name) {
    return {
      ...super.debugState(name),
      pass: PASS,
      deployVersion: 41,
      v41SceneCoordinator: this.v41Snapshot(Date.now())
    };
  }
}
