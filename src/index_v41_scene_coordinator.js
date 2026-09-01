import v40Worker, { ChatRoom as V40ChatRoom } from "./index_v40_scene_continuity.js";
import { SceneCoordinator } from "./scene_coordinator_v41.js";

const PASS = "scene-coordinator-v41-1b";

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
        phase: "1B",
        preservesV17SceneIds: true,
        ownsAmbientMomentumDecision: true,
        ownsHumanSceneProtectionDecision: true,
        ownsTurnFatigueDecision: true,
        ownsModernSceneCloseDecision: true,
        ownsFinalExistingSceneContinuationDecision: true,
        legacySceneLayersDelegateThroughAuthorityHook: true,
        duplicateLifecycleDecisionPolicyRetiredFromProductionPath: true,
        legacyFallbacksRemainForStandaloneRegressionLayers: true,
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
  }

  // Phase 1B's only production hook. Lower v26/v37/v38/v40 layers ask for this
  // authority before making scene lifecycle decisions. When those layers are run
  // by themselves in legacy tests this method is absent, so their frozen fallback
  // behavior remains available without becoming a second production authority.
  sceneLifecycleAuthority() {
    return this.sceneCoordinator;
  }

  v41Snapshot(now = Date.now()) {
    return {
      pass: PASS,
      deployVersion: 41,
      phase: "1B",
      coordinator: this.sceneCoordinator.snapshot(now),
      policy: {
        v17SceneIdentityAndHydrationPreserved: true,
        legacySceneLayersDelegateThroughAuthorityHook: true,
        duplicateLifecycleDecisionPolicyRetiredFromProductionPath: true,
        legacyFallbacksRemainForStandaloneRegressionLayers: true,
        ambientMomentumRoutedThroughCoordinator: true,
        v26FinishFatigueRoutedThroughCoordinator: true,
        v37AmbientExhaustionRoutedThroughCoordinator: true,
        v37HumanPivotCloseRoutedThroughCoordinator: true,
        v38RoomTopicFatigueCloseRoutedThroughCoordinator: true,
        v40CarrySelectionRoutedThroughCoordinator: true,
        closedSceneContinuationRoutedThroughCoordinator: true,
        existingLayerCountersAndBroadcastActionsPreserved: true,
        v17AgeAndStorageLifecycleRemainBaseOwned: true,
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
