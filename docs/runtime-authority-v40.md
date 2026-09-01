# v40 Runtime Authority Map

Baseline: `main` at `e21b3d6b5800fbb4018aab77301739a7af197fe5`.

This document describes the **effective production responsibilities** before v41 consolidation work. It is intentionally organized by behavior rather than version number. A version wrapper should not be retired until every live responsibility it owns has moved behind an equivalent contract test.

## Active deployed chain

`index_v40_scene_continuity.js`
→ `index_v39_world_gate.js`
→ `index_v39_presence_fix.js`
→ `index_v39_coherence.js`
→ `index_v38_quality_guard.js`
→ `index_v37_lively_ambient.js`
→ `index_v37_human_director.js`
→ `index_v37_free_providers.js`
→ `index_v37_human_only.js`
→ `index_v37_hotfix.js`
→ earlier v37/v36/v35/.../base layers.

The chain is not itself the desired architecture. This map exists so consolidation can proceed by responsibility without accidentally deleting live behavior from an old wrapper.

## Authority by responsibility

| Responsibility | Effective current owner / pipeline | Important inherited or superseded behavior |
| --- | --- | --- |
| Durable Object base state, retained history, WebSocket surface | `src/index.js` | All higher layers depend on its history/social/presence primitives. |
| Scene storage and identity | `src/index_v17.js` | `sceneBoard`, hydration from retained history, scene matching, creation, touch, open questions, attention/focus. |
| Scene-plan queue and human-interrupt discard | `src/index_v20.js` | Creates plan IDs/revisions and discards queued future on human interruption. |
| Brain/Voice split | `src/index_v22.js` | Voice preserves speaker/target/intent/topic mechanically but currently does not validate semantic completeness against `brainMeaning`. |
| Legacy scene fatigue | `src/index_v26.js` | Warn/strong/close thresholds at 8/12/15 turns plus topic cooldown. |
| Server liveness and Durable Object alarms | `src/index_v36.js` | Stable infrastructure; should remain untouched during early conversation refactors. |
| Production turn singleflight / replay coalescing | `src/index_v37_hotfix.js` | Also contains provider-degraded fallback, Workers quota handling, output hygiene, and paused legacy shadow machinery. |
| Provider capacity constrained decision | `src/index_v37_human_only.js` | Its adaptive two-line ambient generator is superseded, but `providerCapacityConstrained()` remains live. |
| Provider ordering and extended provider implementations | `src/index_v37_free_providers.js` + `src/free_provider_pool_v37.js` | Effective ambient priority is Gemini → Mistral → Groq → Vercel. |
| Direct-human semantic decision | `src/index_v37_human_director.js` | Authoritative Director bypasses legacy multi-move planner for locked direct-human turns. |
| Routine ambient generation | `src/index_v37_lively_ambient.js` | Authoritative lively burst generator; also independently closes 15-turn scenes and blocks closed-scene resurrection. |
| Room-wide topic fatigue and hard era gate | `src/index_v38_quality_guard.js` | Can close scenes and remove background lines before lower queueing. |
| Clarification repair, coherence Voice lock, bot re-entry cooldown, reconnect grace | `src/index_v39_coherence.js` | Multiple unrelated responsibilities currently share one version wrapper. |
| Logical human presence, same-name replacement, relative-date checks, qbg suppression, error-challenge repair | `src/index_v39_presence_fix.js` | `humanNames()` is authoritative logical presence. Old v11 quick-background reachability is suppressed here rather than removed. |
| Final public-world/product gate and console-label normalization | `src/index_v39_world_gate.js` | Top `lineViolation()` layer before v40. |
| Ambient momentum interpretation and post-queue scene carry | `src/index_v40_scene_continuity.js` + `src/scene_continuity_v40.js` | Does not own scene identity. Reads existing scene IDs, augments the lively prompt, and retrofits carry metadata after lower queue filters run. |

## Critical method ownership

| Method / concept | Current effective behavior |
| --- | --- |
| `tick()` / `alarm()` | v37 hotfix singleflight wrapper; delegates into inherited scheduler/liveness machinery. |
| `generateBackgroundPlan()` | v37 lively ambient is authoritative for routine ambient AI. |
| `livelyAmbientPrompt()` | v40 wraps v38, which wraps v37 lively; dynamic dispatch means the v40 momentum lock reaches the real provider call. |
| `generateHumanReplan()` | v37 Human Director for locked direct-human turns, otherwise inherited fallback paths. |
| `voiceBrainPlan()` | v39 presence/error-challenge wrapper → v39 coherence wrapper → v22 Voice implementation. |
| `queueScenePlan()` | v40 momentum snapshot/carry → v39 self-dialogue filter → v38 topic-fatigue filter/close → lower validation/planning → v20 queue creation; v40 then annotates surviving plan items. |
| `sceneForMessage()` | v37 lively closed-scene protection wraps v37 Human Director pivot handling, then inherited v17 scene lookup. |
| `humanNames()` | v39 presence fix logical screen-name deduplication. |
| `orderedReadyProviders()` | v37 free-provider layer. |
| `providerCapacityConstrained()` | v37 human-only/adaptive layer remains the live override. |
| `lineViolation()` | v39 world gate → v39 presence historical-date mismatch → v39 coherence future-event gate → v38 era gate → lower public-world/era validation. |
| `webSocketClose()` | v39 presence marks socket logically pending, then v39 coherence owns reconnect grace and eventual committed close. |

## Known architecture tensions captured by PR A

1. **Scene decisions are split across time, turn count, topic fatigue, human ownership, and v40 carry policy.** The first consolidation target should be one scene-decision authority while preserving v17 storage initially.
2. **v40 prompt wiring is live.** A zero `momentumPromptLocks` count means no eligible momentum existed when actual lively generation reached the prompt, not that the override was bypassed.
3. **Queue state can change underneath v40's pre-queue momentum snapshot.** v39/v38 filters and closures run after v40 computes momentum and before v40 annotates surviving items.
4. **Some wrappers are partially obsolete rather than fully obsolete.** Example: `index_v37_human_only.js` has a superseded ambient generator but still owns a live capacity decision.
5. **The current Voice contract is structural, not semantic.** A short line such as `nah` can preserve the Director's routing metadata while failing to express all intended meaning.
6. **SceneBoard is reconstructed from retained message history.** Early SceneManager work can preserve the existing message schema and avoid a Durable Object storage migration.

## Retirement rule

Do not remove a version wrapper because its version number is old. Remove it only after every live responsibility listed above has been extracted, redirected to the new responsibility owner, and covered by an executable runtime contract.
