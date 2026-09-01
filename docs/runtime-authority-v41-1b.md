# v41 Phase 1B Scene Lifecycle Authority

Base: `main` after Phase 1A merge `e634f16ce7dabb367797733c57bb06254f91a38d`.

Phase 1B retires duplicate **production** scene-lifecycle decision-making without changing scene identity. `src/index_v17.js` still owns scene IDs, sceneBoard hydration, message-to-scene association, open-question state, and the age/storage lifecycle.

## Production authority

`src/index_v41_scene_coordinator.js` exposes one hook:

`sceneLifecycleAuthority() -> SceneCoordinator`

The inherited scene layers ask for that authority before making a lifecycle decision. On the deployed v41 class, SceneCoordinator therefore owns:

- ambient momentum eligibility and human-ownership exclusion;
- 8/12/15-turn fatigue interpretation;
- v40 carry selection;
- v37 exhausted-ambient closes;
- v38 room-topic-fatigue closes;
- v37 direct-human replace/pivot closes;
- closed-scene continuation/resurrection vetoes;
- v26 completed-background fatigue closes.

The old layers still own their historical counters, cooldown bookkeeping, and broadcast action names so production captures remain comparable.

## Legacy fallbacks

v26/v37/v38/v40 keep their pre-v41 decision code only as a standalone fallback when `sceneLifecycleAuthority()` is absent. This is deliberate: the frozen Phase 0 v40 Worker contracts can continue to execute the old stack directly, while the v41 production class has only one decision authority.

This means the old code is no longer a second production vote.

## Explicit non-goals

Phase 1B does not:

- replace or renumber v17 scene IDs;
- migrate Durable Object storage;
- change provider routing or add model calls;
- change the v40 seven-turn ambient carry cap;
- change the v26/v37 8/12/15 fatigue thresholds;
- change v38's three-minute room-topic cooldown;
- fix the Director-to-Voice semantic-completeness gap.

## Runtime proof

The Phase 0 v40 workerd characterization remains frozen. The v41 workerd suite now also exercises delegation through inherited v26, v37, v38, and v40 methods so a top-level SceneCoordinator override cannot accidentally hide competing lower-layer logic.

## Next boundary

Scene identity/association remains high blast radius. Do not redesign v17 scene identity until the 1B delegated production path remains green under real room captures. Any later identity work should preserve the same Worker contracts first, then migrate association behavior separately.
