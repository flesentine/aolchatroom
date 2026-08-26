import v37Worker, { ChatRoom as V37ChatRoom } from "./index_v37.js";
import { CoalescingTurnGate } from "./production_turn_gate.js";

const LIVE_SHADOW_PAUSE_REASON = "production-provider-singleflight-validation";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await v37Worker.fetch(request, env);
    const url = new URL(request.url);
    if (url.pathname !== "/api/health" && url.pathname !== "/api/everything" && url.pathname !== "/api/full-status") {
      return response;
    }

    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v37: {
        ...(data.v37 || {}),
        productionTurnSingleFlight: true,
        productionTurnReplayCoalescing: true,
        liveAiShadowPausedForProviderStability: true,
        liveAiShadowPauseReason: LIVE_SHADOW_PAUSE_REASON
      }
    });
  }
};

export class ChatRoom extends V37ChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v37ProductionTurnStats = {
      outerRequests: 0,
      tickRequests: 0,
      alarmRequests: 0,
      forceRequests: 0,
      baseTurnsStarted: 0,
      baseTurnsCompleted: 0,
      coalescedRequests: 0,
      replayTurns: 0,
      deferredAfterReplayCap: 0,
      maxConcurrentBaseTurns: 0,
      liveAiShadowPauses: 0
    };
    this.v37ProductionTurnGate = new CoalescingTurnGate({
      run: (source, forceSoon) => this.runV37BaseProductionTurn(source, forceSoon),
      maxReplays: 2,
      onCoalesce: () => { this.v37ProductionTurnStats.coalescedRequests += 1; },
      onReplay: () => { this.v37ProductionTurnStats.replayTurns += 1; },
      onDeferred: () => { this.v37ProductionTurnStats.deferredAfterReplayCap += 1; }
    });
  }

  async runV37BaseProductionTurn(source, forceSoon = false) {
    this.v37ProductionTurnStats.baseTurnsStarted += 1;
    try {
      if (source === "alarm") {
        const result = await super.alarm();
        // V36's alarm executes the inherited production tick directly, so give the
        // v37 observation layer the same post-turn hook ordinary ticks receive.
        this.maybeRunV37Shadow(Date.now());
        return result;
      }
      return await super.tick(Boolean(forceSoon));
    } finally {
      this.v37ProductionTurnStats.baseTurnsCompleted += 1;
      const gate = this.v37ProductionTurnGate?.snapshot?.();
      if (gate) {
        this.v37ProductionTurnStats.maxConcurrentBaseTurns = Math.max(
          this.v37ProductionTurnStats.maxConcurrentBaseTurns,
          Number(gate.maxConcurrent || 0)
        );
      }
    }
  }

  requestV37ProductionTurn(source, forceSoon = false) {
    this.v37ProductionTurnStats.outerRequests += 1;
    if (source === "alarm") this.v37ProductionTurnStats.alarmRequests += 1;
    else this.v37ProductionTurnStats.tickRequests += 1;
    if (forceSoon) this.v37ProductionTurnStats.forceRequests += 1;
    return this.v37ProductionTurnGate.request(source, Boolean(forceSoon));
  }

  async tick(forceSoon = false) {
    return this.requestV37ProductionTurn("tick", forceSoon);
  }

  async alarm() {
    return this.requestV37ProductionTurn("alarm", false);
  }

  // Context packets and deterministic structural shadow moves are still recorded,
  // but live model shadow calls are paused while we prove production provider
  // single-flight behavior. This guarantees the diagnostic layer cannot compete
  // with visible-room provider traffic during the stability acceptance run.
  enqueueV37DirectorShadow(packet, shadow) {
    void packet;
    this.v37Stats.aiShadowDeferred += 1;
    this.v37Stats.aiShadowProductionYieldSkips += 1;
    this.v37ProductionTurnStats.liveAiShadowPauses += 1;
    shadow.ai.status = "deferred-production-stability";
    shadow.ai.deferReason = LIVE_SHADOW_PAUSE_REASON;
    shadow.ai.error = "";
    this.replaceShadowHistory(shadow);
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    const gate = this.v37ProductionTurnGate.snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        productionTurnSingleFlight: true,
        productionTurnReplayCoalescing: true,
        liveAiShadowPausedForProviderStability: true,
        liveAiShadowPauseReason: LIVE_SHADOW_PAUSE_REASON
      },
      productionTurn: {
        ...this.v37ProductionTurnStats,
        gate
      }
    };
  }
}
