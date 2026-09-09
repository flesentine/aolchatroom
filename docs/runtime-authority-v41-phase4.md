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

## 4B — consolidate reconnect state and telemetry ownership

Phase 4B moves all reconnect-specific mutable state out of the v39 compatibility shells and into `HumanReconnectLifecycleAuthority`.

Authority-owned state:
- `pendingHumanDisconnects`;
- `humanReplacementAt`;
- `presenceFixStats` with the four historical replacement/pending-close counters;
- `reconnectStats` with `humanDisconnectsDeferred`, `transientHumanReconnects`, and `humanDisconnectsCommitted`.

The live room no longer carries:
- `v39PendingHumanDisconnects`;
- `v39HumanReplacementAt`;
- `v39PresenceFixStats`.

The mixed `v39Stats` object in `index_v41_coherence_compat.js` no longer stores the three reconnect counters. It retains only the still-shared non-reconnect v39 counters.

External compatibility is preserved by composition:
- `index_v41_coherence_compat.js::v39Snapshot()` merges `legacyV39Stats()` and `legacyPendingHumanDisconnects()` from the reconnect authority into the same historical `stats` / `pendingHumanDisconnects` fields;
- `index_v41_presence_compat.js::v39Snapshot()` reads `legacyPresenceFixStats()` from the reconnect authority and preserves the same `presenceFixStats` field;
- the authority's own v41 snapshot exposes the new ownership explicitly.

Behavior remains unchanged:
- same-name replacement still supersedes the old socket;
- quick reconnect still suppresses the duplicate enter;
- transient reconnect still avoids a fake leave/re-enter pair;
- committed disconnect still delegates exactly once after the 5-second grace;
- all legacy broadcast actions and externally visible counters remain intact.

The 4B real-Worker contract additionally proves the retired room fields are absent on a production room while the legacy v39 snapshot still reports the authority-owned values.

No client/browser code changes in this phase.

## 4C — consolidate coherence-repair state and telemetry ownership

Phase 4C moves the remaining coherence-repair mutable state out of the v39 compatibility shells and into `CoherenceRepairAuthority`.

Authority-owned state:
- `lastTargetRepair`;
- `lastCoherenceLock`;
- `repairStats.clarificationTargetRepairs`;
- `repairStats.coherenceVoiceLocks`;
- `captureFixStats.explicitErrorChallengesRepaired`.

The live room no longer carries:
- `v39LastTargetRepair`;
- `v39LastCoherenceLock`.

The mixed `v39Stats` object no longer stores the clarification-repair or coherence-lock counters, and `v39CaptureFixStats` no longer stores the explicit-error-repair counter.

External compatibility remains unchanged:
- `index_v41_coherence_compat.js::v39Snapshot()` merges `legacyV39Stats()` from the repair authority and reads `legacyLastTargetRepair()` / `legacyLastCoherenceLock()`;
- `index_v41_presence_compat.js::v39Snapshot()` merges `legacyCaptureFixStats()` from the repair authority into the historical `captureFixStats` object;
- the v41 coherence-repair snapshot exposes the new authority-owned state directly.

Behavior remains unchanged:
- implicit clarification target repair still preserves the exact reply anchor;
- explicit bot mentions still outrank semantic repair;
- human Voice coherence constraints still lock to the current anchor;
- explicit error challenges still apply the repair plan and change the lock mode to `challenge`;
- all historical v39 counters and diagnostics remain visible through the same status surface.

The 4C real-Worker contract proves both the absence of the retired room fields and the unchanged legacy v39 snapshot after live target-repair and explicit-error flows.

No client/browser code changes in this phase.

## 4D — consolidate world/date and roster state ownership

Phase 4D moves the remaining v39 world/date and bot-reentry mutable state into the authorities that already own those behaviors.

`WorldDateGuardAuthority` now owns:
- `worldGateStats.futureGameProductLinesBlocked`;
- `worldGateStats.auditedPublicClaimsBlocked`;
- `worldGateStats.consoleLabelsNormalized`;
- `captureFixStats.historicalDateClaimsBlocked`;
- `coherenceStats.futureEventLinesBlocked`.

`BotRosterReentryAuthority` now owns:
- `recentBotLeaves`;
- `rosterStats.botReentryBlocks`.

The live room no longer carries:
- `v39WorldGateStats`;
- `v39RecentBotLeaves`.

The mixed `v39Stats` object no longer stores `futureEventLinesBlocked` or `botReentryBlocks`, and the presence compatibility capture object no longer stores `historicalDateClaimsBlocked`.

Legacy v39 diagnostics remain unchanged by composition:
- `v39Snapshot().stats` merges world/date and roster counters from their authorities;
- `v39Snapshot().recentlyDeparted` is composed from the roster authority;
- `v39Snapshot().captureFixStats.historicalDateClaimsBlocked` comes from the world/date authority;
- `v39Snapshot().worldGateStats` comes from the world/date authority.

The v38 `eraLinesBlocked` counter deliberately remains outside 4D and is reserved for the dedicated v38 telemetry consolidation.

Behavior remains unchanged:
- world/date guard ordering;
- future-game and audited-public-claim blocking;
- historical-date and future-event blocking;
- PS1-to-PlayStation bot normalization;
- 3-minute bot re-entry cooldown;
- active-bot roster eligibility;
- blocked-reentry broadcast semantics.

The 4D real-Worker contract proves the retired room fields are absent while the same legacy v39 diagnostics are populated after live world/date and roster behavior.

No client/browser code changes in this phase.


## 4E — consolidate residual v39 background compatibility state

Phase 4E moves the final compatibility-shell-owned mutable v39 counters into a named `V39BackgroundCompatibilityAuthority`.

Authority-owned state:
- `backgroundStats.selfDialogueLinesBlocked`;
- `backgroundStats.backgroundPlansFiltered`;
- `captureFixStats.legacyQuickBackgroundCallsSuppressed`.

The authority also owns the two residual behaviors that write those counters:
- background-only v39 self-dialogue filtering and the unchanged `v39-self-dialogue-lines-blocked` broadcast;
- suppression of the inherited legacy quick-background generator.

The live room no longer carries:
- `v39Stats`;
- `v39CaptureFixStats`.

Legacy v39 diagnostics remain unchanged by composition:
- `v39Snapshot().stats` reads the two background counters from the authority;
- `v39Snapshot().captureFixStats.legacyQuickBackgroundCallsSuppressed` reads from the same authority.

This closes v39 compatibility-shell mutable-state ownership. The v38 quality/cooling state, including `eraLinesBlocked`, is intentionally unchanged and remains reserved for the dedicated v38 telemetry consolidation.

No client/browser code changes in this phase.
