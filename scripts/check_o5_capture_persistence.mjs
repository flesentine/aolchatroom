import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

assert.ok(app.includes("const CAPTURE_PERSIST_INTERVAL_MS = 5 * 1000;"));
assert.ok(app.includes("let capturePersistDirty = false;"));
assert.ok(app.includes("let captureLastPersistAttemptAt = 0;"));
assert.ok(app.includes("if (capturePersistTimer !== null) return;"), "O5 must keep one scheduled persistence timer instead of resetting on every event");
assert.equal(app.includes("setTimeout(() => persistCapture(), 1200)"), false, "legacy 1.2-second debounce must be retired");
assert.equal(app.includes("clearTimeout(capturePersistTimer);\n  capturePersistTimer = setTimeout"), false, "O5 scheduler must not debounce by clearing/restarting each event");

const scheduleStart = app.indexOf("function scheduleCapturePersist()");
const scheduleEnd = app.indexOf("function persistCapture(", scheduleStart);
assert.ok(scheduleStart >= 0 && scheduleEnd > scheduleStart);
const schedule = app.slice(scheduleStart, scheduleEnd);
assert.ok(schedule.includes("capturePersistDirty = true"));
assert.ok(schedule.includes("CAPTURE_PERSIST_INTERVAL_MS - sinceLastAttempt"));
assert.ok(schedule.includes("capturePersistTimer = null;"));
assert.equal(schedule.includes("JSON.stringify"), false, "scheduling must not serialize capture data");

const persistStart = app.indexOf("function persistCapture(");
const persistEnd = app.indexOf("function exportCapture()", persistStart);
assert.ok(persistStart >= 0 && persistEnd > persistStart);
const persist = app.slice(persistStart, persistEnd);
assert.ok(persist.includes("if (!capturePersistDirty) return false;"), "clean captures must not be reserialized");
assert.ok(persist.includes("captureLastPersistAttemptAt = Date.now();"), "failed writes must still advance retry throttle time");
assert.ok(persist.includes("localStorage.setItem(CAPTURE_KEY, JSON.stringify(capture))"));
assert.ok(persist.includes("capturePersistDirty = false;"));
assert.ok(persist.includes("return false;"));

for (const marker of [
  'document.addEventListener("visibilitychange"',
  'document.visibilityState === "hidden"',
  'window.addEventListener("pagehide"',
  'persistCapture(true);',
  'window.addEventListener("beforeunload"'
]) {
  assert.ok(app.includes(marker), `O5 lifecycle flush marker must remain: ${marker}`);
}

assert.ok(app.includes("recordCaptureEvent({ type: \"connection\", action: canResume ? \"resume\" : \"sign-on\" });"));
assert.ok(app.includes("persistCapture(true);"), "forced lifecycle/export persistence must remain");
assert.ok(app.includes("events: capture.events"), "export must retain the complete in-memory event stream");

console.log("O5 capture persistence throttle checks passed");
