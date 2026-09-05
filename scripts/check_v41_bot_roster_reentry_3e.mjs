import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BotRosterReentryAuthority,
  V41_BOT_REENTRY_COOLDOWN_MS
} from "../src/bot_roster_reentry_v41.js";

function fakeRoom() {
  return {
    history: [],
    activeBotNames: [],
    v39RecentBotLeaves: new Map(),
    v39Stats: { botReentryBlocks: 0 },
    broadcasts: [],
    broadcast(payload) { this.broadcasts.push(payload); }
  };
}

assert.equal(V41_BOT_REENTRY_COOLDOWN_MS, 3 * 60 * 1000);

{
  const now = Date.now();
  const r = fakeRoom();
  r.v39RecentBotLeaves.set("CoolChick17", now - 1000);
  const a = new BotRosterReentryAuthority(r);

  const filtered = a.desiredRoster(now, () => ["CoolChick17", "SegaMan"]);
  assert.deepEqual(filtered, ["SegaMan"]);

  r.activeBotNames = ["CoolChick17"];
  const activePreserved = a.desiredRoster(now, () => ["CoolChick17", "SegaMan"]);
  assert.deepEqual(activePreserved, ["CoolChick17", "SegaMan"]);
}

{
  const now = Date.now();
  const r = fakeRoom();
  r.activeBotNames = ["CoolChick17", "SegaMan"];
  const a = new BotRosterReentryAuthority(r);
  let delegated = 0;
  a.announceBotLeave("CoolChick17", now, () => {
    delegated += 1;
    r.activeBotNames = ["SegaMan"];
    return true;
  });
  assert.equal(delegated, 1);
  assert.equal(r.v39RecentBotLeaves.get("CoolChick17"), now);
  assert.ok(a.reentryRemaining("CoolChick17", now + 1) > 0);
}

{
  const now = Date.now();
  const r = fakeRoom();
  r.v39RecentBotLeaves.set("CoolChick17", now - 1000);
  const a = new BotRosterReentryAuthority(r);
  let delegated = 0;
  const blocked = a.announceBotEnter("CoolChick17", now, () => {
    delegated += 1;
    return true;
  });
  assert.equal(blocked, false);
  assert.equal(delegated, 0);
  assert.equal(r.v39Stats.botReentryBlocks, 1);
  assert.equal(r.broadcasts.length, 1);
  assert.equal(r.broadcasts[0].action, "v39-bot-reentry-blocked");

  const afterCooldown = a.announceBotEnter(
    "CoolChick17",
    now + V41_BOT_REENTRY_COOLDOWN_MS + 1,
    () => {
      delegated += 1;
      return "entered";
    }
  );
  assert.equal(afterCooldown, "entered");
  assert.equal(delegated, 1);
}

{
  const now = Date.now();
  const r = fakeRoom();
  r.history = [{ kind: "system", from: "", text: "CoolChick17 has left the room.", at: now - 5000 }];
  const a = new BotRosterReentryAuthority(r);
  assert.ok(a.reentryRemaining("CoolChick17", now) > 0);
  r.v39RecentBotLeaves.clear();
  assert.ok(a.reentryRemaining("CoolChick17", now) > 0, "retained leave history must independently preserve cooldown");
}

const wrapper = fs.readFileSync(new URL("../src/index_v41_bot_roster_reentry.js", import.meta.url), "utf8");
const generationBase = fs.readFileSync(new URL("../src/index_v41_generation_contract_base.js", import.meta.url), "utf8");
const v39Coherence = fs.readFileSync(new URL("../src/index_v39_coherence.js", import.meta.url), "utf8");
const v40 = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
const v41Scene = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
const v41Reconnect = fs.readFileSync(new URL("../src/index_v41_human_reconnect.js", import.meta.url), "utf8");
const v41Coherence = fs.readFileSync(new URL("../src/index_v41_coherence_repair.js", import.meta.url), "utf8");
const v41WorldDate = fs.readFileSync(new URL("../src/index_v41_world_date_guard.js", import.meta.url), "utf8");

function ownsMethod(source, name) {
  return source.split("\n").some((line) => line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`));
}

assert.ok(wrapper.includes('from "./index_v41_world_date_guard.js"'));
assert.ok(wrapper.includes('from "./index_v38_quality_guard.js"'));
assert.ok(wrapper.includes("V38ChatRoom.prototype.desiredRoster.call"));
assert.ok(wrapper.includes("V38ChatRoom.prototype.announceBotLeave.call"));
assert.ok(wrapper.includes("V38ChatRoom.prototype.announceBotEnter.call"));
assert.ok(generationBase.includes('from "./index_v41_bot_roster_reentry.js"'));

for (const [name, source] of [
  ["v40", v40],
  ["v41 scene", v41Scene],
  ["v41 reconnect", v41Reconnect],
  ["v41 coherence", v41Coherence],
  ["v41 world/date", v41WorldDate]
]) {
  for (const method of ["v39ReentryRemaining", "desiredRoster", "announceBotLeave", "announceBotEnter"]) {
    assert.equal(ownsMethod(source, method), false, `${name} must not own ${method}() while 3E bypasses legacy v39 roster overrides`);
  }
}

assert.ok(v39Coherence.includes("V39_BOT_REENTRY_COOLDOWN_MS"));
assert.ok(v39Coherence.includes("reentryCooldownRemaining("));
assert.ok(v39Coherence.includes("this.v39RecentBotLeaves.set(name, now)"));
assert.ok(v39Coherence.includes('action: "v39-bot-reentry-blocked"'));

console.log("v41 Phase 3E bot roster/re-entry authority checks passed");
