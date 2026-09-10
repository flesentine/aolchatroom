import {
  WikidataPublicFactResolver,
  publicFactPolicySnapshot
} from "./public_fact_grounding_v41.js";

const DEFAULT_VERDICT_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_VERDICTS = 96;

const PROPERTY_IDS = new Map(
  publicFactPolicySnapshot().relations.map((relation) => [relation.key, [...relation.properties]])
);

function clean(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonical(value) {
  return clean(value, 500)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exactSearchMatch(item, subject) {
  const wanted = canonical(subject);
  if (!wanted) return false;
  if (canonical(item?.label) === wanted) return true;
  if (canonical(item?.match?.text) === wanted) return true;
  return (item?.aliases || []).some((alias) => canonical(alias) === wanted);
}

function statementHasValue(statement) {
  return statement?.rank !== "deprecated"
    && statement?.mainsnak?.snaktype === "value"
    && statement?.mainsnak?.datavalue?.value !== undefined;
}

function entityCarriesRelation(entity, propertyIds) {
  if (!entity || entity.missing !== undefined) return false;
  return propertyIds.some((propertyId) => {
    const statements = Array.isArray(entity?.claims?.[propertyId]) ? entity.claims[propertyId] : [];
    return statements.some(statementHasValue);
  });
}

function responseEntities(data) {
  return data?.entities && typeof data.entities === "object" ? data.entities : {};
}

export class AmbiguitySafeWikidataPublicFactResolver extends WikidataPublicFactResolver {
  constructor(options = {}) {
    super(options);
    this.v41AmbiguityVerdictTtlMs = Math.max(60_000, Number(options.ambiguityVerdictTtlMs || DEFAULT_VERDICT_TTL_MS));
    this.v41AmbiguityVerdicts = new Map();
    this.v41AmbiguityStats = {
      checks: 0,
      cacheHits: 0,
      unique: 0,
      ambiguous: 0,
      verificationErrors: 0
    };
  }

  pruneAmbiguityVerdicts() {
    while (this.v41AmbiguityVerdicts.size > MAX_VERDICTS) {
      this.v41AmbiguityVerdicts.delete(this.v41AmbiguityVerdicts.keys().next().value);
    }
  }

  clear() {
    super.clear();
    this.v41AmbiguityVerdicts.clear();
  }

  async ambiguityVerdict(subject, relation, selectedEntityId) {
    const relationKey = clean(relation?.key, 80);
    const propertyIds = PROPERTY_IDS.get(relationKey) || [];
    if (!relationKey || !propertyIds.length || !selectedEntityId) {
      return { ok: false, reason: "source-ambiguity-policy-missing" };
    }

    const cacheKey = `${relationKey}:${canonical(subject)}:${selectedEntityId}`;
    const now = Date.now();
    const cached = this.v41AmbiguityVerdicts.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.v41AmbiguityStats.cacheHits += 1;
      return cached.value;
    }

    this.v41AmbiguityStats.checks += 1;
    let verdict;
    try {
      const searchData = await this.requestJson({
        action: "wbsearchentities",
        search: subject,
        language: "en",
        uselang: "en",
        type: "item",
        limit: 8
      });
      const exact = (searchData?.search || [])
        .filter((item) => item?.id && exactSearchMatch(item, subject))
        .slice(0, 8);
      const exactIds = exact.map((item) => item.id);

      if (exact.length === 1 && exactIds[0] === selectedEntityId) {
        verdict = { ok: true, reason: "source-entity-unique", candidateEntityIds: exactIds };
      } else if (exact.length <= 1) {
        verdict = {
          ok: false,
          reason: "source-selected-entity-unverified",
          candidateEntityIds: exactIds
        };
      } else {
        const entityData = await this.requestJson({
          action: "wbgetentities",
          ids: exactIds.join("|"),
          props: "claims",
          languages: "en"
        });
        const entities = responseEntities(entityData);
        const relationBearing = exactIds.filter((id) => entityCarriesRelation(entities[id], propertyIds));
        verdict = relationBearing.length === 1 && relationBearing[0] === selectedEntityId
          ? { ok: true, reason: "source-relation-disambiguated", candidateEntityIds: relationBearing }
          : {
              ok: false,
              reason: relationBearing.length > 1 ? "source-ambiguous-entity" : "source-selected-entity-unverified",
              candidateEntityIds: relationBearing
            };
      }
      if (verdict.ok) this.v41AmbiguityStats.unique += 1;
      else this.v41AmbiguityStats.ambiguous += 1;
    } catch (error) {
      this.v41AmbiguityStats.verificationErrors += 1;
      verdict = {
        ok: false,
        reason: "source-ambiguity-verification-error",
        error: clean(error?.message || error, 180),
        candidateEntityIds: []
      };
    }

    this.v41AmbiguityVerdicts.set(cacheKey, {
      expiresAt: now + this.v41AmbiguityVerdictTtlMs,
      value: verdict
    });
    this.pruneAmbiguityVerdicts();
    return verdict;
  }

  async lookupSource(subject, relation) {
    const source = await super.lookupSource(subject, relation);
    if (source?.status !== "found") return source;

    const verdict = await this.ambiguityVerdict(subject, relation, source.entityId);
    if (verdict.ok) return source;
    return {
      status: "unresolved",
      reason: verdict.reason,
      subject,
      candidateEntityIds: [...(verdict.candidateEntityIds || [])],
      ...(verdict.error ? { error: verdict.error } : {})
    };
  }

  snapshot() {
    return {
      ...super.snapshot(),
      ambiguity: {
        exactSameLabelRelationCollisionFailsClosed: true,
        selectedEntityMustRemainStableAcrossVerification: true,
        verdictCacheSize: this.v41AmbiguityVerdicts.size,
        verdictTtlMs: this.v41AmbiguityVerdictTtlMs,
        stats: { ...this.v41AmbiguityStats }
      }
    };
  }
}
