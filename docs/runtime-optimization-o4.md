# Runtime optimization O4 — zero-copy hot paths

Baseline: post-O3 main `b55d350ae2ae2addc33445a62fd35c25c3ce9d16`.

## Goal

Remove avoidable whole-array copies and repeated scans from normal v41 room-turn paths without changing message order, scene ownership, fatigue selection, or topic-cooling semantics.

## Changes

O4 introduces `hotpath_collections_v41.js` with two bounded helpers:
- `findLastMatching()`: backward index scan with no copied/reversed array.
- `collectLastMatching()`: backward bounded scan that allocates only the selected rows and restores original order.

The helpers replace full-history copy/reverse scans in:
- lively recent-human scene protection;
- base v41 scene ownership;
- final v41 scene ownership.

Additional one-pass rewrites:
- active ambient characters no longer use spread + map + filter;
- lively prompt recent-chat extraction no longer filters the full history before taking the last 14 rows;
- recent human-name collection avoids map/filter intermediates;
- fatigued-scene selection no longer copies, filters, and sorts all open scenes;
- active v38 topic cooling is pruned and collected in one pass.

## Preserved semantics

O4 does not change:
- the 14-line lively prompt limit;
- chronological order of prompt rows;
- the 90-second recent-human protection window;
- scene fatigue thresholds;
- stable tie behavior when two scenes have the same turn count;
- topic cooling expiry or row shape;
- queue ordering or scene-plan sorting;
- provider, persistence, reconnect, or browser behavior.

## Qualification

O4 adds:
- standalone legacy-parity checks for backward lookup, bounded recent selection, and stable fatigue ties;
- retained v37 lively byte-equivalence proof normalized only for the explicit O4 hot-path rewrites;
- real Worker contract for the production methods;
- Worker generation contract total advances from 52 to 53.
