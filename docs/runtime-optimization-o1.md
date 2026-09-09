# Runtime optimization O1 — server-driven WebSocket scheduling

Baseline: code-freeze `96932ae3126e5a4f4deee1aece74cd749053c12e`.

## Goal

Remove the legacy 1.5-second browser `pulse` loop from production scheduling while preserving:
- room liveness;
- WebSocket keepalive;
- reconnect behavior;
- debug diagnostics;
- existing chat/profile message routing.

## Production behavior

Normal clients now send `ping` every 30 seconds. The base Durable Object already configures Cloudflare's `WebSocketRequestResponsePair("ping", "pong")` auto-response, so these heartbeats do not enter `webSocketMessage()` and do not call `tick()`.

Debug clients send `debug-refresh` every 5 seconds. The v41 production entrypoint intercepts that message and sends the existing debug state without scheduling a room turn.

The same v41 intercept also consumes legacy `pulse` messages from stale cached clients. A legacy pulse may refresh debug state for a debug socket, but it never reaches the historical base handler that calls `tick()`.

Room chatter remains driven by the v36 Durable Object alarm scheduler. The WebSocket fetch path still arms that alarm after connection.

## Expected runtime effect

The previous browser loop generated one production-turn request every 1.5 seconds per connected client. O1 removes that per-client scheduler load from normal operation. Normal heartbeat traffic is handled by Cloudflare's WebSocket auto-response path instead.

No provider selection, generation policy, scene policy, reconnect policy, chat rendering, or persistence semantics change.
