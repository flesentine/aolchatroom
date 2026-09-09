# Runtime optimization O5 — authoritative browser capture persistence

Baseline: post-O4 main `49ef8378d580b13aa7baa74675d02171413dc398`.
O5.1 consolidation baseline: post-O5 main `48dd0b0ccf9e865c7b8a6d296b810ee350ea9321`.

## Goal

Reduce synchronous browser main-thread work caused by repeatedly serializing the entire growing chat-capture object and writing it to `localStorage`, while keeping exactly one authoritative capture/export implementation.

## What Chromium found after O5

The first O5 patch optimized the legacy v1 capture implementation embedded in `public/app.js`, but production HTML also loads `public/capture-v2.js` before `app.js`.

That mattered because capture-v2:
- wraps the WebSocket and records the richer v2 capture schema;
- intercepts Save Chat in the capture phase with `stopImmediatePropagation()`;
- therefore owns the actual exported capture;
- still used the older one-second reset-on-every-event persistence debounce.

The result was duplicated in-memory capture state and duplicated `localStorage` persistence paths, with the real Save Chat owner still on the old persistence behavior.

## O5.1 behavior

`capture-v2.js` is now the single authoritative browser capture system.

- `app.js` no longer keeps a v1 capture object, v1 capture key, capture message-key set, capture persistence timer, capture export handler, or capture lifecycle flushes.
- capture-v2 keeps the existing `aol96-chat-capture-v2` schema, 10-minute resume behavior, WebSocket interception, local-human reconciliation, provider metadata, and Save Chat export.
- recording an event marks v2 capture state dirty.
- only one persistence timer may be scheduled.
- additional events do not clear/restart that timer.
- active-session persistence attempts occur at most once every 5 seconds.
- clean capture state is not serialized again.
- failed storage attempts remain dirty but still advance the retry throttle time.
- export, WebSocket close, tab hiding, pagehide, and beforeunload force a flush.

The authoritative in-memory v2 event stream remains the source for Save Chat export.

## Preserved application behavior

O5.1 does not change:
- chat rendering or the 220-row transcript cap;
- live-frame display dedupe;
- screen-name persistence;
- 30-second normal WebSocket heartbeat;
- debug refresh behavior;
- automatic reconnect timing and UI;
- profile requests;
- server behavior.

## Qualification

The O5 regression gate now proves both halves of the architecture:
1. capture-v2 owns the v2 schema, WebSocket capture, Save Chat, lifecycle flushes, dirty state, and 5-second persistence throttle;
2. app.js contains no duplicate v1 capture system or Save Chat listener.

`public/capture-v2.js` is also syntax-checked by the main repository check.
