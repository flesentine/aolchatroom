# v41 public-media fact grounding

## Incident

A real Town Square session exposed a factual-repair failure around *Independence Day*. A user asked who starred in the movie. The generated answer supplied two actors who were not in the film, and the subsequent repair tried to escape the error by claiming a different movie had been intended.

The existing historical guard was doing a different job: it knew whether a public event or title was historically available at the simulated cutoff, but it did not carry authoritative cast/director facts. The semantic generation contract could prove that an answer occupied the right reply slot, but not that actor names were true.

## Policy

Direct public-media detail questions now have a sealed factual lane at the final v41 human Voice boundary.

For a recognized cast, director, or release question:

1. Resolve the media title from the human turn or recent chat.
2. Check whether the title is historically available at the simulated date.
3. If trusted metadata exists, add that fact packet to the normal Voice plan.
4. Validate the generated surface before display.
5. If the surface is ungrounded, reject it without another provider call and use the existing deterministic primary-response fallback slot.
6. If trusted metadata is absent, confident invented detail fails closed to natural uncertainty.

A factual challenge is treated as repair, not as permission to rewrite history. A response such as “I meant another movie” does not satisfy the repair contract unless the actual factual answer is grounded.

## Trusted Independence Day metadata

The initial trusted fact packet is deliberately narrow:

- Title: *Independence Day*
- Principal cast: Will Smith, Jeff Goldblum, Bill Pullman
- Director: Roland Emmerich
- Runtime historical availability date: July 3, 1996, matching the project’s existing historical timeline boundary

The cast/director values were checked against the American Film Institute catalog before being added. The runtime date remains aligned with the project’s already-frozen historical timeline rather than introducing a second date convention.

## Cast validation

A known cast answer is intentionally conservative. It must contain multiple trusted cast names and may contain only trusted name/title tokens plus ordinary conversational glue. This prevents partially correct answers from smuggling an invented actor through the gate, for example “Will Smith and Al Pacino.”

If a natural provider answer is too loose for that conservative validator, the deterministic fallback supplies the trusted principal cast instead of guessing.

## Scope

This is not a general claim that the runtime has a complete movie database. The catalog contains only titles needed for safe historical-title resolution, and trusted detail metadata is added only when independently verified.

Unknown cast/director/release questions are still answerable conversationally, but the bot must admit uncertainty rather than fabricate names or dates.

Ambiguous one-word titles are intentionally excluded from recent-chat title inference unless a later design can disambiguate them safely.

## Preserved behavior

- No extra judge-model/provider call is added.
- The existing required speaker/target primary-response ownership remains authoritative.
- Existing era/world guards remain authoritative.
- Background lively chat is not converted into a factual lookup system.
- Existing provider ordering, failover, persistence, and reconnect behavior are unchanged.

## Qualification

The regression suite covers:

- the exact “who stars in that” recent-title shape;
- the original wrong Keanu Reeves/Al Pacino answer;
- mixed correct/incorrect cast answers;
- invented replacement-title repair;
- grounded correction;
- unknown-media uncertainty;
- historically unavailable title uncertainty;
- a real Worker contract through the production v41 room class.

The real Worker generation-contract suite advances from 53 to 54 contracts.
