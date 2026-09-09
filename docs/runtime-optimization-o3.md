# Runtime optimization O3 — provider readiness snapshots

Baseline: post-O2 main `bd7aebe4a03c5d992cbb4f17dc1034c9e2a1500c`.

## Goal

Stop repeating the same configured-provider, hard-readiness, and soft-readiness scans several times during one production-turn decision while preserving all existing provider ordering, degradation, capacity, cooldown, and Workers-AI structured-generation semantics.

## Scope

O3 opens a transient readiness cache when `runV37BaseProductionTurn()` begins and closes it in the same method's `finally` block.

The cache is deliberately keyed by:
- exact readiness decision timestamp for configured/hard/soft state;
- exact timestamp plus `v35StructuredGenerationDepth` for effective/ordered state.

This means repeated classification calls at the same decision time share one provider evaluation, while:
- a later timestamp recomputes readiness normally;
- a structured-generation depth change recomputes only the derived ordering;
- provider failure, output rejection, or provider success/recovery invalidates the active cache immediately;
- no readiness state survives the production turn.

## Preserved behavior

The final v41 free-provider layer still owns:
- extended configured-provider discovery;
- hard and soft readiness;
- ambient-ready priority;
- effective/ordered extended provider priority;
- degraded-pool classification;
- capacity-constrained classification;
- the structured Workers-AI boundary.

No provider call, cooldown duration, failure attribution, failover order, ambient policy, or provider budget changes.

## Telemetry

`v37Snapshot().extendedFreeProviders.readinessCache` exposes turn counts, base/derived snapshot builds, cache hits, and active cache-entry counts.

## Qualification

O3 adds:
- standalone timestamp/depth cache regression gate;
- source proof that production turns open and close the cache;
- real Worker provider-semantics contract;
- exact call-count proof that repeated same-time checks evaluate configured/hard/soft readiness only once;
- Worker generation contract total advances from 51 to 52.
