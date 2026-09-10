import assert from "node:assert/strict";
import fs from "node:fs";
import {
  WikidataPublicFactResolver,
  deterministicPublicFactLine,
  evaluatePublicFactSurface,
  planWithPublicFactGrounding,
  publicFactPolicySnapshot,
  publicFactRequest
} from "../src/public_fact_grounding_v41.js";
import {
  recognizedUnsupportedPublicFact,
  unsupportedPublicFactScope
} from "../src/public_fact_unsupported_guard_v41.js";
import { makeFakeWikidataFetch } from "../test/public_fact_wikidata_fixture.js";

const ERA = "1996-09-09";
const plan = (subject, speaker = "Sk8rGuy16") => ({
  provider: "gemini",
  reason: "v37-human-director",
  subject,
  goal: "answer the human factual question",
  moves: [{ speaker, target: "Crateman", intent: "answer", topic: "general", meaning: "answer the factual question" }]
});
const human = (text, target = "Sk8rGuy16", id = text) => ({
  kind: "human",
  from: "Crateman",
  target,
  text,
  messageId: `fact-${id}`,
  at: Date.now()
});

const calls = [];
const resolver = new WikidataPublicFactResolver({
  fetcher: makeFakeWikidataFetch({ calls }),
  timeoutMs: 500
});

// Regression incident: the movie is only a fixture. Production code contains no movie catalog.
const movieHistory = [{
  kind: "bot",
  from: "MacAddict",
  target: "Crateman",
  text: "Independence Day is still pulling in crowds",
  at: Date.now() - 1000
}];
const castHuman = human("who stars in that", "Sk8rGuy16", "id4-cast");
const castRequest = publicFactRequest({ human: castHuman, plan: plan("Independence Day"), history: movieHistory });
assert.equal(castRequest?.relation, "cast");
assert.equal(castRequest?.subjectCandidates?.[0], "Independence Day", "Director subject must remain the authoritative first referent");
assert.equal(castRequest?.subjectCandidates?.filter((subject) => subject === "Independence Day").length, 1, "authoritative subject must not be duplicated by fallback context");
const castScope = await resolver.resolve(castRequest, ERA);
assert.equal(castScope?.status, "resolved");
assert.equal(castScope?.source, "wikidata");
assert.equal(castScope?.sourceEntityId, "QID4", "relation-bearing film must beat same-label holiday entity");
assert.deepEqual(castScope.values.map((row) => row.display), ["Will Smith", "Jeff Goldblum", "Bill Pullman"]);
assert.equal(evaluatePublicFactSurface(castScope, "keanu reeves and al pacino").ok, false);
assert.equal(evaluatePublicFactSurface(castScope, "will smith and al pacino").ok, false);
assert.equal(evaluatePublicFactSurface(castScope, "will smith and jeff goldblum").ok, true);

const groundedPlan = planWithPublicFactGrounding(plan("Independence Day"), castScope);
assert.ok(groundedPlan.goal.includes("VERIFIED PUBLIC FACT"));
assert.ok(groundedPlan.goal.includes("Will Smith"));
const castFallback = deterministicPublicFactLine(castScope, { speaker: "Sk8rGuy16", target: "Crateman" });
assert.equal(evaluatePublicFactSurface(castScope, castFallback.text).ok, true);
assert.ok(/will smith/i.test(castFallback.text));
assert.ok(/bill pullman/i.test(castFallback.text));

// Music is resolved by the same engine and source, with no song-specific production code.
const songHuman = human("who sings Enter Sandman", "MetallicaFan", "song");
const songRequest = publicFactRequest({ human: songHuman, plan: plan("Enter Sandman", "MetallicaFan"), history: [] });
assert.equal(songRequest?.relation, "performer");
const songScope = await resolver.resolve(songRequest, ERA);
assert.equal(songScope?.status, "resolved");
assert.equal(songScope?.sourcePropertyId, "P175");
assert.deepEqual(songScope.values.map((row) => row.display), ["Metallica"]);
assert.equal(evaluatePublicFactSurface(songScope, "metallica").ok, true);
assert.equal(evaluatePublicFactSurface(songScope, "megadeth").ok, false);

// Games use the same resolver for developer facts.
const gameHuman = human("who developed Quake", "GameDude", "quake-dev");
const gameRequest = publicFactRequest({ human: gameHuman, plan: plan("Quake", "GameDude"), history: [] });
assert.equal(gameRequest?.relation, "developer");
const gameScope = await resolver.resolve(gameRequest, ERA);
assert.equal(gameScope?.status, "resolved");
assert.equal(gameScope?.sourcePropertyId, "P178");
assert.deepEqual(gameScope.values.map((row) => row.display), ["id Software"]);
assert.equal(evaluatePublicFactSurface(gameScope, "id software developed quake").ok, true);

// Historically changing platform relations require statement dates; future ports are filtered.
const platformHuman = human("what systems did Quake come out on", "GameDude", "quake-platform");
const platformRequest = publicFactRequest({ human: platformHuman, plan: plan("Quake", "GameDude"), history: [] });
assert.equal(platformRequest?.relation, "platform");
const platformScope = await resolver.resolve(platformRequest, ERA);
assert.equal(platformScope?.status, "resolved");
assert.deepEqual(platformScope.values.map((row) => row.display), ["DOS"]);
assert.equal(platformScope.values.some((row) => row.display === "Sega Saturn"), false, "1997 port must not leak into 1996");

// Companies use the same relation registry and source.
const founderHuman = human("who founded Apple Computer", "MacAddict", "apple-founder");
const founderRequest = publicFactRequest({ human: founderHuman, plan: plan("Apple Computer", "MacAddict"), history: [] });
assert.equal(founderRequest?.relation, "founder");
const founderScope = await resolver.resolve(founderRequest, ERA);
assert.equal(founderScope?.status, "resolved");
assert.equal(founderScope?.sourcePropertyId, "P112");
assert.ok(founderScope.values.some((row) => row.display === "Steve Jobs"));
assert.ok(founderScope.values.some((row) => row.display === "Steve Wozniak"));

// Explicit subjects beat stale chat context; an unknown title cannot inherit Independence Day facts.
const unknownHuman = human("who stars in Mystery Movie XYZ", "Sk8rGuy16", "unknown");
const unknownRequest = publicFactRequest({ human: unknownHuman, plan: plan("Independence Day"), history: movieHistory });
assert.equal(unknownRequest?.relation, "cast");
assert.deepEqual(unknownRequest?.subjectCandidates, ["Mystery Movie XYZ"]);
const unknownScope = await resolver.resolve(unknownRequest, ERA);
assert.equal(unknownScope?.status, "unresolved");
assert.equal(evaluatePublicFactSurface(unknownScope, "not sure, i dont wanna make that up").ok, true);
assert.equal(evaluatePublicFactSurface(unknownScope, "not sure but tom hanks and nic cage").ok, false, "hedged guesses must fail closed");

// Subject availability is date-gated independently of the provider model.
const futureHuman = human("who stars in Future Movie XYZ", "Sk8rGuy16", "future");
const futureRequest = publicFactRequest({ human: futureHuman, plan: plan("Future Movie XYZ"), history: [] });
const futureScope = await resolver.resolve(futureRequest, ERA);
assert.equal(futureScope?.status, "unavailable");
assert.equal(futureScope?.reason, "subject-not-yet-available");
assert.equal(evaluatePublicFactSurface(futureScope, "tom hanks and nicolas cage").ok, false);
assert.equal(evaluatePublicFactSurface(futureScope, "not sure, i dont wanna make that up").ok, true);

// Factual challenges stay bound to the original subject and cannot rationalize a new one.
Object.assign(castScope, {
  humanFrom: "Crateman",
  requiredSpeaker: "Sk8rGuy16",
  at: Date.now()
});
const challengeHuman = human("i think that's wrong", "Sk8rGuy16", "challenge");
const challengeRequest = publicFactRequest({
  human: challengeHuman,
  plan: plan("Independence Day"),
  history: [...movieHistory, castHuman],
  previousScope: castScope
});
assert.equal(challengeRequest?.type, "fact-challenge");
assert.deepEqual(challengeRequest?.subjectCandidates, ["Independence Day"]);
const challengeScope = await resolver.resolve(challengeRequest, ERA);
assert.equal(evaluatePublicFactSurface(challengeScope, "dude i meant another movie").ok, false);
assert.equal(evaluatePublicFactSurface(challengeScope, "yeah you're right, my bad, will smith and jeff goldblum are in independence day").ok, true);

// Source failure never authorizes model memory.
const downResolver = new WikidataPublicFactResolver({
  fetcher: makeFakeWikidataFetch({ failAll: true }),
  timeoutMs: 500
});
const downScope = await downResolver.resolve(songRequest, ERA);
assert.equal(downScope?.status, "unresolved");
assert.equal(downScope?.reason, "source-error");
assert.equal(evaluatePublicFactSurface(downScope, "metallica").ok, false);
assert.equal(evaluatePublicFactSurface(downScope, "not sure, i dont wanna make that up").ok, true);

// Cache prevents repeated structured-source work for the same subject/relation.
const beforeHttp = resolver.snapshot().stats.httpRequests;
await resolver.resolve(castRequest, ERA);
const afterCached = resolver.snapshot();
assert.equal(afterCached.stats.httpRequests, beforeHttp, "cached public facts must not repeat HTTP requests");
assert.ok(afterCached.stats.cacheHits >= 1);

// Obvious mutable/current facts are recognized and forced to uncertainty until temporal support exists.
assert.equal(recognizedUnsupportedPublicFact("who is the current CEO of Apple"), true);
const unsafeScope = unsupportedPublicFactScope({ human: human("who is the current CEO of Apple", "MacAddict", "ceo"), eraDateKey: ERA });
assert.equal(unsafeScope?.status, "unresolved");
assert.equal(evaluatePublicFactSurface(unsafeScope, "gil amelio").ok, false);
assert.equal(evaluatePublicFactSurface(unsafeScope, "not sure, i dont wanna make that up").ok, true);

const policy = publicFactPolicySnapshot();
assert.equal(policy.source, "wikidata");
assert.ok(policy.relations.length >= 15, "generic registry must cover multiple public-fact domains");
assert.equal(policy.relations.some((row) => row.key === "cast" && row.properties.includes("P161")), true);
assert.equal(policy.relations.some((row) => row.key === "performer" && row.properties.includes("P175")), true);
assert.equal(policy.relations.some((row) => row.key === "developer" && row.properties.includes("P178")), true);

// Production must contain no Independence Day/actor catalog: that data belongs only to this fixture.
const production = fs.readFileSync(new URL("../src/index_v41_public_fact_grounding.js", import.meta.url), "utf8");
const generic = fs.readFileSync(new URL("../src/public_fact_grounding_v41.js", import.meta.url), "utf8");
for (const forbidden of ["Independence Day", "Will Smith", "Jeff Goldblum", "Bill Pullman", "Roland Emmerich"]) {
  assert.equal(production.includes(forbidden), false, `production wrapper must not hardcode ${forbidden}`);
  assert.equal(generic.includes(forbidden), false, `generic resolver must not hardcode ${forbidden}`);
}
assert.ok(production.includes("new WikidataPublicFactResolver"));
assert.ok(production.includes("planWithPublicFactGrounding"));
assert.ok(production.includes("evaluatePublicFactSurface"));
assert.ok(production.includes("recognizedUnsupportedPublicFactsFailClosedToUncertainty: true"));

console.log("v41 generic public fact grounding checks passed");
