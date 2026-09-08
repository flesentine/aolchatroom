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
| Provider readiness classification / capacity state | `index_v41_provider_readiness_compat.js` in v41 production; frozen `index_v37_hotfix.js` remains for v37-v40 | 3G.8 preserves hard/soft readiness, structured-ready selection, constrained/degraded decisions, and human-priority capacity policy. |
| Degraded/capacity-shedding built-in fallback | `index_v41_provider_readiness_compat.js` in v41 production | 3G.8 preserves provider-independent fallback, human priority, ambient shedding, retry-status reporting, and constrained background suppression. |
| Production-turn singleflight / replay coalescing | `index_v41_production_turn_compat.js` in v41 production; frozen `index_v37_hotfix.js` remains for v37-v40 | 3G.7 owns one base turn at a time, bounded replay, tick/alarm accounting, force-soon propagation, and merged production-turn diagnostics. |
| Provider failure classification / cooldown policy | `index_v41_provider_failover_compat.js` + inherited provider state in v41 production | 3G.9 preserves request-local rejection handling, Workers-AI daily quota reset behavior, cooldown mutation, and failover telemetry. Live provider ordering remains owned by `index_v41_free_providers_compat.js`. |
| Internal chat metadata stripping | `index_v41_output_hygiene_compat.js` in v41 production | 3G.10 preserves bot-only stripping/drop behavior, shared strip/drop counters, higher provider-source normalization, and the output-hygiene status flag. |
| Legacy live-model shadow pause | `index_v41_paused_shadow_compat.js` in v41 production | 3G.11 preserves queued-shadow pause marking, idempotent telemetry, retained shadow-history updates, and the paused-shadow status flags. |
| Shared v37 production-turn telemetry | `production_turn_stats_v41.js`, initialized by `index_v41_paused_shadow_compat.js` | 3G.12 preserves the exact frozen counter schema as state-only data; all extracted owners mutate the same per-room object. The old hotfix residual compatibility file is retired. |
| Provider capacity decision | `index_v41_provider_readiness_compat.js` in v41 production; frozen v37 policies remain for v37-v40 | 3G.14 consolidates the one-preferred-provider live override with the already-extracted hotfix capacity baseline in the readiness owner. |
| Delegated human fallback | `index_v41_human_director_compat.js` in v41 production; frozen `index_v37_human_only.js` remains for v37-v40 | 3G.15 preserves lower-planner-first behavior and moves only the empty-result built-in fallback into the Human Director owner. 3G.16 also moves the two live fallback counters here. |
| Legacy human-only diagnostics/status | `human_only_legacy_diagnostics_v41.js`, composed by `index_v41_free_providers_compat.js` | 3G.17 extracts the compatibility surface; 3G.18 deletes the obsolete v41 residual source; 3G.19 removes the retired ambient timestamp/counter fields from room state while rendering the same zero-valued historical snapshot/status payload. Frozen `index_v37_human_only.js` remains for lineage. |
| Provider ordering / implementations | `index_v41_free_providers_compat.js` in v41 production; frozen `index_v37_free_providers.js` remains for v37-v40 | 3G.4 preserves provider configuration, ordering, implementations, source normalization, diagnostics, and `/ai-status` augmentation while production bypasses the v37 wrapper. |
| Direct-human Director | `index_v41_human_director_compat.js` in v41 production; frozen `index_v37_human_director.js` remains for v37-v40 | 3G.3 preserves the authoritative Director while production bypasses the frozen wrapper. 3G.15 also consolidates delegated empty-plan fallback here. |
| Routine ambient generation | `index_v41_lively_ambient_compat.js` in v41 production; frozen `index_v37_lively_ambient.js` remains for v37-v40 | 3G.2 preserves authoritative lively ambient behavior while production bypasses the frozen wrapper. 3G.13 also consolidates its provider cursor and active-character helper here. |

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
2. `index_v37_human_only.js` — the one-preferred-provider capacity override, active ambient-character helper, constructor/diagnostic state consumed by lively ambient, and a conditional human fallback used when the Director delegates an unlocked/non-direct packet. Its adaptive ambient prompt/generator/background-plan path is superseded by lively ambient.
3. `index_v37_free_providers.js` — extended provider configuration, ordering, implementations, source normalization, provider diagnostics, and `/ai-status` augmentation.
4. `index_v37_human_director.js` — authoritative direct-human Director, structural fallback, pivot scene handling, single-response Voice dispatch, and Director diagnostics.
5. `index_v37_lively_ambient.js` — authoritative routine ambient generation plus ambient scene exhaustion/closure behavior.

The production chain is therefore intentionally frozen as:

`index_v41_quality_compat.js → index_v41_lively_ambient_compat.js → index_v41_human_director_compat.js → index_v41_free_providers_compat.js → index_v41_human_only_compat.js → index_v37_hotfix.js → index_v37.js`

Phase 3G.1 makes no production dispatch change. Its source and real-Worker contracts exist to prevent a future retirement step from conflating provider, Director, ambient, and production-turn ownership. The next extraction must pick one responsibility boundary and provide a named v41 replacement owner before any v37 wrapper is bypassed.


#### 3G.2 — retire v37 lively-ambient wrapper from v41 production
V41 production now routes `index_v41_quality_compat.js → index_v41_lively_ambient_compat.js → index_v37_human_director.js`. The new compatibility owner preserves the complete authoritative lively-ambient behavior byte-for-byte beneath a v41-only header: scene closure/continuation protection, exhausted-scene handling, lively prompt construction, provider eligibility/rate gating, one-call ambient burst generation, natural pauses, failure-only built-in fallback, v37 constructor state/counters, status flags, and `v37Snapshot()` diagnostics.

Frozen `index_v37_lively_ambient.js` remains unchanged for the v37-v40 lineage. Production no longer inherits or fetches through that wrapper. The next v37 boundary is the direct-human Director/provider stack; it must be extracted one responsibility at a time rather than copied wholesale.


#### 3G.3 — retire v37 direct-human Director wrapper from v41 production
V41 production now routes `index_v41_lively_ambient_compat.js → index_v41_human_director_compat.js → index_v37_free_providers.js`. The new v41 Director compatibility owner preserves the complete direct-human Director implementation: repaired human triggers, context packets, eligibility, ordered provider calls, contextual repetition pivots, structural fallback, fresh-scene pivot handling, one-response Voice dispatch, built-in fallback, queue carry breaking, constructor counters, and `v37Snapshot()` diagnostics.

Frozen `index_v37_human_director.js` remains unchanged for the v37-v40 lineage. The v41 reconnect/coherence/world-date/roster authorities now resolve their unrelated legacy baseline callbacks through the layer below the retired Director, so the old Director wrapper is no longer a hidden prototype dependency.

#### 3G.4 — retire v37 extended free-provider wrapper from v41 production
V41 production now routes `index_v41_human_director_compat.js → index_v41_free_providers_compat.js → index_v37_human_only.js`. The new v41 provider compatibility owner preserves the complete extended-provider implementation byte-for-byte beneath a v41-only header: provider configuration, preferred/effective ordering, hard/soft readiness integration, provider-specific HTTP implementations, source normalization, provider event telemetry, failover snapshot augmentation, `/ai-status` augmentation, constructor counters, and `v37Snapshot()` diagnostics.

Frozen `index_v37_free_providers.js` remains unchanged for the v37-v40 lineage. The unrelated v41 reconnect/coherence/world-date/roster baseline callbacks resolve below the provider layer, so production no longer inherits, fetches through, or imports `index_v37_free_providers.js`.


#### 3G.5 — retire v37 human-only wrapper from v41 production
V41 production now routes `index_v41_free_providers_compat.js → index_v41_human_only_compat.js → index_v37_hotfix.js`. Unlike the prior exact-body retirements, this is a **residual extraction** because the frozen human-only wrapper mixes live and superseded behavior.

The v41 residual owner preserves only the still-live surface:
- constructor state still consumed by lively ambient and diagnostics (`v37AmbientProviderCursor`, `v37LastAmbientAiAt`, and `v37AdaptiveAmbientStats`);
- the one-preferred-provider `providerCapacityConstrained()` override;
- `activeAmbientCharacters()`, still consumed by the lively ambient owner;
- `generateHumanReplan()` as a delegated safety fallback for human packets that the Director does not claim;
- the historical human-only status flags and `v37Snapshot()` diagnostics.

It intentionally does **not** copy `ambientAiPrompt()`, `generateAdaptiveAmbientAi()`, or `generateBackgroundPlan()`. Routine background generation is already authoritative in `index_v41_lively_ambient_compat.js`, so restoring those methods would create a second ambient authority.

Frozen `index_v37_human_only.js` remains unchanged for v37-v40. The unrelated v41 reconnect/coherence/world-date/roster baseline callbacks now resolve directly through `index_v37_hotfix.js`, because the retired human-only wrapper does not override those baseline methods.

The next boundary is `index_v37_hotfix.js`. It still owns multiple production-critical responsibilities—singleflight/replay coalescing, degraded/capacity fallback, provider readiness/failure policy, metadata stripping, and paused shadow handling—so it must be characterized and extracted by responsibility rather than retired wholesale.


#### 3G.6 — characterize the remaining v37 hotfix boundary
After 3G.5, the only v37 wrapper still on the v41 production inheritance spine is `index_v37_hotfix.js`. It is not a single responsibility and must not be retired as one operation.

3G.6 freezes five live authority groups:

1. **Production-turn singleflight / replay coalescing** — `runV37BaseProductionTurn()`, `requestV37ProductionTurn()`, `tick()`, `alarm()`, constructor gate state, bounded two-replay policy, and turn diagnostics.
2. **Provider readiness / degraded and capacity fallback** — hard/soft readiness, preferred/effective structured readiness, degraded-pool detection, built-in degraded fallback, capacity-shedding ambient fallback, and background-AI suppression while constrained.
3. **Provider failure / quota / failover diagnostics** — request-local rejection classification, Workers AI daily quota reset/cooldown state, and merged failover diagnostics. The lower hotfix also contains an `orderedReadyProviders()` implementation, but in v41 production that method is already superseded by the higher 3G.4 free-provider ordering owner.
4. **Output hygiene** — stripping or dropping internal chat metadata before bot output reaches the visible chat stream.
5. **Paused shadow isolation** — retaining shadow packets while preventing the old live-model shadow from competing with production provider traffic.

The wrapper also owns the merged status and `v37Snapshot()` diagnostics for these responsibilities. Phase 3G.6 changes no production dispatch. Each authority group must receive its own replacement owner and runtime contract before `index_v37_hotfix.js` can leave the v41 spine.

The preferred extraction order is singleflight first, then provider readiness/degraded fallback, provider failure/quota diagnostics, output hygiene, and finally shadow pause/diagnostic consolidation. Provider ordering remains a separate 3G.4 authority.


#### 3G.7 — extract production-turn singleflight from the v37 hotfix boundary
V41 production now routes `index_v41_human_only_compat.js → index_v41_production_turn_compat.js → index_v41_hotfix_residual_compat.js → index_v37.js`. Frozen `index_v37_hotfix.js` remains unchanged for v37-v40 and is no longer imported by the v41 production spine.

The new production-turn owner preserves the exact hotfix implementations of:
- `runV37BaseProductionTurn()`;
- `requestV37ProductionTurn()`;
- `tick()`;
- `alarm()`;
- the `CoalescingTurnGate` with `maxReplays: 2`;
- coalesced/replay/deferred telemetry hooks;
- `productionTurnSingleFlight` and `productionTurnReplayCoalescing` status flags;
- merged `productionTurn` snapshot diagnostics.

The new residual hotfix owner preserves the shared `v37ProductionTurnStats` object because its counters are also written by degraded fallback, provider failover, output hygiene, and shadow isolation. All non-singleflight hotfix method bodies remain byte-for-byte equivalent to the frozen v37 implementation. The unrelated reconnect/coherence/world-date/roster baseline callbacks now delegate directly to `index_v37.js`, eliminating hidden hotfix prototype dependencies.

The real-Worker extraction contract deliberately overlaps a tick, an alarm, and a forced tick. It requires one active base turn, two coalesced requests, exactly one replay, preserved force-soon propagation, maximum concurrency of one, and unchanged merged diagnostics.

The next extraction boundary is **provider readiness plus degraded/capacity fallback**. Provider failure/quota routing, output hygiene, and paused-shadow behavior remain in the residual owner and must not move with it accidentally.


#### 3G.8 — extract provider readiness and degraded/capacity fallback
V41 production now routes `index_v41_production_turn_compat.js → index_v41_provider_readiness_compat.js → index_v41_hotfix_residual_compat.js → index_v37.js`.

The new provider-readiness owner preserves the exact hotfix implementations of:
- hard/soft provider readiness;
- preferred/effective structured provider selection;
- capacity-constrained and degraded-pool decisions;
- degraded built-in human/ambient fallback;
- capacity-shedding ambient fallback;
- constrained background-AI suppression;
- readiness/degraded mode flags.

The deeper residual no longer owns those methods or flags. It continues to own shared stats, provider failure/quota handling, output hygiene, paused-shadow behavior, and the combined provider-failover snapshot. That snapshot intentionally calls the extracted readiness methods dynamically so the externally visible diagnostic shape remains unchanged.

The real-Worker contract verifies hard/soft/effective readiness, preferred-provider priority, constrained-capacity detection, non-degraded behavior with a healthy provider, constrained background-refill suppression, and preserved mode diagnostics.

The next clean extraction is **provider failure / quota handling plus failover diagnostics**. Live provider ordering remains with the already-extracted 3G.4 free-provider owner. Output hygiene and paused-shadow isolation remain separate later boundaries.


#### 3G.9 — extract provider failure, quota, and failover diagnostics
V41 production now routes `index_v41_provider_readiness_compat.js → index_v41_provider_failover_compat.js → index_v41_hotfix_residual_compat.js → index_v37.js`.

The new provider-failover owner preserves the exact hotfix implementations of:
- `noteProviderFailure()`, including request-local 400/413/422 rejection handling;
- Workers AI daily free-allocation detection and next-UTC-midnight cooldown extension;
- `v37ProviderFailoverSnapshot()` and its combined cooldown/readiness diagnostic shape;
- failover mode flags and Workers AI quota state.

The code review for 3G.9 corrected an earlier characterization mistake: `index_v41_free_providers_compat.js` already overrides `orderedReadyProviders()` and does not delegate to the lower hotfix method. Therefore 3G.9 deliberately does **not** claim or duplicate provider-ordering authority. The higher 3G.4 owner remains authoritative, including its extended-provider priority and Workers AI boundary.

The shared `v37ProductionTurnStats` object remains in the final residual because output hygiene and paused-shadow counters still write into it. The failover owner consumes the failure-specific counters there without duplicating the shared object.

The failover snapshot intentionally calls readiness methods through `this`. Because the readiness owner remains above this layer, hard/soft/effective provider fields continue to reflect the live extracted readiness policy instead of a duplicated lower copy.

The real-Worker contract verifies:
- HTTP 422 request-local rejection increments its counter without tripping the hard provider cooldown;
- Workers AI daily-quota exhaustion extends cooldown exactly to the next UTC midnight and records reset diagnostics;
- the live 3G.4 provider-ordering policy remains unchanged: Workers AI can remain the only healthy provider, while structured generation suppresses it when a healthy non-Workers alternative exists;
- merged failover status and snapshot fields remain visible.

The remaining hotfix residual now contains only **output hygiene, paused-shadow isolation, shared stats, and their residual diagnostics**. Those must be extracted separately; output hygiene is the next clean boundary.


#### 3G.10 — extract output hygiene
V41 production now routes `index_v41_provider_failover_compat.js → index_v41_output_hygiene_compat.js → index_v41_hotfix_residual_compat.js → index_v37.js`.

The new output-hygiene owner preserves the exact hotfix `say()` implementation:
- non-bot/human text bypasses stripping;
- bot text passes through `stripInternalChatMetadata()`;
- sanitized bot lines increment `internalMetadataStrips`;
- metadata-only bot lines are dropped and increment `internalMetadataDroppedLines`;
- `internalMetadataOutputHygiene` remains visible in status/snapshot output.

The shared `v37ProductionTurnStats` object stays in the residual because paused-shadow accounting still writes into it. The hygiene owner consumes only the two hygiene counters without duplicating shared state.

The live upper `index_v41_free_providers_compat.js` `say()` override remains above this layer and still delegates through `super.say()`. The real-Worker contract therefore exercises the full production path and proves:
- extended-provider source normalization still occurs first;
- internal thread/topic metadata is stripped before visible bot chat;
- concrete provider metadata survives;
- metadata-only bot lines never enter history;
- human text containing the same tag syntax is untouched.

The remaining hotfix residual is now limited to **paused-shadow isolation, shared stats, and residual diagnostics**. Paused-shadow extraction is the next clean boundary.


#### 3G.11 — extract paused-shadow isolation
V41 production now routes `index_v41_output_hygiene_compat.js → index_v41_paused_shadow_compat.js → index_v41_hotfix_residual_compat.js → index_v37.js`.

The new paused-shadow owner preserves the exact hotfix `maybeRunV37Shadow()` implementation:
- stale queued shadows are still expired first by the inherited v37 helper;
- a fresh queued shadow is not executed against a model;
- the shadow remains queued and is marked `deferred-production-priority`;
- the frozen defer reason `live-model-shadow-paused` and diagnostic error are retained;
- `liveAiShadowPauses` increments only on the first transition;
- shadow history is replaced with the paused state;
- repeated observations are idempotent.

The production-turn singleflight owner still calls `this.maybeRunV37Shadow(Date.now())` after the lower alarm completes, so dispatch remains dynamic through the extracted owner without changing alarm ordering.

The shared `v37ProductionTurnStats` object remains in `index_v41_hotfix_residual_compat.js` because all extracted hotfix authorities write into that single externally visible telemetry object. The residual now owns **shared state only**; it has no remaining hotfix behavioral override or mode flag.

The real-Worker contract verifies the first pause transition, retained pending packet, shadow-history replacement, no stale expiry, idempotent repeat behavior, no-pending no-op behavior, and preserved merged diagnostics.

With 3G.11 complete, every behavioral responsibility characterized in 3G.6 has a v41 production owner outside the old hotfix residual. The next clean step is a **shared-state consolidation/retirement decision** for `index_v41_hotfix_residual_compat.js`, not another behavior extraction.


#### 3G.12 — retire the hotfix residual compatibility layer
V41 production now routes `index_v41_output_hygiene_compat.js → index_v41_paused_shadow_compat.js → index_v37.js`. The file `index_v41_hotfix_residual_compat.js` is deleted.

The only responsibility left after 3G.11 was initialization of the shared `v37ProductionTurnStats` object. 3G.12 moves that schema into the state-only factory `production_turn_stats_v41.js`. The paused-shadow owner is the lowest v41 hotfix-derived layer, so its constructor now:
- calls the v37 constructor first;
- creates one fresh telemetry object per room;
- leaves all behavior in the already extracted singleflight/readiness/failover/hygiene/shadow owners.

The retirement gate derives the frozen counter keys from `index_v37_hotfix.js` and requires the factory to match that schema exactly with every counter initialized to zero. It also requires the deleted residual file to stay absent and forbids higher owners from reinitializing the object.

The real-Worker retirement contract proves one object identity is shared across:
- production-turn request accounting;
- readiness/capacity suppression;
- request-local provider rejection handling;
- output-hygiene stripping;
- paused-shadow accounting.

The merged `productionTurn` snapshot must expose the same mutated values after all five owners run.

After 3G.12 there is no v41 production dependency on `index_v37_hotfix.js` or on a hotfix-residual compatibility wrapper. The frozen v37-v40 lineage remains unchanged.


#### 3G.13 — consolidate lively-ambient support ownership
The remaining human-only residual still contained two pieces that existed solely to support the already-authoritative lively ambient path: `v37AmbientProviderCursor` initialization and `activeAmbientCharacters()`.

3G.13 moves both into `index_v41_lively_ambient_compat.js`, their only live behavioral consumer. The active-character helper remains byte-for-byte equivalent to the frozen v37 human-only implementation, and lively provider rotation still uses the same cursor arithmetic.

The human-only residual deliberately remains in the production spine because it still owns separate responsibilities that must not be conflated with ambient generation:
- the one-preferred-provider capacity override;
- delegated built-in human fallback for packets the Director does not claim;
- legacy adaptive-ambient diagnostic state and counters;
- the historical human-only status/snapshot surface.

The 3G.13 source gate proves the human-only residual no longer owns the lively cursor, character lookup dependency, or active-character helper, while the lively owner initializes and consumes both locally. The real-Worker contract verifies active bot resolution and forces one lively provider attempt, proving the local cursor advances from Gemini to the next slot exactly through the moved owner.

No client/browser code changes in this phase.



#### 3G.14 — consolidate live capacity policy in provider readiness
After 3G.13, the human-only residual still overrode `providerCapacityConstrained()` only to make one healthy preferred provider sufficient for live v41 operation. The lower 3G.8 readiness owner already contained the extracted hotfix capacity baseline, so capacity authority remained split across two layers.

3G.14 consolidates both halves in `index_v41_provider_readiness_compat.js`:
- one healthy preferred structured provider returns unconstrained, preserving the live human-only override;
- when no preferred provider is healthy, the method falls through to the existing hotfix-derived `providerBudgetConstrained()` baseline with `minimumPreferredReady: 2`;
- degraded-provider classification remains separate, so a healthy Workers AI fallback can be non-degraded while preferred capacity is still constrained.

The human-only residual no longer owns capacity policy. It remains responsible only for delegated human fallback, legacy adaptive-ambient diagnostic state/counters, and its historical status/snapshot surface.

The 3G.14 source gate requires provider readiness to be the only v41 production owner of `providerCapacityConstrained()`. The real-Worker contract verifies both the one-preferred unconstrained path and the zero-preferred baseline path through direct and dynamic production dispatch.

No client/browser code changes in this phase.


#### 3G.15 — consolidate delegated human fallback in the Human Director
After 3G.14, the human-only residual still wrapped `generateHumanReplan()` solely to provide a built-in reply when the inherited lower planning stack returned no lines. The higher Human Director already owned the direct-human path and already depended on the same v14 built-in fallback for its own direct-turn safety path.

3G.15 moves only that delegated fallback wrapper into `index_v41_human_director_compat.js` as `generateDelegatedHumanReplan()`:
- Director-ineligible packets still delegate through the complete lower planner chain first;
- a non-empty lower plan returns unchanged;
- only an empty lower result reaches the same v14 `builtInHumanReply()`;
- `humanModelFallbacks`, `humanModelFallbackMisses`, built-in source tagging, and AI status text remain unchanged.

The moved helper is byte-for-byte equivalent to frozen `index_v37_human_only.js::generateHumanReplan()` after changing only the method name. The original 3G.3 Human Director body also remains byte-for-byte equivalent to frozen v37 after subtracting the new helper and restoring its single delegation line.

The human-only residual no longer owns human-turn behavior or the v14 fallback dependency. It remains only as a legacy diagnostic/status owner: `v37LastAmbientAiAt`, `v37AdaptiveAmbientStats`, and the historical human-only `v37Snapshot()`/status surface.

The real-Worker contract proves both sides of the delegated path: a successful lower planner result bypasses built-in fallback and leaves the fallback counter unchanged, while a forced empty lower planner reaches the built-in directed reply and increments the legacy fallback counter exactly once.

No client/browser code changes in this phase.


#### 3G.16 — split live human fallback telemetry from historical ambient diagnostics
After 3G.15, delegated fallback behavior lived in the Human Director but its two live counters still lived inside the old `v37AdaptiveAmbientStats` object initialized by the human-only residual. That left behavior and telemetry owned by different layers.

3G.16 gives the Human Director a dedicated `v37HumanFallbackStats` object with:
- `humanModelFallbacks`;
- `humanModelFallbackMisses`.

The delegated fallback helper now mutates those Director-owned counters. The human-only residual's `v37AdaptiveAmbientStats` is reduced to the historical ambient-only fields that no longer have live v41 writers.

For compatibility, the legacy `adaptiveAmbientAi` snapshot still exposes `humanModelFallbacks` and `humanModelFallbackMisses`, but reads them from `v37HumanFallbackStats`. This keeps the external diagnostic shape stable while separating live telemetry ownership from historical ambient state.

The 3G.16 source gate proves the Human Director is the only v41 production initializer of the new telemetry object and that the human-only residual no longer initializes the live counters. The real-Worker contract forces a delegated built-in fallback, verifies the Director counter increments exactly once, and verifies the historical snapshot reports the same value.

No client/browser code changes in this phase.


#### 3G.17 — retire the human-only residual boundary
After 3G.16, `index_v41_human_only_compat.js` no longer owned live behavior or live telemetry. Its only remaining production responsibility was a historical diagnostics shell:
- initializing the obsolete adaptive-ambient timestamp/counters retained for compatibility;
- adding legacy human-only status flags to `/api/health`, `/api/everything`, and `/api/full-status`;
- preserving the historical `adaptiveAmbientAi` snapshot shape while bridging the two live fallback counters from the Human Director.

3G.17 extracts that shell into `human_only_legacy_diagnostics_v41.js` and makes `index_v41_free_providers_compat.js` inherit/fetch directly from `index_v41_production_turn_compat.js`. 3G.19 later removes the obsolete room-state allocation from this helper while preserving its output.

The helper owns only historical status/snapshot shaping. After 3G.19 it exports:
- immutable `V37_RETIRED_ADAPTIVE_AMBIENT_STATS` for the frozen zero-valued ambient telemetry payload;
- `mergeV37HumanOnlyStatus(data)`;
- `mergeV37HumanOnlySnapshot(room, base)`.

It no longer initializes `v37LastAmbientAiAt` or `v37AdaptiveAmbientStats` on live room instances.

No production file imports `index_v41_human_only_compat.js` after this phase. 3G.18 subsequently deletes that obsolete v41 residual source; frozen v37-v40 lineage files remain available for historical checks.

The 3G.17 source gate proves the residual path is absent from the actual v41 production spine and directly verifies the helper's compatibility output. Superseded human-only Worker probes are retired rather than allowing historical mode flags to override higher live lively-ambient authority.

No client/browser code changes in this phase.


#### 3G.18 — delete the retired v41 human-only source
After 3G.17, `index_v41_human_only_compat.js` had no production dependency edge and no unique compatibility responsibility. Keeping the file solely so older proof scripts could inspect it created a second, stale representation of diagnostics already owned by `human_only_legacy_diagnostics_v41.js`.

3G.18 deletes `src/index_v41_human_only_compat.js` entirely.

The proof chain is updated to use:
- frozen `index_v37_human_only.js` for original v37 lineage and byte-equivalence evidence;
- live v41 owners for behavior and telemetry ownership;
- `human_only_legacy_diagnostics_v41.js` for historical status/snapshot compatibility.

The dedicated 3G.18 gate requires:
- the retired v41 source to be absent;
- the frozen v37 source to remain;
- the free-provider owner to inherit directly from production-turn and compose the diagnostics helper;
- `check:v41` to stop syntax-checking the deleted file;
- prior 3G.1/3G.5/3G.13–3G.17 proof scripts to stop reading the deleted source.

No production behavior or client/browser code changes in this phase.


#### 3G.19 — retire obsolete adaptive-ambient diagnostic room state
After 3G.18, the remaining human-only compatibility helper still allocated two pieces of state on every live v41 room solely to reproduce an old diagnostic surface:
- `v37LastAmbientAiAt = 0`;
- `v37AdaptiveAmbientStats` containing eight counters that no longer had any live v41 writer.

Those fields were historical data, not live authority. Their observable production values were permanently the same: every ambient counter remained zero and `lastAmbientAiAgoMs` remained `null`.

3G.19 removes that room-state allocation. The helper now renders the historical payload from immutable `V37_RETIRED_ADAPTIVE_AMBIENT_STATS` and continues bridging the two live Human Director fallback counters from `v37HumanFallbackStats`.

Preserved external compatibility:
- all eight historical ambient counters remain present and zero-valued in `adaptiveAmbientAi`;
- `humanModelFallbacks` and `humanModelFallbackMisses` still reflect the live Human Director telemetry;
- preferred-ready providers and historical interval calculation remain unchanged;
- `lastAmbientAiAgoMs` remains `null`;
- legacy human-only mode/status flags remain unchanged.

The 3G.19 source gate proves the helper and free-provider constructor no longer read or write the retired room fields. The real-Worker contract proves the fields are absent on a production room while the historical snapshot/status payload remains intact.

No client/browser code changes in this phase.


#### 3G.20 — freeze the wrapper-retired v41 production spine
With 3G.19 complete, every behavioral responsibility formerly carried by the v37 wrapper stack has a named v41 owner, the v41 human-only and hotfix residual sources are deleted, and the remaining human-only diagnostics helper is stateless.

3G.20 is a **closure/freeze phase**, not another behavior extraction. It records the exact v41 inheritance spine from `index_v41_generation_contract.js` down to the intentional frozen `index_v37.js` baseline and fails if a retired wrapper is reintroduced as a production parent.

The closure gate forbids production imports of these retired wrapper boundaries:
- `index_v40_scene_continuity.js`;
- `index_v39_world_gate.js`;
- `index_v39_presence_fix.js`;
- `index_v39_coherence.js`;
- `index_v38_quality_guard.js`;
- `index_v37_lively_ambient.js`;
- `index_v37_human_director.js`;
- `index_v37_free_providers.js`;
- `index_v37_human_only.js`;
- `index_v37_hotfix.js`.

Those frozen files remain in the repository for v37-v40 lineage and byte-equivalence evidence.

The gate also freezes the bounded set of direct `index_v37.js` callers used by extracted v41 authorities for explicit baseline method delegation. No other v41 production file may silently add a direct baseline dependency.

This closes the Phase 3G wrapper-retirement program. Further work should start from the named v41 owners rather than reopening the retired wrapper chain.

No production behavior or client/browser code changes in this phase.


## Retirement rule

A wrapper can be retired only when:

1. every live method it owns is listed in this map;
2. each responsibility has a named replacement owner;
3. exact runtime/browser regressions cover the replacement;
4. production dispatch no longer depends on the old override;
5. frozen v35–v41 checks and Worker contracts remain green.

Version age is not evidence that a wrapper is dead.
