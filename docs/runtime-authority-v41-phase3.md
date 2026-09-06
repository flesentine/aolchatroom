# Phase 3A — Remaining Wrapper Authority Characterization

Base: `main` at `54b0655f4b9724e52bdc399df56f8d8c0656cc2a` after PR #48.

Phase 1 centralized scene authority. Phase 2 centralized generation correctness for direct-human response obligations. The production class still inherits live behavior from several older v37–v40 wrappers. Phase 3A freezes those remaining responsibilities before any wrapper is shortened or retired.

This phase is **characterization only**. It must not change provider routing, storage, scene identity, generation semantics, reconnect timing, client behavior, or deployed version.

## Current production chain

`index_v41_generation_contract.js`
→ `index_v41_bot_roster_reentry.js`
→ `index_v41_world_date_guard.js`
→ `index_v41_coherence_repair.js`
→ `index_v41_human_reconnect.js`
→ `index_v41_scene_coordinator.js`
→ `index_v41_ambient_continuity_compat.js`
→ `index_v41_presence_compat.js`
→ `index_v41_coherence_compat.js`
→ `index_v38_quality_guard.js`
→ v37 and earlier layers.

## Remaining live authorities

| Responsibility | Current owner | Phase 3 rule |
| --- | --- | --- |
| Direct-human generation semantic contract / fail-closed recovery | `index_v41_generation_contract.js` | Already authoritative; do not move during wrapper retirement. |
| Scene lifecycle, ownership, association, momentum authority hook | `index_v41_scene_coordinator.js` + coordinator modules | Already authoritative; legacy wrappers may delegate but must not regain authority. |
| Ambient momentum prompt/carry compatibility | `index_v41_ambient_continuity_compat.js` in v41 production; frozen `index_v40_scene_continuity.js` remains unchanged | 3F.1 copies the exact v40 compatibility behavior into the v41 spine so production can bypass `index_v39_world_gate.js` without changing v40 semantics/counters. |
| Future-game/public-claim gate + console-label normalization | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v39_world_gate.js` remains for frozen v40 | Phase 3D owns production ordering, counters, normalization, and audit contribution without removing the legacy path. |
| Logical human identity | `index_v41_presence_compat.js` in v41 production; `presence_guard_v39.js` remains the helper source | 3F.2 preserves logical-name dedupe and pending/superseded attachment semantics while frozen v40 retains `index_v39_presence_fix.js`. |
| Same-name session replacement + transient reconnect lifecycle | `index_v41_human_reconnect.js` + `human_reconnect_lifecycle_v41.js` in v41 production | Phase 3B authority owns replacement, duplicate-enter suppression, 5s grace, pending-close state, transient/committed close decision, and legacy reconnect counters/actions. Frozen v40 keeps the legacy v39 path. |
| Error-challenge repair | `index_v41_coherence_repair.js` + `coherence_repair_v41.js` in v41 production | Phase 3C preserves legacy ordering: error-repair lock first, coherence lock second, then Voice; v39 counters remain populated. |
| Historical relative-date validation/audit | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v39_presence_fix.js` remains for frozen v40 | Phase 3D preserves both live blocking and retained-history audit fields/counters. |
| Legacy quick-background suppression | `index_v41_presence_compat.js` in v41 production | 3F.2 keeps inherited v11 quick-background generation disabled and preserves the legacy counter while frozen v40 retains the old wrapper. |
| Clarification target repair | `index_v41_coherence_repair.js` + `coherence_repair_v41.js` in v41 production | Phase 3C owns retargeting while preserving explicit screen-name precedence, reply anchoring, focus updates, and v39 diagnostics. |
| Human coherence Voice lock | `index_v41_coherence_repair.js` + `coherence_repair_v41.js` in v41 production | Phase 3C owns the exact human-trigger/anchor lock while preserving the legacy v39 counter/last-lock diagnostics. |
| Future-event world gate / audit | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v39_coherence.js` remains for frozen v40 | Phase 3D preserves `futureEventViolation()` precedence, counters, and historical-audit contribution. |
| Background self-dialogue filtering | `index_v41_coherence_compat.js` in v41 production; legacy `index_v39_coherence.js` remains for frozen v40 | 3F.3 preserves the exact background-only filter, counters, and broadcast action while production bypasses the v39 coherence wrapper. |
| Bot re-entry cooldown / roster compatibility | `index_v41_bot_roster_reentry.js` + `bot_roster_reentry_v41.js` in v41 production; legacy `index_v39_coherence.js` remains for frozen v40 | Phase 3E owns the 3-minute cooldown, desired-roster filtering, successful-leave bookkeeping, blocked-enter diagnostics, and active-bot exemption while preserving all older v29/v30/v35 roster behavior beneath it. |
| Transient human reconnect grace | `index_v41_human_reconnect.js` + `human_reconnect_lifecycle_v41.js` in v41 production | Phase 3B owns the full reconnect lifecycle; 3F.2 removes the old presence wrapper participation from the v41 spine while frozen v40 retains it. |
| Hard-era technology gate / audit | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v38_quality_guard.js` remains for frozen v40 | Phase 3D preserves generated-line blocking, v38 counters, and retained-history audit behavior. |
| Room-topic fatigue / cooling / background filtering | `index_v41_quality_compat.js` in v41 production; legacy `index_v38_quality_guard.js` remains for frozen v38-v40 | 3F.4 preserves cooldown bookkeeping, prompt guidance, background-line filtering, coordinator-delegated scene closes, and v38 diagnostics while production bypasses the v38 wrapper. |
| Provider readiness classification / capacity state | `index_v37_hotfix.js` + provider wrappers | Preserve hard/soft readiness, structured-ready selection, constrained/degraded decisions, and emergency Workers-AI eligibility. |
| Degraded/capacity-shedding built-in fallback | `index_v37_hotfix.js` (human degraded path is further guarded by v41) | Preserve provider-independent fallback, human priority, ambient shedding, retry-status reporting, and v41 Phase 2B fail-closed interception. |
| Production-turn singleflight / replay coalescing | `index_v37_hotfix.js` | Preserve one base turn at a time, bounded replay, tick/alarm accounting, and force-soon propagation. |
| Provider failure classification / cooldown policy | `index_v37_hotfix.js` + inherited provider state | Preserve request-local rejection handling, Workers-AI daily quota reset behavior, cooldown mutation, and failover telemetry. |
| Internal chat metadata stripping | `index_v37_hotfix.js` | Preserve pre-display stripping/drop behavior for internal metadata on bot output. |
| Legacy live-model shadow pause | `index_v37_hotfix.js` | Preserve paused-shadow behavior until shadow machinery is explicitly retired. |
| Provider capacity decision | `index_v37_human_only.js` | Still live despite superseded ambient generation. |
| Provider ordering / implementations | `index_v37_free_providers.js` | Frozen routing boundary unless a dedicated provider phase explicitly changes it. |
| Direct-human Director | `index_v37_human_director.js` | Still authoritative below the v41 generation contract. |
| Routine ambient generation | `index_v37_lively_ambient.js` | Still authoritative below v41 scene coordination. |

## Cross-cutting observability surfaces

The old wrappers also expose live status/snapshot/audit/debug surfaces (for example v37/v38/v39/v40 status routes and merged realism/provider snapshots). Wrapper retirement must preserve the diagnostic data used by tests and operational review even when the behavioral authority moves elsewhere.

## Mixed-responsibility hotspot: index_v39_coherence.js

This wrapper currently owns or participates in at least six unrelated behaviors:

1. clarification target repair;
2. human coherence Voice constraints;
3. background self-dialogue filtering;
4. bot re-entry cooldown / roster behavior;
5. transient human reconnect grace;
6. future-event world/date blocking and audit.

The file must not be retired as one operation. Each behavior needs a named replacement authority and an executable contract first.

## Phase 3 extraction order

### 3B — human reconnect lifecycle authority
Implemented in v41 production through `index_v41_human_reconnect.js` and `human_reconnect_lifecycle_v41.js` while leaving the legacy v39 implementation intact for the frozen v40 baseline. It preserves:
- the 5-second grace window;
- same-name replacement and duplicate-enter suppression;
- logical human identity through existing pending/superseded attachment semantics;
- legacy v39 reconnect diagnostics and counters;
- stale/superseded socket isolation;
- client auto-reconnect behavior;
- no fake leave/re-enter pair for a quick reconnect;
- final committed disconnect delegation beneath the two legacy v39 reconnect overrides.

### 3C — coherence/repair authority
Implemented in v41 production through `index_v41_coherence_repair.js` and `coherence_repair_v41.js`, while the legacy v39 implementation remains intact for the frozen v40 baseline. Production now owns clarification retargeting, human coherence locking, and explicit error-challenge repair in one authority. The final Phase 2 Voice wrapper explicitly calls through this authority so 3C is neither skipped nor double-applied.

### 3D — world/date guard authority
Implemented in v41 production through `index_v41_world_date_guard.js` and `world_date_guard_v41.js`, while frozen v40 keeps the original layered v38/v39 path. The authority preserves the exact production order: future-game/product gate → audited public-claim gate → relative-date validation → future-event gate → hard-era technology gate → older baseline. It also owns bot-only PS1 label normalization, legacy v38/v39 violation counters, and the combined historical-audit surface.

### 3E — bot roster/re-entry authority
Implemented in v41 production through `index_v41_bot_roster_reentry.js` and `bot_roster_reentry_v41.js`, while frozen v40 keeps the legacy v39 implementation. The authority preserves the 3-minute cooldown, retained-history fallback, active-bot roster eligibility, leave bookkeeping only after a real departure, the legacy `botReentryBlocks` counter, and the `v39-bot-reentry-blocked` broadcast. Delegation below v39 preserves the older v29 departure cooldown, v30 roster ranking, v35 presence locks, and base population scheduler.

### 3F — wrapper retirement
Retirement proceeds one frozen boundary at a time.

#### 3F.1 — retire v39 world wrapper from v41 production
V41 production now routes scene continuity through `index_v41_ambient_continuity_compat.js`, which preserves the exact v40 prompt/carry/status behavior while inheriting directly from v39 presence. `index_v39_world_gate.js` remains untouched for the frozen v40 deployment/tests, but it is no longer in the v41 production class/fetch chain. Phase 3D now also preserves the old v39 world-gate API flags, constructor stats, and `v39Snapshot()` diagnostics.

#### 3F.2 — retire v39 presence wrapper from v41 production
V41 production now routes ambient continuity through `index_v41_presence_compat.js`, which inherits through `index_v41_coherence_compat.js`. It preserves only the still-live presence compatibility surface: logical-human socket helpers, legacy quick-background suppression, the stats/maps consumed by 3B/3C/3D, the pre-WebSocket same-name replacement dispatch hook, and v39 presence/capture diagnostics plus API flags. Extracted reconnect, error-challenge, and historical-date overrides remain owned by 3B/3C/3D and are not copied into the compatibility layer.

`index_v39_presence_fix.js` remains unchanged in the repository and remains on the frozen v39/v40 path.

#### 3F.3 — retire v39 coherence wrapper from v41 production
V41 production now routes `index_v41_presence_compat.js → index_v41_coherence_compat.js → index_v38_quality_guard.js`. The new compatibility layer preserves the v39 constructor maps/counters, `/api/v39-status` and `/v39-status` diagnostics, debug-state surface, and the one still-live legacy behavior: background-only self-dialogue filtering with the original counters and `v39-self-dialogue-lines-blocked` broadcast.

The extracted v39 overrides for reconnect lifecycle, clarification/coherence repair, future-event/world-date enforcement, historical audit, and bot roster/re-entry remain owned by Phases 3B/3C/3D/3E and are not copied into the compatibility layer. Frozen `index_v39_coherence.js` and the v39/v40 chain remain unchanged.

#### 3F.4 — retire v38 quality wrapper from v41 production
V41 production now routes `index_v41_coherence_compat.js → index_v41_quality_compat.js → index_v37_lively_ambient.js`. The new compatibility layer preserves the v38 constructor state, room-topic fatigue detection/cooling, background-only topic filtering, ambient prompt guidance, coordinator-delegated fatigue scene closes, `/api/v38-status` and `/v38-status`, `v38Snapshot()`, the v37 merged snapshot field, and debug/status feature flags.

The v38 hard-era generated-line override, violation counter hook, and historical-audit override are not copied. Phase 3D remains authoritative for those behaviors and preserves the legacy v38 era counter/audit surfaces. Frozen `index_v38_quality_guard.js` remains unchanged for the v38-v40 path.

The next retirement boundary is the v37 wrapper stack; each remaining v37 provider/director/ambient responsibility must be characterized before any further inheritance shortening.


### 3G — v37 wrapper-stack extraction

#### 3G.1 — characterize the live v37 production stack
Before shortening the v37 inheritance chain, production freezes the exact remaining ownership boundary:

1. `index_v37_hotfix.js` — provider readiness/capacity baseline, degraded and capacity-shedding fallbacks, production-turn singleflight/replay coalescing, provider failure/cooldown policy, internal metadata hygiene, and paused live-model shadow handling.
2. `index_v37_human_only.js` — the one-preferred-provider capacity override plus constructor state still consumed by lively ambient. Its adaptive ambient generator and human fallback methods are superseded by later v37 layers but cannot be removed until their residual state/diagnostic dependencies are extracted.
3. `index_v37_free_providers.js` — extended provider configuration, ordering, implementations, source normalization, provider diagnostics, and `/ai-status` augmentation.
4. `index_v37_human_director.js` — authoritative direct-human Director, structural fallback, pivot scene handling, single-response Voice dispatch, and Director diagnostics.
5. `index_v37_lively_ambient.js` — authoritative routine ambient generation plus ambient scene exhaustion/closure behavior.

The production chain is therefore intentionally frozen as:

`index_v41_quality_compat.js → index_v41_lively_ambient_compat.js → index_v41_human_director_compat.js → index_v37_free_providers.js → index_v37_human_only.js → index_v37_hotfix.js → index_v37.js`

Phase 3G.1 makes no production dispatch change. Its source and real-Worker contracts exist to prevent a future retirement step from conflating provider, Director, ambient, and production-turn ownership. The next extraction must pick one responsibility boundary and provide a named v41 replacement owner before any v37 wrapper is bypassed.


#### 3G.2 — retire v37 lively-ambient wrapper from v41 production
V41 production now routes `index_v41_quality_compat.js → index_v41_lively_ambient_compat.js → index_v37_human_director.js`. The new compatibility owner preserves the complete authoritative lively-ambient behavior byte-for-byte beneath a v41-only header: scene closure/continuation protection, exhausted-scene handling, lively prompt construction, provider eligibility/rate gating, one-call ambient burst generation, natural pauses, failure-only built-in fallback, v37 constructor state/counters, status flags, and `v37Snapshot()` diagnostics.

Frozen `index_v37_lively_ambient.js` remains unchanged for the v37-v40 lineage. Production no longer inherits or fetches through that wrapper. The next v37 boundary is the direct-human Director/provider stack; it must be extracted one responsibility at a time rather than copied wholesale.


#### 3G.3 — retire v37 direct-human Director wrapper from v41 production
V41 production now routes `index_v41_lively_ambient_compat.js → index_v41_human_director_compat.js → index_v37_free_providers.js`. The new v41 Director compatibility owner preserves the complete direct-human Director implementation: repaired human triggers, context packets, eligibility, ordered provider calls, contextual repetition pivots, structural fallback, fresh-scene pivot handling, one-response Voice dispatch, built-in fallback, queue carry breaking, constructor counters, and `v37Snapshot()` diagnostics.

Frozen `index_v37_human_director.js` remains unchanged for the v37-v40 lineage. The v41 reconnect/coherence/world-date/roster authorities now resolve their unrelated legacy baseline callbacks through `index_v37_free_providers.js`, so the retired Director wrapper is no longer a hidden prototype dependency. The next boundary is the extended free-provider wrapper and must be characterized/extracted separately.

## Retirement rule

A wrapper can be retired only when:

1. every live method it owns is listed in this map;
2. each responsibility has a named replacement owner;
3. exact runtime/browser regressions cover the replacement;
4. production dispatch no longer depends on the old override;
5. frozen v35–v41 checks and Worker contracts remain green.

Version age is not evidence that a wrapper is dead.
