import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const baseRoom = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const v36 = fs.readFileSync(new URL("../src/index_v36.js", import.meta.url), "utf8");
const v41 = fs.readFileSync(new URL("../src/index_v41_generation_contract.js", import.meta.url), "utf8");

assert.equal(app.includes('connection.send("pulse")'), false, "O1 browser scheduler pulse must stay retired");
assert.equal(app.includes("pulseTimer"), false, "O1 legacy pulse timer must stay retired");
assert.ok(app.includes("NORMAL_HEARTBEAT_MS = 30 * 1000"));
assert.ok(app.includes("DEBUG_REFRESH_MS = 5 * 1000"));
assert.ok(app.includes('connection.send(debug ? "debug-refresh" : "ping")'));
assert.ok(app.includes('if (socket !== connection || connection.readyState !== WebSocket.OPEN) return;'));
assert.ok(app.includes("clearHeartbeatTimer();"));

assert.ok(
  baseRoom.includes('this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))'),
  "O1 normal heartbeat depends on Cloudflare hibernation auto-response"
);
assert.ok(baseRoom.includes("this.ctx.acceptWebSocket(server)"), "O1 must retain hibernatable WebSocket acceptance");

assert.ok(v36.includes("serverSideRoomScheduler: true"));
assert.ok(v36.includes("browserPulseRequiredForChatter: false"));
assert.ok(
  /const response = await super\.fetch\(request\);[\s\S]*?await this\.armRoomAlarm\(Date\.now\(\)\);/.test(v36),
  "O1 connection path must still arm the authoritative server alarm"
);

const start = v41.indexOf("async webSocketMessage(ws, message)");
const end = v41.indexOf("v41Snapshot(", start);
assert.ok(start >= 0 && end > start, "O1 v41 heartbeat handler must exist");
const handler = v41.slice(start, end);
assert.ok(handler.includes('message === "debug-refresh" || message === "pulse"'));
assert.ok(handler.includes("this.sendDebug?.("), "O1 debug refresh must preserve social diagnostics");
assert.equal(handler.includes(".tick("), false, "O1 heartbeat handler must not schedule room production");
assert.ok(handler.includes("return super.webSocketMessage(ws, message)"), "O1 ordinary messages must retain existing routing");

console.log("O1 server-driven WebSocket heartbeat checks passed");
