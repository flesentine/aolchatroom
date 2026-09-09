import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const captureV2 = fs.readFileSync(new URL("../public/capture-v2.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

assert.ok(
  html.indexOf('<script src="/capture-v2.js"></script>') < html.indexOf('<script type="module" src="/app.js"></script>'),
  "authoritative capture wrapper must load before app.js creates the WebSocket"
);

// O5.1: capture-v2 is the single capture owner.
for (const retired of [
  'aol96-chat-capture-v1',
  "startOrResumeCapture(",
  "recordCaptureEvent(",
  "recordCaptureMessage(",
  "scheduleCapturePersist(",
  "persistCapture(",
  "exportCapture(",
  "capturePersistDirty",
  "captureLastPersistAttemptAt"
]) {
  assert.equal(app.includes(retired), false, `app.js must not retain duplicate v1 capture code: ${retired}`);
}
assert.equal(app.includes('exportChat.addEventListener("click"'), false, "Save Chat ownership must not be duplicated in app.js");
assert.ok(app.includes('new CustomEvent("aol96:capture-diagnostic"'), "app may emit metadata but must not own capture state");
assert.ok(app.includes('action: "reconnect-scheduled"'), "reconnect scheduling diagnostics must bridge into v2");

assert.ok(captureV2.includes('const STORAGE_KEY = "aol96-chat-capture-v2";'));
assert.ok(captureV2.includes("const PERSIST_INTERVAL_MS = 5 * 1000;"));
assert.ok(captureV2.includes("let persistDirty = false;"));
assert.ok(captureV2.includes("let lastPersistAttemptAt = 0;"));
assert.ok(captureV2.includes('const DIAGNOSTIC_EVENT = "aol96:capture-diagnostic";'));
assert.ok(captureV2.includes("window.addEventListener(DIAGNOSTIC_EVENT"));
assert.ok(captureV2.includes('socketOpenCount > 0 ? "reconnected" : "open"'));
assert.ok(captureV2.includes("code: Number(event.code || 0)"));
assert.ok(captureV2.includes("reason: String(event.reason || \"\")"));
assert.ok(captureV2.includes("wasClean: Boolean(event.wasClean)"));

const scheduleStart = captureV2.indexOf("function schedulePersist()");
const scheduleEnd = captureV2.indexOf("function persist(", scheduleStart);
assert.ok(scheduleStart >= 0 && scheduleEnd > scheduleStart);
const schedule = captureV2.slice(scheduleStart, scheduleEnd);
assert.ok(schedule.includes("persistDirty = true;"));
assert.ok(schedule.includes("if (persistTimer !== null) return;"), "active persistence timer must not be reset by every event");
assert.ok(schedule.includes("PERSIST_INTERVAL_MS - sinceLastAttempt"));
assert.ok(schedule.includes("persistTimer = null;"));
assert.equal(schedule.includes("clearTimeout(persistTimer);"), false, "event scheduling must not debounce by clearing/restarting the timer");
assert.equal(schedule.includes("JSON.stringify"), false, "scheduling must not serialize capture data");

const persistStart = captureV2.indexOf("function persist(");
const persistEnd = captureV2.indexOf("function record(", persistStart);
assert.ok(persistStart >= 0 && persistEnd > persistStart);
const persist = captureV2.slice(persistStart, persistEnd);
assert.ok(persist.includes("if (!persistDirty) return false;"), "clean capture state must not be reserialized");
assert.ok(persist.includes("lastPersistAttemptAt = now();"), "failed storage writes must still advance retry throttle time");
assert.ok(persist.includes("localStorage.setItem(STORAGE_KEY, JSON.stringify(capture))"));
assert.ok(persist.includes("persistDirty = false;"));
assert.ok(persist.includes("return false;"));

assert.equal(captureV2.includes("setTimeout(() => persist(), 1000)"), false, "legacy v2 1-second debounce must be retired");
assert.equal(captureV2.includes("clearTimeout(persistTimer);\n    persistTimer = setTimeout"), false, "legacy reset-on-every-event debounce must be retired");

for (const marker of [
  'document.addEventListener("visibilitychange"',
  'document.visibilityState === "hidden"',
  'window.addEventListener("pagehide"',
  'window.addEventListener("beforeunload"',
  "persist(true);"
]) {
  assert.ok(captureV2.includes(marker), `authoritative lifecycle flush marker must remain: ${marker}`);
}

assert.ok(captureV2.includes('event.stopImmediatePropagation();'), "capture-v2 must remain the sole Save Chat click owner");
assert.ok(captureV2.includes("exportCaptureV2();"));
assert.ok(captureV2.includes("events: capture.events"), "export must retain the complete authoritative in-memory event stream");
assert.ok(captureV2.includes("recordLocalHuman(parsedData.text)"), "outgoing local human messages must still be captured");
assert.ok(captureV2.includes("processIncoming(JSON.parse(event.data))"), "incoming WebSocket frames must still feed capture-v2");

// Unrelated optimized client behavior stays in app.js.
assert.ok(app.includes('connection.send(debug ? "debug-refresh" : "ping")'));
assert.ok(app.includes("renderedMessageKeys.has(messageKey)"));
assert.ok(app.includes("scheduleReconnect(name, event)"));

console.log("O5.1 authoritative capture-v2 consolidation checks passed");
