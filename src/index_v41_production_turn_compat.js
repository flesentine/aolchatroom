// Phase 3G.7 production-turn singleflight compatibility owner.
// Frozen index_v37_hotfix.js remains unchanged for the v37-v40 lineage.
// V41 owns coalescing, bounded replay, tick/alarm serialization, and turn diagnostics here.
import residualWorker, { ChatRoom as ResidualHotfixChatRoom } from "./index_v41_hotfix_residual_compat.js";
import { CoalescingTurnGate } from "./production_turn_gate.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await residualWorker.fetch(request, env);
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
        productionTurnReplayCoalescing: true
      }
    });
  }
};

export class ChatRoom extends ResidualHotfixChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
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
      const now = Date.now();
      this.queueV37DegradedFallback(now, Boolean(forceSoon));
      this.queueV37CapacitySheddingAmbient(now, Boolean(forceSoon));

      if (source === "alarm") {
        const result = await super.alarm();
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

  v37Snapshot() {
    const base = super.v37Snapshot();
    const gate = this.v37ProductionTurnGate.snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        productionTurnSingleFlight: true,
        productionTurnReplayCoalescing: true
      },
      productionTurn: {
        ...this.v37ProductionTurnStats,
        gate
      }
    };
  }
}
