import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const baseRoom = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const v36 = fs.readFileSync(new URL("../src/index_v36.js", import.meta.url), "utf8");
const v39 = fs.readFileSync(new URL("../src/index_v39_coherence.js", import.meta.url), "utf8");
const v41 = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");

assert.ok(app.includes("RECONNECT_DELAYS_MS"), "client must define reconnect backoff");
assert.ok(app.includes("scheduleReconnect(name"), "client must schedule reconnects after transient socket loss");
assert.ok(app.includes("connect({ automatic: true"), "automatic reconnect path must reuse connect()");
assert.ok(app.includes("socketIsActive()"), "single-WebSocket guard must remain in place");
assert.ok(app.includes("action: \"reconnect-scheduled\""), "capture diagnostics must record reconnect scheduling");
assert.ok(app.includes("action: wasReconnect ? \"reconnected\" : \"open\""), "capture diagnostics must distinguish recovered connections");
assert.ok(app.includes("code: Number(event.code || 0)"), "client must capture WebSocket close code");
assert.ok(app.includes("reason: String(event.reason || \"\")"), "client must capture WebSocket close reason");
assert.ok(app.includes("wasClean: Boolean(event.wasClean)"), "client must capture clean/unclean close state");
assert.ok(app.includes("window.addEventListener(\"online\""), "client should reconnect quickly when network returns");
assert.ok(app.includes("window.addEventListener(\"offline\""), "client should expose offline state without logging out");
assert.ok(app.includes("pageUnloading = true"), "page unload must suppress reconnect loops");
assert.ok(app.includes("NORMAL_HEARTBEAT_MS = 30 * 1000"), "normal client heartbeat should be low-frequency");
assert.ok(app.includes("DEBUG_REFRESH_MS = 5 * 1000"), "debug diagnostics should refresh independently");
assert.ok(
  app.includes('connection.send(debug ? "debug-refresh" : "ping")'),
  "normal clients must use ping while debug clients use a non-scheduling refresh message"
);
assert.equal(app.includes('connection.send("pulse")'), false, "browser must not drive scheduler ticks with pulse messages");
assert.equal(app.includes("pulseTimer"), false, "legacy pulse timer must be retired");
assert.ok(
  baseRoom.includes('new WebSocketRequestResponsePair("ping", "pong")'),
  "Durable Object must retain Cloudflare auto-response ping/pong"
);
assert.ok(v36.includes("browserPulseRequiredForChatter: false"), "server alarm scheduler must remain browser-pulse independent");
assert.ok(
  /const response = await super\.fetch\(request\);[\s\S]*?await this\.armRoomAlarm\(Date\.now\(\)\);/.test(v36),
  "WebSocket/request entry must arm the server-side room alarm"
);
assert.ok(v41.includes('message === "debug-refresh" || message === "pulse"'), "v41 must intercept new refreshes and legacy pulses");
const heartbeatHandler = v41.slice(v41.indexOf("async webSocketMessage"), v41.indexOf("v41Snapshot("));
assert.equal(heartbeatHandler.includes(".tick("), false, "heartbeat/debug handling must not invoke production tick");
assert.ok(heartbeatHandler.includes("this.sendDebug?.("), "debug refresh must preserve diagnostics");
assert.equal(
  app.includes("Disconnected - click Sign On to reconnect"),
  false,
  "transient socket close must not immediately dump the user back to Sign On"
);

assert.ok(v39.includes("V39_HUMAN_RECONNECT_GRACE_MS = 5000"), "server must provide a short human reconnect grace");
assert.ok(v39.includes("this.v39PendingHumanDisconnects = new Map()"), "server must track pending human disconnects by screen name");
assert.ok(v39.includes("webSocketClose(ws, code = 1005, reason = \"\", wasClean = false)"), "server close handler must capture close diagnostics");
assert.ok(v39.includes("await sleep(V39_HUMAN_RECONNECT_GRACE_MS)"), "server must defer leave announcement during reconnect grace");
assert.ok(v39.includes("this.ctx?.waitUntil"), "disconnect grace should be kept alive through the Durable Object request lifecycle");
assert.ok(v39.includes("action: \"v39-transient-human-reconnect\""), "server must expose suppressed transient reconnects diagnostically");
assert.ok(v39.includes("humanDisconnectsDeferred"), "v39 status must count deferred disconnects");
assert.ok(v39.includes("humanDisconnectsCommitted"), "v39 status must count real disconnects after grace");
assert.ok(v39.includes("pendingHumanDisconnects"), "v39 status must expose currently pending disconnect grace windows");
assert.ok(
  /system\(text,\s*\.\.\.args\)[\s\S]*?has entered the room[\s\S]*?v39PendingHumanDisconnects[\s\S]*?return false;/.test(v39),
  "quick reconnect must suppress the fake re-enter system line"
);

console.log("WebSocket auto-reconnect + transient disconnect grace regression checks passed");
