# Runtime optimization O5 — browser capture persistence

Baseline: post-O4 main `49ef8378d580b13aa7baa74675d02171413dc398`.

## Goal

Reduce synchronous browser main-thread work caused by repeatedly serializing the entire growing chat-capture object and writing it to `localStorage`.

## Previous behavior

Every capture event reset a 1.2-second debounce timer. When the timer fired, the complete capture object was serialized with `JSON.stringify()` and synchronously written to `localStorage`.

This had two problems:
- long sessions paid a growing full-session serialization/write cost;
- continuous event traffic could keep resetting the debounce and postpone persistence for an arbitrarily long time.

## O5 behavior

Capture persistence is now dirty + rate-limited:

- recording an event marks capture state dirty;
- only one persistence timer may be scheduled;
- additional events do not clear/restart that timer;
- active-session persistence attempts occur at most once every 5 seconds;
- clean capture state is not serialized again;
- failed storage attempts remain dirty but are still rate-limited;
- export, WebSocket close, tab hiding, pagehide, and beforeunload force a flush.

The in-memory event stream remains authoritative for export.

## Preserved behavior

O5 does not change:
- capture schema or `CAPTURE_KEY`;
- capture event ordering;
- message deduplication;
- 10-minute session resume behavior;
- export payload or filename;
- reconnect diagnostics;
- chat rendering;
- server behavior.

## Qualification

O5 adds a connection-level source gate proving the debounce is retired, dirty state gates serialization, retry attempts are throttled, and lifecycle force-flushes remain wired.
