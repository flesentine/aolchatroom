import worker, { ChatRoom as V41ReconnectChatRoom } from "./index_v41_human_reconnect.js";
import { ChatRoom as V37FreeProviderChatRoom } from "./index_v37_free_providers.js";
import { CoherenceRepairAuthority } from "./coherence_repair_v41.js";

export default worker;

export class ChatRoom extends V41ReconnectChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.coherenceRepairCoordinator = new CoherenceRepairAuthority(this);
  }

  coherenceRepairAuthority() {
    return this.coherenceRepairCoordinator;
  }

  resolveDirectTarget(text, sender = "") {
    return this.coherenceRepairCoordinator.resolveDirectTarget(
      text,
      sender,
      () => V37FreeProviderChatRoom.prototype.resolveDirectTarget.call(this, text, sender)
    );
  }

  async voiceBrainPlan(plan, active, human = null) {
    return this.coherenceRepairCoordinator.voiceBrainPlan(
      plan,
      active,
      human,
      (nextPlan) => V37FreeProviderChatRoom.prototype.voiceBrainPlan.call(this, nextPlan, active, human)
    );
  }

  v41Snapshot(now = Date.now()) {
    const base = super.v41Snapshot(now);
    return {
      ...base,
      coherenceRepair: this.coherenceRepairCoordinator.snapshot(),
      policy: {
        ...(base.policy || {}),
        coherenceRepairAuthority: true,
        clarificationTargetRepairOwnedByV41: true,
        humanVoiceCoherenceLockOwnedByV41: true,
        explicitErrorChallengeRepairOwnedByV41: true,
        legacyV39RepairOverridesBypassedInV41Production: true,
        legacyV39RepairCountersAndDiagnosticsPreserved: true
      }
    };
  }
}
