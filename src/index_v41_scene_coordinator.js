import v40Worker, { ChatRoom as V40ChatRoom } from "./index_v41_ambient_continuity_compat.js";
import { SceneOwnershipCoordinator } from "./scene_ownership_coordinator_v41.js";

const PASS = "scene-coordinator-v41-1d";

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
        phase: "1D",
        preservesV17SceneIdsAndStorageSchema: true,
        ownsSceneAssociationDecision: true,
        effectiveOpenQuestionAuthority: true,
        effectiveRecentSubjectAuthority: true,
        roomParticipantRecencyAloneCannotAssociate: true,
        legacyHumanReplanBlanketCarryRetired: true,
        detachedHumanReplanSideLinesCannotEvictAtSceneCap: true,
        ambientHumanProtectionUsesRecentMomentumParticipantsOnly: true,
        exactSceneIdAndReplyToRemainHardAnchors: true,
        ownsAmbientMomentumDecision: true,
        ownsHumanSceneProtectionDecision: true,
        ownsTurnFatigueDecision: true,
        ownsModernSceneCloseDecision: true,
        ownsFinalExistingSceneContinuationDecision: true,
        legacySceneLayersDelegateThroughAuthorityHook: true,
        v17SceneConstructionHydrationAndStorageRemainBaseOwned: true,
        noProviderRoutingChange: true,
        noGenerationSemanticChange: true,
        statusEndpoint: "/api/v41-status",
        ...(runtime ? { runtime } : {})
      }
    });
  }
};

export class ChatRoom extends V40ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.sceneCoordinator = new SceneOwnershipCoordinator(this);
  }

  sceneLifecycleAuthority() {
    return this.sceneCoordinator;
  }

  sceneForMessage(message, now = Date.now()) {
    const association = this.sceneCoordinator.associateScene(message, now);
    const scene = association?.scene || null;
    if (!scene) return null;

    const decision = this.sceneCoordinator.continuationDecision(scene, message, now);
    if (decision.allow) return scene;
    if (decision.reason === "scene-closed" && this.v37LivelyAmbientStats) {
      this.v37LivelyAmbientStats.closedSceneResurrectionBlocks += 1;
    }
    return null;
  }

  queueScenePlan(lines, reason = "background", trigger = null, front = false) {
    const queued = super.queueScenePlan(lines, reason, trigger, front);
    if (!queued || reason !== "human-replan") return queued;
    this.sceneCoordinator.stabilizeHumanReplanPlan(this.currentScenePlan, this.aiQueue || []);
    return queued;
  }

  canStartScene(message, now = Date.now()) {
    if (this.sceneCoordinator.shouldPreventSideLineSceneEviction(message, now)) {
      this.sceneCoordinator.noteSideLineSceneCapEvictionBlock();
      return false;
    }
    return super.canStartScene(message, now);
  }

  v41Snapshot(now = Date.now()) {
    return {
      pass: PASS,
      deployVersion: 41,
      phase: "1D",
      coordinator: this.sceneCoordinator.snapshot(now),
      policy: {
        v17SceneIdsAndStorageSchemaPreserved: true,
        v17LegacyFuzzyMatcherBypassedInV41Production: true,
        sceneAssociationRoutedThroughCoordinator: true,
        explicitSceneIdAndReplyToRemainHardAnchors: true,
        effectiveOpenQuestionWindowAlignedToLegacyConversationObligation: true,
        answeredStoredOpenQuestionsIgnoredForOwnership: true,
        effectiveRecentSubjectUsedWithoutMutatingStoredSceneTopic: true,
        roomParticipantRecencyAloneCannotClaimScene: true,
        legacyHumanReplanBlanketCarryRetiredAtV41Boundary: true,
        directHumanReplanRepliesAnchoredByReplyTo: true,
        detachedHumanReplanSideLinesCannotEvictExistingScenes: true,
        ambientHumanProtectionUsesRecentMomentumWindowParticipantsOnly: true,
        legacySceneLayersDelegateThroughAuthorityHook: true,
        duplicateLifecycleDecisionPolicyRetiredFromProductionPath: true,
        ambientMomentumRoutedThroughCoordinator: true,
        v26FinishFatigueRoutedThroughCoordinator: true,
        v37AmbientExhaustionRoutedThroughCoordinator: true,
        v37HumanPivotCloseRoutedThroughCoordinator: true,
        v38RoomTopicFatigueCloseRoutedThroughCoordinator: true,
        v40CarrySelectionRoutedThroughCoordinator: true,
        closedSceneContinuationRoutedThroughCoordinator: true,
        existingLayerCountersAndBroadcastActionsPreserved: true,
        v17SceneConstructionHydrationAndAgeStorageLifecycleRemainBaseOwned: true,
        noProviderRoutingChange: true,
        noAdditionalProviderCall: true,
        phase2GenerationContractStillDeferred: true
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
