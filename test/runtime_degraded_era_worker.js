import { ChatRoom as ProductionChatRoom } from "../src/index_v41_generation_contract.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export class RuntimeDegradedEraRoom extends ProductionChatRoom {
  providerPoolDegraded() {
    return true;
  }

  shortestCooldownMs() {
    return 1000;
  }

  reset() {
    this.loaded = true;
    this.social = null;
    this.history = [];
    this.activeBotNames = ["MetallicaFan"];
    this.talkerNames = ["MetallicaFan"];
    this.aiQueue = [];
    this.pendingHumans = [];
    this.nextBotAt = Date.now();
    this.nextScenePlanAt = 0;
    this.sceneHydrated = true;
    this.sceneBoard?.clear?.();
  }

  contractDegradedEraFallback() {
    const now = Date.now();
    const human = {
      kind: "human",
      from: "Crateman",
      target: "MetallicaFan",
      text: "how much did the PS5 cost?",
      messageId: "m-degraded-era",
      at: now
    };
    this.reset();
    this.history = [{ ...human }];
    this.pendingHumans = [{ ...human }];

    // Seed a stale period-valid scope to prove the degraded pre-turn route does
    // not inherit it when normal generateHumanReplan() is bypassed.
    this.v41LastGenerationContract = {
      human: {
        from: "Crateman",
        target: "MetallicaFan",
        text: "how much did the Neo Geo cost?",
        replyTo: "",
        messageId: "older-human"
      },
      move: {
        subject: "Neo Geo price",
        goal: "answer how much the Neo Geo cost",
        meaning: "give the Neo Geo price"
      }
    };

    const queued = this.queueV37DegradedFallback(now, true);
    equal(queued, true, "degraded human route should queue its deterministic fallback");
    equal(this.pendingHumans.length, 0, "degraded human should be consumed after successful queueing");
    ensure(this.aiQueue.length >= 1, "degraded human fallback must enter the real AI queue");

    const line = this.aiQueue[0] || {};
    equal(line.text, "what? never heard of that", "degraded PS5 fallback must be period-safe before queueing");
    equal(line._v41EraSafeFallback, true, "queued degraded fallback should expose the v41 era-safe marker");
    ensure(Number(this.v37ProductionTurnStats?.degradedHumanFallbacksQueued || 0) >= 1, "v37 degraded fallback counter must still increment");
    equal(this.v41LastGenerationContract, null, "degraded pre-turn path must clear stale generation scope");

    return {
      queued: true,
      text: line.text,
      eraSafe: line._v41EraSafeFallback === true,
      degradedQueued: Number(this.v37ProductionTurnStats?.degradedHumanFallbacksQueued || 0)
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd", contract: "degraded-era" });
    if (url.pathname !== "/contract/degraded-era-fallback") return new Response("degraded-era contract only", { status: 404 });
    try {
      return Response.json({ ok: true, detail: this.contractDegradedEraFallback() });
    } catch (error) {
      return Response.json({ ok: false, error: String(error?.message || error), stack: String(error?.stack || "").split("\n").slice(0, 8) }, { status: 500 });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, runtime: "workerd", contract: "degraded-era" });
    if (url.pathname !== "/contract/degraded-era-fallback") return new Response("degraded-era contract only", { status: 404 });
    const id = env.DEGRADED_ERA_ROOMS.idFromName("v41-degraded-era");
    return env.DEGRADED_ERA_ROOMS.get(id).fetch(new Request("https://room.internal/contract/degraded-era-fallback"));
  }
};
