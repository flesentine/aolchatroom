# Phase 4 — v41 State Ownership Consolidation

Base: `main` at `24768d41e485a1f529cce079c0882abc5962a689` after Phase 3G closure.

Phase 3 retired the legacy wrapper chain and gave live behavior named v41 owners. Phase 4 addresses the remaining state/telemetry coupling where those authorities still mutate maps and counters initialized by compatibility shells.

## 4A — characterize shared v39 state ownership

This phase is **characterization only**. It must not move production state, change behavior, change snapshot/status shape, or alter client/browser code.

The current split is intentionally frozen before consolidation:

| State surface | Current initializer | Live consumers/writers |
| --- | --- | --- |
| `v39Stats` | `index_v41_coherence_compat.js` | coherence compatibility, reconnect, coherence repair, world/date, roster |
| `v39RecentBotLeaves` | `index_v41_coherence_compat.js` | coherence compatibility snapshot + roster authority |
| `v39PendingHumanDisconnects` | `index_v41_coherence_compat.js` | coherence compatibility snapshot + reconnect authority |
| `v39LastTargetRepair` | `index_v41_coherence_compat.js` | coherence compatibility snapshot + coherence-repair authority |
| `v39LastCoherenceLock` | `index_v41_coherence_compat.js` | coherence compatibility snapshot + coherence-repair authority |
| `v39PresenceFixStats` | `index_v41_presence_compat.js` | presence compatibility snapshot + reconnect authority |
| `v39CaptureFixStats` | `index_v41_presence_compat.js` | presence compatibility snapshot + coherence repair + world/date |
| `v39HumanReplacementAt` | `index_v41_presence_compat.js` | reconnect authority |

The 4A gate:
- exhaustively scans every v41 production source file for references to these eight surfaces;
- freezes the exact current consumer-file set for each surface;
- freezes the two compatibility-shell initializer locations;
- freezes the exact `v39Stats`, `v39PresenceFixStats`, and `v39CaptureFixStats` counter schemas;
- verifies reconnect, coherence repair, world/date, roster, coherence compatibility, and presence compatibility retain their current write/read responsibilities;
- forbids the named authorities from silently becoming secondary initializers.

## Next consolidation order

4B should move reconnect-specific state and telemetry first because reconnect currently spans both compatibility shells:
- `v39PendingHumanDisconnects`;
- `v39HumanReplacementAt`;
- reconnect counters in `v39Stats`;
- `v39PresenceFixStats`.

The legacy `v39Snapshot()` and presence snapshot surfaces should continue composing the same externally visible data from the new owner.

No production behavior or browser/client changes in 4A.
