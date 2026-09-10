import baseWorker, { RuntimeGenerationContractRoom as PublicFactRuntimeRoom } from "./runtime_generation_contract_worker_public_fact.js";
import { AmbiguitySafeWikidataPublicFactResolver } from "../src/public_fact_ambiguity_guard_v41.js";
import { evaluatePublicFactSurface } from "../src/public_fact_grounding_v41.js";
import { makeFakeWikidataFetch } from "./public_fact_wikidata_fixture.js";
import { makeSameTitleAmbiguityFetch } from "./public_fact_ambiguity_fixture.js";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export class RuntimeGenerationContractRoom extends PublicFactRuntimeRoom {
  installPublicFactRuntime() {
    this.v41PublicFactResolver = new AmbiguitySafeWikidataPublicFactResolver({
      fetcher: makeFakeWikidataFetch({ calls: this.publicFactFixtureCalls }),
      timeoutMs: 500
    });
    this.v41PublicFactStats = {
      requestsDetected: 0,
      sourceResolved: 0,
      sourceUnresolved: 0,
      sourceUnavailable: 0,
      providerSurfacesAccepted: 0,
      providerSurfacesRejected: 0,
      groundedFallbacks: 0,
      uncertaintyFallbacks: 0,
      challengeRationalizationsBlocked: 0
    };
    this.v41LastPublicFactScope = null;
    this.v41LastPublicFactGrounding = null;
  }

  async contractPublicFactGrounding() {
    const result = await super.contractPublicFactGrounding();

    const resolver = new AmbiguitySafeWikidataPublicFactResolver({
      fetcher: makeSameTitleAmbiguityFetch(),
      timeoutMs: 500
    });
    const scope = await resolver.resolve({
      type: "fact-question",
      relation: "director",
      subjectCandidates: ["Collision Title"],
      explicitSubject: true,
      source: "worker-ambiguity-regression"
    }, "1996-09-09");

    equal(scope?.status, "unresolved", "same-title relation collision must not become trusted fact");
    equal(scope?.reason, "source-ambiguous-entity", "same-title relation collision must have explicit ambiguity reason");
    equal(scope?.trusted, false, "ambiguous subject must not be trusted");
    equal(evaluatePublicFactSurface(scope, "director one directed collision title").ok, false, "ambiguous source must reject a confident answer");
    equal(evaluatePublicFactSurface(scope, "not sure, i dont wanna make that up").ok, true, "ambiguous source must preserve natural uncertainty");

    const snapshot = resolver.snapshot();
    equal(snapshot.ambiguity?.exactSameLabelRelationCollisionFailsClosed, true, "resolver status must expose ambiguity fail-closed policy");
    ensure(Number(snapshot.ambiguity?.stats?.ambiguous || 0) >= 1, "ambiguity telemetry must count the collision");

    return {
      ...result,
      sameTitleRelationCollisionBlocked: true,
      ambiguityReason: scope.reason,
      ambiguityCandidates: scope.candidateEntityIds || []
    };
  }
}

export default baseWorker;
