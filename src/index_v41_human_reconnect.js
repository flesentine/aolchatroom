import worker, { ChatRoom as V41SceneChatRoom } from "./index_v41_scene_coordinator.js";
import { ChatRoom as V37HotfixChatRoom } from "./index_v37_hotfix.js";
import { HumanReconnectLifecycleAuthority } from "./human_reconnect_lifecycle_v41.js";

export default worker;

export class ChatRoom extends V41SceneChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.humanReconnectCoordinator = new HumanReconnectLifecycleAuthority(this);
  }

  humanReconnectLifecycleAuthority() {
    return this.humanReconnectCoordinator;
  }

  replaceExistingHumanSessions(name, now = Date.now()) {
    return this.humanReconnectCoordinator.replaceExistingHumanSessions(name, now);
  }

  system(text, ...args) {
    return this.humanReconnectCoordinator.system(
      text,
      () => V37HotfixChatRoom.prototype.system.call(this, text, ...args)
    );
  }

  webSocketClose(ws, code = 1005, reason = "", wasClean = false) {
    return this.humanReconnectCoordinator.webSocketClose(
      ws,
      code,
      reason,
      wasClean,
      () => V37HotfixChatRoom.prototype.webSocketClose.call(this, ws, code, reason, wasClean)
    );
  }

  v41Snapshot(now = Date.now()) {
    const base = super.v41Snapshot(now);
    return {
      ...base,
      humanReconnectLifecycle: this.humanReconnectCoordinator.snapshot(now),
      policy: {
        ...(base.policy || {}),
        humanReconnectLifecycleAuthority: true,
        humanReconnectGraceMsPreserved: true,
        sameNameReplacementOwnedByReconnectAuthority: true,
        legacyV39ReconnectOverridesBypassedInV41Production: true,
        legacyV39ReconnectCountersAndBroadcastActionsPreserved: true
      }
    };
  }
}
