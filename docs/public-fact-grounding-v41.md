# v41 generic public-fact grounding

## Why this exists

A real Town Square session exposed a general truth problem. The conversation was about *Independence Day*, the user asked who starred in it, and the character model supplied unrelated actors. When challenged, it tried to escape the error by claiming another movie had been intended.

That was not fundamentally an *Independence Day* bug. The character Voice model was being asked to serve as both a personality engine and a factual database. The fix is to separate those responsibilities.

**Independence Day is now only a regression fixture. There is no production movie or actor catalog.**

## Architecture

Direct recognized public-fact questions now pass through a generic structured grounding layer above the frozen v41 generation contract:

1. Detect the factual relation being asked for.
2. Resolve an explicit subject from the human message, or use the Director subject/recent conversation when the human says “that” or “it.”
3. Resolve the subject and relation through Wikidata’s structured API.
4. Require an exact label/alias search match and an entity that actually carries the requested relation.
5. Check the subject against the simulated-date boundary.
6. For historically mutable relations, require statement-level temporal evidence rather than importing current state.
7. Give the verified fact packet to the existing character Voice plan.
8. Validate the generated surface before display so the model cannot add an unsupported name/date/company.
9. If validation fails, use the existing deterministic primary-response fallback slot with the verified structured fact.
10. If the source cannot verify the fact safely, fail closed to natural uncertainty instead of guessing.

No extra LLM/judge-model call is added. The additional work is structured-data lookup only.

## Structured source

The source is the Wikidata Wikibase API (`wbsearchentities` + `wbgetentities`). Resolver results are cached in the Durable Object instance to avoid repeated lookups for the same subject/relation.

Production code contains property/relation definitions, not entity facts.

Current supported relation families include:

- cast member (`P161`)
- director (`P57`)
- release/publication date (`P577`)
- performer (`P175`)
- writer/screenwriter/lyrics (`P50`, `P58`, `P676`)
- composer (`P86`)
- producer (`P162`)
- software/game developer (`P178`)
- publisher (`P123`)
- platform (`P400`)
- manufacturer (`P176`)
- creator (`P170`)
- founder (`P112`)
- inception/founding date (`P571`)
- date of birth (`P569`)
- place of birth (`P19`)
- winner (`P1346`)
- country of origin (`P495`)

The registry is intentionally extensible: adding another safe fact type means adding a relation definition, not hard-coding every movie/song/game/person.

## Historical safety

Wikidata describes the present-day knowledge graph, while this room is sealed to 1996. The resolver therefore does not treat “Wikidata says X now” as automatically safe for the room.

For a resolved subject, the runtime requires a historical availability date such as release/publication, inception, start/point-in-time, or birth date. If the subject cannot be shown to exist by the simulated date, the fact is unavailable.

For relations whose values can grow/change over time, the relation may require statement-level dates. The first implemented example is game/platform support: a 1997 port cannot appear in a 1996 answer simply because the modern Wikidata item lists that platform today.

Recognized mutable/current questions that do not yet have safe temporal semantics—such as current CEO/manager, current price, population, budget, and similar facts—are deliberately forced to uncertainty rather than querying modern state.

## Entity resolution

Fuzzy guesses are not accepted as truth. A search candidate must match the requested subject by exact normalized label, exact alias, or exact Wikidata search match. If several entities share a label, the resolver chooses an exact candidate that actually exposes the requested property.

This is important for ambiguous names: a film and a holiday may share a label, but only the film carries a cast relation.

An explicit subject in the current human question always takes priority over recent chat. “Who stars in Mystery Movie XYZ?” cannot inherit facts from a previously discussed movie.

## Surface validation

A verified fact packet is not merely put into the prompt and trusted. The first generated reply is checked before display.

For structured entity facts, the surface must contain the required verified value(s) and may not introduce arbitrary extra factual names/tokens. Cast answers require multiple verified cast members when the source has them, preventing mixed surfaces such as “Will Smith and Al Pacino.”

For time-valued facts, the verified date tokens must be present; contradictory or extra unsupported values fail closed.

A factual challenge remains bound to the same subject and relation. “I meant another movie” cannot satisfy a correction obligation.

## Source failure and unknown facts

A timeout, HTTP error, ambiguous entity, missing requested property, missing historical evidence, or unsupported relation never authorizes the model to fill in the blank from memory.

The character may still respond naturally, but only with tightly constrained uncertainty such as “not sure, i dont wanna make that up.” A hedged guess such as “not sure, but Tom Hanks…” is rejected.

## Test strategy

CI uses a fake Wikidata service so correctness does not depend on the public network. The fixture spans unrelated domains:

- *Independence Day* cast — regression for the reported incident
- *Enter Sandman* performer
- *Quake* developer and historically filtered platforms
- Apple Computer founders
- a post-1996 future title
- ambiguous same-label entities
- source outage
- recognized unsupported/current-role facts

The real Worker contract runs the actual final public-fact wrapper and proves the generic authority composes with the existing v41 Voice/generation/fallback stack.

## Preserved behavior

- The frozen lower generation-contract implementation remains byte-for-byte at its pre-incident production version.
- Existing provider ordering/failover is unchanged.
- Background ambient chat does not perform public-fact lookups.
- Scene, reconnect, persistence, browser capture, and O1–O5 behavior are unchanged.
- No extra provider/judge-model call is introduced.
- If the structured fact source is down, chat continues safely with uncertainty.
