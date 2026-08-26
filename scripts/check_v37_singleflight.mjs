import assert from "node:assert/strict";
import fs from "node:fs";
import { CoalescingTurnGate } from "../src/production_turn_gate.js";

let releaseFirst;
const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
const calls = [];
let concurrent = 0;
let maxConcurrent = 0;

const gate = new CoalescingTurnGate({
  maxReplays: 2,
  run: async (source, forceSoon) => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    calls.push({ source, forceSoon });
    try {
      if (calls.length === 1) await firstBlocked;
      return calls.length;
    } finally {
      concurrent -= 1;
    }
  }
});

const first = gate.request("tick", false);
const overlappingAlarm = gate.request("alarm", false);
const overlappingHuman = gate.request("tick", true);

await Promise.resolve();
assert.equal(calls.length, 1, "overlapping requests must not start parallel production turns");
assert.equal(gate.snapshot().coalesced, 2);
assert.equal(gate.snapshot().replayRequested, true);
assert.equal(gate.snapshot().replayForce, true, "human forceSoon must survive coalescing");

releaseFirst();
await Promise.all([first, overlappingAlarm, overlappingHuman]);

assert.equal(calls.length, 2, "many overlapping requests should collapse into one replay");
assert.deepEqual(calls[0], { source: "tick", forceSoon: false });
assert.deepEqual(calls[1], { source: "replay", forceSoon: true });
assert.equal(maxConcurrent, 1);
assert.equal(gate.snapshot().maxConcurrent, 1);
assert.equal(gate.snapshot().replays, 1);
assert.equal(gate.snapshot().active, false);

const wrapper = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
assert.ok(wrapper.includes('requestV37ProductionTurn("tick", forceSoon)'));
assert.ok(wrapper.includes('requestV37ProductionTurn("alarm", false)'));
assert.ok(wrapper.includes("deferred-production-stability"));
assert.ok(wrapper.includes("liveAiShadowPausedForProviderStability: true"));
assert.ok(wrapper.includes("productionTurnSingleFlight: true"));
assert.equal(wrapper.includes("setTimeout("), false, "single-flight must not be a timing-delay patch");

const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wrangler.includes('"main": "src/index_v37_hotfix.js"'));
assert.ok(wrangler.includes('"DEPLOY_VERSION": "37"'));

console.log("v37 production-turn single-flight regression checks passed");
