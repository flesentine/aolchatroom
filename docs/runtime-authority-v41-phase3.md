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
→ `index_v40_scene_continuity.js`
→ `index_v39_world_gate.js`
→ `index_v39_presence_fix.js`
→ `index_v39_coherence.js`
→ `index_v38_quality_guard.js`
→ v37 and earlier layers.

## Remaining live authorities

| Responsibility | Current owner | Phase 3 rule |
| --- | --- | --- |
| Direct-human generation semantic contract / fail-closed recovery | `index_v41_generation_contract.js` | Already authoritative; do not move during wrapper retirement. |
| Scene lifecycle, ownership, association, momentum authority hook | `index_v41_scene_coordinator.js` + coordinator modules | Already authoritative; legacy wrappers may delegate but must not regain authority. |
| Ambient momentum prompt/carry compatibility | `index_v40_scene_continuity.js` | Preserve anti-churn prompt behavior, momentum snapshot, post-queue carry annotation, legacy counters, and Phase 0 observation counters until every compatibility hook is redirected and runtime-gated. |
| Future-game/public-claim gate + console-label normalization | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v39_world_gate.js` remains for frozen v40 | Phase 3D owns production ordering, counters, normalization, and audit contribution without removing the legacy path. |
| Logical human identity | `index_v39_presence_fix.js` helpers remain the logical-name source | Preserve pending/superseded attachment semantics while reconnect ownership moves to v41. |
| Same-name session replacement + transient reconnect lifecycle | `index_v41_human_reconnect.js` + `human_reconnect_lifecycle_v41.js` in v41 production | Phase 3B authority owns replacement, duplicate-enter suppression, 5s grace, pending-close state, transient/committed close decision, and legacy reconnect counters/actions. Frozen v40 keeps the legacy v39 path. |
| Error-challenge repair | `index_v41_coherence_repair.js` + `coherence_repair_v41.js` in v41 production | Phase 3C preserves legacy ordering: error-repair lock first, coherence lock second, then Voice; v39 counters remain populated. |
| Historical relative-date validation/audit | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v39_presence_fix.js` remains for frozen v40 | Phase 3D preserves both live blocking and retained-history audit fields/counters. |
| Legacy quick-background suppression | `index_v39_presence_fix.js` | Keep the inherited v11 quick-background model path disabled while v37 lively ambient remains authoritative. |
| Clarification target repair | `index_v41_coherence_repair.js` + `coherence_repair_v41.js` in v41 production | Phase 3C owns retargeting while preserving explicit screen-name precedence, reply anchoring, focus updates, and v39 diagnostics. |
| Human coherence Voice lock | `index_v41_coherence_repair.js` + `coherence_repair_v41.js` in v41 production | Phase 3C owns the exact human-trigger/anchor lock while preserving the legacy v39 counter/last-lock diagnostics. |
| Future-event world gate / audit | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v39_coherence.js` remains for frozen v40 | Phase 3D preserves `futureEventViolation()` precedence, counters, and historical-audit contribution. |
| Background self-dialogue filtering | `index_v39_coherence.js` | Preserve background-only scope. |
| Bot re-entry cooldown / roster compatibility | `index_v41_bot_roster_reentry.js` + `bot_roster_reentry_v41.js` in v41 production; legacy `index_v39_coherence.js` remains for frozen v40 | Phase 3E owns the 3-minute cooldown, desired-roster filtering, successful-leave bookkeeping, blocked-enter diagnostics, and active-bot exemption while preserving all older v29/v30/v35 roster behavior beneath it. |
| Transient human reconnect grace | `index_v39_coherence.js` with `index_v39_presence_fix.js` participation | First Phase 3 extraction candidate because it is concrete, independently observable, and already covered by server + Chromium reconnect tests. |
| Hard-era technology gate / audit | `index_v41_world_date_guard.js` + `world_date_guard_v41.js` in v41 production; legacy `index_v38_quality_guard.js` remains for frozen v40 | Phase 3D preserves generated-line blocking, v38 counters, and retained-history audit behavior. |
| Room-topic fatigue / cooling / background filtering | `index_v38_quality_guard.js` | Preserve cooldown bookkeeping, prompt guidance, background-line filtering, and coordinator-delegated scene closes. |
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
Only after all live responsibilities have moved behind explicit authorities and runtime contracts should old version wrappers be shortened or removed.

## Retirement rule

A wrapper can be retired only when:

1. every live method it owns is listed in this map;
2. each responsibility has a named replacement owner;
3. exact runtime/browser regressions cover the replacement;
4. production dispatch no longer depends on the old override;
5. frozen v35–v41 checks and Worker contracts remain green.

Version age is not evidence that a wrapper is dead.
