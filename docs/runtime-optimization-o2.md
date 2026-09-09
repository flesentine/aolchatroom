# Runtime optimization O2 — history persistence coalescing

Baseline: post-O1 main `8e3583cd0dd408f9b42b7bc77c567453e51e1ba1`.

## Goal

Preserve the existing `history` Durable Object storage schema while preventing bursts of emitted messages from starting overlapping full-history writes.

## Existing behavior

The frozen base `pushMessage()` appends a message, caps in-memory history at 220 rows, broadcasts immediately, then calls `persistHistory()` without awaiting it. The base `persistHistory()` writes the entire capped array to the `history` key.

That means several messages emitted while a storage write is pending can start several overlapping full-array writes.

## O2 behavior

v41 overrides `persistHistory()` with `CoalescingHistoryWriter`.

- persistence requests are counted immediately;
- only one persistence cycle may be active;
- overlapping requests share the active promise and mark the writer dirty;
- after an active write finishes, the latest 220-row snapshot is written if anything changed;
- continuous traffic may require additional serial follow-up writes, but storage-write concurrency never exceeds one;
- the storage key remains `history`;
- the stored value remains the same capped array shape;
- broadcast/message ordering is untouched.

The writer exposes diagnostics through `v41Snapshot().historyPersistence`.

## Qualification

O2 adds:
- a standalone algorithm/source gate;
- a real Worker contract using controlled delayed writes;
- a real Durable Object storage schema probe;
- the existing full v35/v36/v37/v41 suites and Cloudflare build qualification.
