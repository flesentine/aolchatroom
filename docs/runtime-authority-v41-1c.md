# v41 Phase 1C Scene Identity Authority

Base: `main` after Phase 1B merge `1ecc3be9f5a47e2cb6f191a1261ff805e4bf6531`.

Phase 1C changes **scene association**, not the scene storage model. The production v41 class now asks `SceneCoordinator` which existing scene, if any, owns a new message. `src/index_v17.js` still owns scene creation, ID generation, sceneBoard hydration, touch/update state, open questions, attention, and age/storage lifecycle.

## Why the v17 fuzzy matcher was replaced in production

The legacy v17 fallback used two first-match rules after explicit `sceneId` and `replyTo`:

1. a targeted message could join the first recent row involving the target, the speaker, or somebody who targeted the target;
2. otherwise the first recent open scene with the same coarse topic could claim the line.

Those rules were useful early in the simulator, but they can merge simultaneous conversations simply because both are `gaming`, or pull a newcomer addressing one participant into that participant's unrelated existing exchange.

Phase 1C leaves the legacy matcher present for the frozen standalone v40 characterization, but the deployed v41 class bypasses it.

## Association order

SceneCoordinator now resolves identity in this order:

1. `_v37ForceNewScene` — hard no-association boundary for Human Director replace/pivot moves;
2. explicit `sceneId` — hard structural anchor, including v25/v40 carry;
3. `replyTo` parent scene — hard conversational ownership anchor;
4. scored fuzzy association across currently open v17 scenes;
5. no association — lets the existing v17 `canStartScene()` / `makeScene()` logic decide whether to create a new scene.

A structural anchor that points to a missing/expired scene is not silently fuzzy-remapped into a different live scene.

## Scored fuzzy evidence

The scorer considers:

- exact speaker/target pair ownership;
- whether the speaker and/or target are already participants;
- recent direct pair traffic;
- open-question ownership;
- recency;
- lexical overlap with recent scene text/open question;
- same coarse topic;
- continuation/reaction intent;
- whether a room-target line looks like a fresh ambient/new-topic starter.

A coarse topic by itself is below threshold. Target presence by itself is below threshold. Near-tied weak candidates are rejected as ambiguous instead of choosing whichever scene happened to be encountered first.

## Preserved contracts

Phase 1C does not change:

- the v17 scene object shape or ID format;
- retained message `sceneId` fields;
- Durable Object storage/hydration behavior;
- `MAX_OPEN_SCENES` or v17 scene creation policy;
- v40's seven-turn carry cap;
- v41 8/12/15 fatigue thresholds;
- v38 topic cooldown duration;
- provider routing or provider call count;
- Phase 1B lifecycle delegation;
- the known Director-to-Voice semantic-completeness gap.

## Runtime proof

The frozen v40 workerd characterization remains unchanged at 11 contracts. The v41 real-Worker suite adds identity cases for:

- direct pair ownership with two simultaneous `gaming` scenes;
- rejecting target-only scene hijacking;
- splitting a fresh same-topic subject into a new v17-created scene;
- preserving exact `replyTo` ownership;
- rejecting ambiguous weak same-topic candidates;
- preserving explicit v40 carry scene IDs.

The existing lifecycle/delegation contracts continue to run in the same suite.

## Next boundary

After 1C is validated in production captures, scene identity should no longer be a reason to add another version wrapper. The next planned behavior work is the Director-to-Voice semantic contract, unless production telemetry reveals a concrete identity regression first.
