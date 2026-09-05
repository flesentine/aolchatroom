import assert from "node:assert/strict";
import fs from "node:fs";
import { WorldDateGuardAuthority } from "../src/world_date_guard_v41.js";

function room() {
  return {
    culture: {},
    history: [],
    realismHarnessStartedAt: 0,
    v38QualityStats: { eraLinesBlocked: 0 },
    v39Stats: { futureEventLinesBlocked: 0 },
    v39CaptureFixStats: { historicalDateClaimsBlocked: 0 },
    v39WorldGateStats: {
      futureGameProductLinesBlocked: 0,
      auditedPublicClaimsBlocked: 0,
      consoleLabelsNormalized: 0
    }
  };
}

{
  const r = room();
  const a = new WorldDateGuardAuthority(r);
  let baselineCalls = 0;
  const violation = a.lineViolation(
    "GoldenEye 007 on N64 is awesome",
    Date.parse("1996-09-05T12:00:00Z"),
    "talking about games",
    "SegaMan",
    () => { baselineCalls += 1; return null; }
  );
  assert.equal(violation?.kind, "future-game-product");
  assert.equal(baselineCalls, 0);
}

{
  const r = room();
  const a = new WorldDateGuardAuthority(r);
  let baselineCalls = 0;
  const violation = a.lineViolation(
    "PlayStation 5 is the best console",
    Date.parse("1996-09-05T12:00:00Z"),
    "",
    "SegaMan",
    () => { baselineCalls += 1; return null; }
  );
  assert.equal(violation?.kind, "future-era-technology");
  assert.equal(baselineCalls, 0);
}

{
  const r = room();
  const a = new WorldDateGuardAuthority(r);
  const kinds = [
    "future-game-product",
    "unsupported-audited-public-claim",
    "historical-date-mismatch",
    "future-era-event",
    "future-era-technology"
  ];
  for (const kind of kinds) {
    a.noteViolation({ kind }, "pre-display", "SegaMan", () => true);
  }
  assert.equal(r.v39WorldGateStats.futureGameProductLinesBlocked, 1);
  assert.equal(r.v39WorldGateStats.auditedPublicClaimsBlocked, 1);
  assert.equal(r.v39CaptureFixStats.historicalDateClaimsBlocked, 1);
  assert.equal(r.v39Stats.futureEventLinesBlocked, 1);
  assert.equal(r.v38QualityStats.eraLinesBlocked, 1);
}

{
  const r = room();
  const a = new WorldDateGuardAuthority(r);
  let surface = "";
  a.say("SegaMan", "my PS1 is hooked up", "bot", "gemini", {}, (normalized) => {
    surface = normalized;
    return normalized;
  });
  assert.equal(surface, "my PlayStation is hooked up");
  assert.equal(r.v39WorldGateStats.consoleLabelsNormalized, 1);

  a.say("Crateman", "my PS1 is hooked up", "human", "human", {}, (normalized) => {
    surface = normalized;
    return normalized;
  });
  assert.equal(surface, "my PS1 is hooked up");
  assert.equal(r.v39WorldGateStats.consoleLabelsNormalized, 1);
}

const wrapper = fs.readFileSync(new URL("../src/index_v41_world_date_guard.js", import.meta.url), "utf8");
const generationBase = fs.readFileSync(new URL("../src/index_v41_generation_contract_base.js", import.meta.url), "utf8");
const v38 = fs.readFileSync(new URL("../src/index_v38_quality_guard.js", import.meta.url), "utf8");
const v39Coherence = fs.readFileSync(new URL("../src/index_v39_coherence.js", import.meta.url), "utf8");
const v39Presence = fs.readFileSync(new URL("../src/index_v39_presence_fix.js", import.meta.url), "utf8");
const v39World = fs.readFileSync(new URL("../src/index_v39_world_gate.js", import.meta.url), "utf8");
const v40 = fs.readFileSync(new URL("../src/index_v40_scene_continuity.js", import.meta.url), "utf8");
const v41Scene = fs.readFileSync(new URL("../src/index_v41_scene_coordinator.js", import.meta.url), "utf8");
const v41Reconnect = fs.readFileSync(new URL("../src/index_v41_human_reconnect.js", import.meta.url), "utf8");
const v41Coherence = fs.readFileSync(new URL("../src/index_v41_coherence_repair.js", import.meta.url), "utf8");

function ownsMethod(source, name) {
  return source.split("\n").some((line) => line.startsWith(`  ${name}(`) || line.startsWith(`  async ${name}(`));
}

assert.ok(wrapper.includes('from "./index_v41_coherence_repair.js"'));
assert.ok(wrapper.includes('from "./index_v37_lively_ambient.js"'));
assert.ok(wrapper.includes('from "./index_v39_presence_fix.js"'));
assert.ok(wrapper.includes("V37LivelyChatRoom.prototype.lineViolation.call"));
assert.ok(wrapper.includes("V37LivelyChatRoom.prototype.noteViolation.call"));
assert.ok(wrapper.includes("V37LivelyChatRoom.prototype.historicalAudit.call"));
assert.ok(wrapper.includes("PresenceFixedChatRoom.prototype.say.call"));
assert.ok(generationBase.includes('from "./index_v41_world_date_guard.js"'));

for (const [name, source] of [
  ["v40", v40],
  ["v41 scene", v41Scene],
  ["v41 reconnect", v41Reconnect],
  ["v41 coherence", v41Coherence]
]) {
  for (const method of ["lineViolation", "noteViolation", "say", "historicalAudit"]) {
    assert.equal(ownsMethod(source, method), false, `${name} must not own ${method}() while 3D bypasses legacy world/date overrides`);
  }
}

assert.ok(v38.includes("hardEraViolation(text, now)"));
assert.ok(v39Coherence.includes("futureEventViolation(text, now)"));
assert.ok(v39Presence.includes("historicalDateMismatch(text, now)"));
assert.ok(v39World.includes("futureGameProductViolation(text, now, context)"));
assert.ok(v39World.includes("normalizeEraConsoleLabels(text)"));

console.log("v41 Phase 3D world/date guard authority checks passed");
