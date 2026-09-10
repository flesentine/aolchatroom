const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const SOURCE_NAME = "wikidata";
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 1800;
const MAX_CACHE_ENTRIES = 96;
const MAX_SUBJECT_CANDIDATES = 3;

const PUBLIC_FACT_CHALLENGE = /\b(?:that(?:'s|\s+is)\s+wrong|i\s+think\s+that(?:'s|\s+is)\s+wrong|you(?:'re|\s+are)\s+wrong|are\s+you\s+sure|you\s+sure|not\s+right|got\s+that\s+wrong|how\s+could\s+you\s+mix|mix(?:ed)?\s+that\s+up|we\s+were\s+talking\s+about)\b/i;
const USER_SUBJECT_CORRECTION = /\b(?:no[, ]+)?i\s+meant\s+(.+?)[?.!]*$/i;
const BOT_RATIONALIZATION = /\b(?:i\s+meant|what\s+i\s+meant|meant\s+the|meant\s+another)\b/i;
const CORRECTION = /\b(?:you(?:'re|\s+are)\s+right|my\s+bad|oops|sorry|i\s+got\s+that\s+wrong|i\s+mixed\s+that\s+up|yeah.{0,30}\bwrong)\b/i;
const NEGATION = /\b(?:not|isn'?t|wasn'?t|weren'?t|aren'?t|didn'?t|doesn'?t)\b/i;
const UNCERTAINTY = /\b(?:idk|i\s+don'?t\s+know|dunno|not\s+sure|no\s+idea|couldn'?t\s+tell\s+ya|dont\s+wanna\s+guess|don'?t\s+wanna\s+guess|don'?t\s+wanna\s+make\s+that\s+up|dont\s+wanna\s+make\s+that\s+up|never\s+heard\s+of\s+it)\b/i;
const PRONOUN_SUBJECT = /^(?:that|it|this|that\s+one|this\s+one|that\s+movie|this\s+movie|the\s+movie|that\s+song|this\s+song|that\s+game|this\s+game|that\s+book|this\s+book)$/i;
const GENERIC_PLAN_SUBJECT = /^(?:public[- ]?(?:media|fact)|fact|facts|movie|movies|music|song|songs|game|games|book|books|topic|current topic|same thing|answer|question)$/i;

const FACT_GLUE = new Set([
  "a", "actually", "all", "and", "are", "as", "at", "bad", "by", "came", "come", "created", "developed",
  "did", "directed", "dude", "for", "founded", "from", "he", "i", "in", "is", "it", "its", "made", "my",
  "of", "oh", "on", "opened", "oops", "out", "performed", "published", "recorded", "released", "right", "sang",
  "she", "started", "stars", "starred", "the", "they", "those", "was", "were", "with", "won", "wrote", "yeah",
  "yep", "you", "you're", "youre"
]);

const UNCERTAINTY_GLUE = new Set([
  "about", "bad", "couldn't", "couldnt", "dont", "don't", "dude", "dunno", "guess", "heard", "honestly", "i",
  "idk", "it", "know", "make", "my", "never", "no", "not", "of", "oh", "right", "sorry", "sure", "tell", "that",
  "this", "up", "wanna", "wrong", "ya", "yeah", "you", "you're", "youre"
]);

const RELATIONS = [
  {
    key: "cast",
    label: "cast member",
    properties: ["P161"],
    valueType: "entity",
    minMatches: 2,
    maxValues: 4,
    detect: /\b(?:who\s+(?:stars?|starred)(?:\s+in)?|who(?:'s|\s+is|\s+was|\s+are)\s+in|who\s+are\s+the\s+actors?|what\s+actors?\s+(?:are|were)\s+in|actors?\s+(?:in|from)|cast\s+(?:of|for))\b/i,
    extract: [
      /\bwho\s+(?:stars?|starred)\s+in\s+(.+)$/i,
      /\bwho(?:'s|\s+is|\s+was|\s+are)\s+in\s+(.+)$/i,
      /\bwho\s+are\s+the\s+actors?\s+in\s+(.+)$/i,
      /\bwhat\s+actors?\s+(?:are|were)\s+in\s+(.+)$/i,
      /\bactors?\s+(?:in|from)\s+(.+)$/i,
      /\bcast\s+(?:of|for)\s+(.+)$/i
    ]
  },
  {
    key: "director",
    label: "director",
    properties: ["P57"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 3,
    detect: /\b(?:who\s+directed|who(?:'s|\s+is|\s+was)\s+the\s+director|director\s+(?:of|for))\b/i,
    extract: [/\bwho\s+directed\s+(.+)$/i, /\bdirector\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "release_date",
    label: "release date",
    properties: ["P577"],
    valueType: "time",
    minMatches: 1,
    maxValues: 1,
    detect: /\b(?:when\s+(?:did|does|was|is).{0,80}(?:come\s+out|open(?:ed)?|release(?:d)?)|what\s+year.{0,80}(?:come\s+out|open(?:ed)?|release(?:d)?)|release\s+date)\b/i,
    extract: [
      /\bwhen\s+(?:did|does)\s+(.+?)\s+(?:come\s+out|open|release)$/i,
      /\bwhen\s+(?:was|is)\s+(.+?)\s+(?:released|opened)$/i,
      /\bwhat\s+year\s+did\s+(.+?)\s+(?:come\s+out|open|release)$/i,
      /\brelease\s+date\s+(?:of|for)\s+(.+)$/i
    ]
  },
  {
    key: "performer",
    label: "performer",
    properties: ["P175"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 4,
    detect: /\b(?:who\s+(?:sings?|sang|performed|recorded)|who(?:'s|\s+is|\s+was)\s+.+?\s+by|performer\s+(?:of|for))\b/i,
    extract: [
      /\bwho\s+(?:sings?|sang|performed|recorded)\s+(.+)$/i,
      /\bwho(?:'s|\s+is|\s+was)\s+(.+?)\s+by$/i,
      /\bperformer\s+(?:of|for)\s+(.+)$/i
    ]
  },
  {
    key: "writer",
    label: "writer",
    properties: ["P50", "P58", "P676"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 4,
    detect: /\b(?:who\s+wrote|author\s+(?:of|for)|who(?:'s|\s+is|\s+was)\s+the\s+author)\b/i,
    extract: [/\bwho\s+wrote\s+(.+)$/i, /\bauthor\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "composer",
    label: "composer",
    properties: ["P86"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 4,
    detect: /\b(?:who\s+composed|composer\s+(?:of|for))\b/i,
    extract: [/\bwho\s+composed\s+(.+)$/i, /\bcomposer\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "producer",
    label: "producer",
    properties: ["P162"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 4,
    detect: /\b(?:who\s+produced|producer\s+(?:of|for))\b/i,
    extract: [/\bwho\s+produced\s+(.+)$/i, /\bproducer\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "developer",
    label: "developer",
    properties: ["P178"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 4,
    detect: /\b(?:who\s+developed|developer\s+(?:of|for)|what\s+company\s+developed)\b/i,
    extract: [/\bwho\s+developed\s+(.+)$/i, /\bdeveloper\s+(?:of|for)\s+(.+)$/i, /\bwhat\s+company\s+developed\s+(.+)$/i]
  },
  {
    key: "publisher",
    label: "publisher",
    properties: ["P123"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 4,
    detect: /\b(?:who\s+published|publisher\s+(?:of|for))\b/i,
    extract: [/\bwho\s+published\s+(.+)$/i, /\bpublisher\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "platform",
    label: "platform",
    properties: ["P400"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 5,
    requiresStatementEra: true,
    detect: /\b(?:what\s+(?:system|platform|console)s?.{0,50}\b(?:on|for)\b|what\s+did\s+.+?\s+come\s+out\s+on)\b/i,
    extract: [
      /\bwhat\s+(?:system|platform|console)s?\s+(?:is|was)\s+(.+?)\s+(?:on|for)$/i,
      /\bwhat\s+(?:system|platform|console)s?\s+did\s+(.+?)\s+come\s+out\s+(?:on|for)$/i,
      /\bwhat\s+did\s+(.+?)\s+come\s+out\s+on$/i
    ]
  },
  {
    key: "manufacturer",
    label: "manufacturer",
    properties: ["P176"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 3,
    detect: /\b(?:who\s+manufactured|manufacturer\s+(?:of|for)|what\s+company\s+(?:makes|made|manufactured))\b/i,
    extract: [/\bwho\s+manufactured\s+(.+)$/i, /\bmanufacturer\s+(?:of|for)\s+(.+)$/i, /\bwhat\s+company\s+(?:makes|made|manufactured)\s+(.+)$/i]
  },
  {
    key: "creator",
    label: "creator",
    properties: ["P170"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 4,
    detect: /\b(?:who\s+created|creator\s+(?:of|for))\b/i,
    extract: [/\bwho\s+created\s+(.+)$/i, /\bcreator\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "founder",
    label: "founder",
    properties: ["P112"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 5,
    detect: /\b(?:who\s+founded|who\s+started|founder\s+(?:of|for))\b/i,
    extract: [/\bwho\s+(?:founded|started)\s+(.+)$/i, /\bfounder\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "inception",
    label: "inception date",
    properties: ["P571"],
    valueType: "time",
    minMatches: 1,
    maxValues: 1,
    detect: /\bwhen\s+was\s+.+?\s+(?:founded|started|created)\b/i,
    extract: [/\bwhen\s+was\s+(.+?)\s+(?:founded|started|created)$/i]
  },
  {
    key: "birth_date",
    label: "date of birth",
    properties: ["P569"],
    valueType: "time",
    minMatches: 1,
    maxValues: 1,
    detect: /\b(?:when\s+was\s+.+?\s+born|birthday\s+(?:of|for)|date\s+of\s+birth\s+(?:of|for))\b/i,
    extract: [/\bwhen\s+was\s+(.+?)\s+born$/i, /\bbirthday\s+(?:of|for)\s+(.+)$/i, /\bdate\s+of\s+birth\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "birth_place",
    label: "place of birth",
    properties: ["P19"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 2,
    detect: /\bwhere\s+was\s+.+?\s+born\b/i,
    extract: [/\bwhere\s+was\s+(.+?)\s+born$/i]
  },
  {
    key: "winner",
    label: "winner",
    properties: ["P1346"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 3,
    detect: /\b(?:who\s+won|winner\s+(?:of|for))\b/i,
    extract: [/\bwho\s+won\s+(.+)$/i, /\bwinner\s+(?:of|for)\s+(.+)$/i]
  },
  {
    key: "country_origin",
    label: "country of origin",
    properties: ["P495"],
    valueType: "entity",
    minMatches: 1,
    maxValues: 3,
    detect: /\b(?:what\s+country\s+is\s+.+?\s+from|country\s+of\s+origin\s+(?:of|for))\b/i,
    extract: [/\bwhat\s+country\s+is\s+(.+?)\s+from$/i, /\bcountry\s+of\s+origin\s+(?:of|for)\s+(.+)$/i]
  }
];

const RELATION_BY_KEY = new Map(RELATIONS.map((relation) => [relation.key, relation]));
const AVAILABILITY_PROPERTIES = ["P577", "P571", "P580", "P585", "P569"];
const STATEMENT_TIME_PROPERTIES = ["P580", "P585", "P577"];

function clean(value, max = 700) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value) {
  return clean(value, 1000).toLowerCase().replace(/[’]/g, "'");
}

function canonical(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function wordTokens(value) {
  return normalize(value).replace(/[^a-z0-9']+/g, " ").split(/\s+/).filter(Boolean);
}

function cleanSubject(value) {
  let subject = clean(value, 140).replace(/^[\s"'“”‘’`]+|[\s"'“”‘’`?!.]+$/g, "");
  subject = subject.replace(/^(?:about\s+)?(?:the\s+)?(?:movie|film|song|album|book|video\s+game|game|company|band|team)\s+(?:called\s+)?/i, "");
  return clean(subject, 120);
}

function usableSubject(value) {
  const subject = cleanSubject(value);
  if (!subject || subject.length < 2 || PRONOUN_SUBJECT.test(subject) || GENERIC_PLAN_SUBJECT.test(subject)) return "";
  return subject;
}

function relationForQuestion(text) {
  const value = clean(text, 800);
  return RELATIONS.find((relation) => relation.detect.test(value)) || null;
}

function extractExplicitSubject(text, relation) {
  const value = clean(text, 800).replace(/[?!.]+$/g, "").trim();
  for (const pattern of relation?.extract || []) {
    const match = pattern.exec(value);
    const subject = usableSubject(match?.[1] || "");
    if (subject) return subject;
  }
  return "";
}

function recentSubjectCandidates(history = [], maxRows = 12) {
  const rows = Array.isArray(history) ? history : [];
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const subject = usableSubject(value);
    const key = canonical(subject);
    if (!subject || !key || seen.has(key)) return;
    seen.add(key);
    out.push(subject);
  };

  for (let index = rows.length - 1, count = 0; index >= 0 && count < maxRows && out.length < 5; index -= 1, count += 1) {
    const text = clean(rows[index]?.text, 500);
    if (!text) continue;

    for (const match of text.matchAll(/["“]([^"”]{2,90})["”]/g)) push(match[1]);
    const lead = /^([a-z0-9][^,.!?]{1,90}?)\s+(?:is|was|has|had|still|seems|looks|sounds|rocks|rules|sucks|opened|released)\b/i.exec(text);
    if (lead) push(lead[1]);
    const context = /\b(?:watched|watching|saw|seen|playing|played|listening\s+to|heard|reading|read|about)\s+([^,.!?]{2,90})/i.exec(text);
    if (context) push(context[1]);
    if (/^[a-z0-9][a-z0-9 :'.&+\-]{1,70}$/i.test(text)) push(text);
  }
  return out;
}

function sameConversationOwner(human, previousScope) {
  if (!previousScope) return false;
  const from = clean(human?.from, 32);
  if (from && previousScope.humanFrom && from !== previousScope.humanFrom) return false;
  const target = clean(human?.target || "room", 32);
  if (target !== "room" && previousScope.requiredSpeaker && target !== previousScope.requiredSpeaker) return false;
  if (previousScope.at && Date.now() - Number(previousScope.at) > 3 * 60 * 1000) return false;
  return true;
}

export function publicFactRequest({ human = null, plan = null, history = [], previousScope = null } = {}) {
  if (!human) return null;
  const text = clean(human.text, 800);
  const relation = relationForQuestion(text);

  if (relation) {
    const explicit = extractExplicitSubject(text, relation);
    const candidates = [];
    const add = (value) => {
      const subject = usableSubject(value);
      if (!subject || candidates.some((item) => canonical(item) === canonical(subject))) return;
      candidates.push(subject);
    };
    if (explicit) add(explicit);
    else {
      add(plan?.subject);
      for (const subject of recentSubjectCandidates(history)) add(subject);
    }
    return {
      type: "fact-question",
      relation: relation.key,
      subjectCandidates: candidates.slice(0, MAX_SUBJECT_CANDIDATES),
      explicitSubject: Boolean(explicit),
      source: explicit ? "human-explicit-subject" : candidates.length ? "plan-or-recent-subject" : "subject-unresolved"
    };
  }

  if (!sameConversationOwner(human, previousScope)) return null;
  const corrected = cleanSubject(USER_SUBJECT_CORRECTION.exec(text)?.[1] || "");
  if (!PUBLIC_FACT_CHALLENGE.test(text) && !corrected) return null;
  const subject = usableSubject(corrected) || usableSubject(previousScope.subject);
  if (!subject || !RELATION_BY_KEY.has(previousScope.relation)) return null;
  return {
    type: corrected ? "subject-correction" : "fact-challenge",
    relation: previousScope.relation,
    subjectCandidates: [subject],
    explicitSubject: Boolean(corrected),
    source: corrected ? "human-corrected-subject" : "previous-grounded-fact"
  };
}

function apiUrl(params) {
  const url = new URL(WIKIDATA_API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

function statementValues(entity, propertyId) {
  const all = Array.isArray(entity?.claims?.[propertyId]) ? entity.claims[propertyId] : [];
  const valid = all.filter((statement) => statement?.rank !== "deprecated" && statement?.mainsnak?.snaktype === "value");
  const preferred = valid.filter((statement) => statement.rank === "preferred");
  return preferred.length ? preferred : valid;
}

function statementOrdinal(statement, fallbackIndex) {
  const raw = statement?.qualifiers?.P1545?.[0]?.datavalue?.value;
  const value = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(value) ? value : 100000 + fallbackIndex;
}

function timeValueFromSnak(snak) {
  const value = snak?.datavalue?.value;
  if (!value || typeof value !== "object" || typeof value.time !== "string") return null;
  const match = /^([+-])(\d+)-(\d{2})-(\d{2})T/.exec(value.time);
  if (!match || match[1] === "-") return null;
  const year = Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const precision = Number(value.precision || 9);
  if (!Number.isFinite(year) || year <= 0) return null;
  const safeMonth = Math.min(12, Math.max(1, month || 1));
  const safeDay = Math.min(31, Math.max(1, day || 1));
  const dateKey = `${String(year).padStart(4, "0")}-${String(safeMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
  const monthName = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"][safeMonth - 1];
  const display = precision >= 11 ? `${monthName} ${safeDay}, ${year}` : precision === 10 ? `${monthName} ${year}` : String(year);
  return { type: "time", dateKey, precision, display };
}

function entityIdFromSnak(snak) {
  const value = snak?.datavalue?.value;
  if (!value || typeof value !== "object") return "";
  return clean(value.id || (value["numeric-id"] ? `Q${value["numeric-id"]}` : ""), 24);
}

function qualifierDateKey(statement) {
  for (const propertyId of STATEMENT_TIME_PROPERTIES) {
    for (const snak of statement?.qualifiers?.[propertyId] || []) {
      const parsed = timeValueFromSnak(snak);
      if (parsed?.dateKey) return parsed.dateKey;
    }
  }
  return "";
}

function entityAvailabilityDate(entity) {
  const dates = [];
  for (const propertyId of AVAILABILITY_PROPERTIES) {
    for (const statement of statementValues(entity, propertyId)) {
      const parsed = timeValueFromSnak(statement.mainsnak);
      if (parsed?.dateKey) dates.push(parsed.dateKey);
    }
  }
  return dates.sort()[0] || "";
}

function searchScore(result, subject) {
  const wanted = canonical(subject);
  if (!wanted) return 0;
  if (canonical(result?.label) === wanted) return 4;
  if (canonical(result?.match?.text) === wanted) return 4;
  if ((result?.aliases || []).some((alias) => canonical(alias) === wanted)) return 3;
  return 0;
}

function relationStatements(entity, relation) {
  for (const propertyId of relation.properties) {
    const statements = statementValues(entity, propertyId);
    if (statements.length) return { propertyId, statements };
  }
  return { propertyId: "", statements: [] };
}

function extractRawFactValues(entity, relation) {
  const { propertyId, statements } = relationStatements(entity, relation);
  if (!propertyId || !statements.length) return { propertyId: "", values: [] };
  const ordered = statements
    .map((statement, index) => ({ statement, index, ordinal: statementOrdinal(statement, index) }))
    .sort((a, b) => a.ordinal - b.ordinal || a.index - b.index);

  const values = [];
  const seen = new Set();
  for (const item of ordered) {
    if (relation.valueType === "time") {
      const parsed = timeValueFromSnak(item.statement.mainsnak);
      if (!parsed || seen.has(parsed.dateKey)) continue;
      seen.add(parsed.dateKey);
      values.push({ ...parsed, statementDateKey: qualifierDateKey(item.statement) });
    } else {
      const id = entityIdFromSnak(item.statement.mainsnak);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      values.push({ type: "entity", id, display: "", statementDateKey: qualifierDateKey(item.statement) });
    }
    if (values.length >= Math.max(relation.maxValues * 2, 8)) break;
  }
  if (relation.valueType === "time") values.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return { propertyId, values };
}

function responseEntities(data) {
  return data?.entities && typeof data.entities === "object" ? data.entities : {};
}

export class WikidataPublicFactResolver {
  constructor({ fetcher = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, cacheTtlMs = DEFAULT_CACHE_TTL_MS, maxCacheEntries = MAX_CACHE_ENTRIES } = {}) {
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.cacheTtlMs = cacheTtlMs;
    this.maxCacheEntries = maxCacheEntries;
    this.cache = new Map();
    this.stats = {
      resolveRequests: 0,
      sourceLookups: 0,
      cacheHits: 0,
      httpRequests: 0,
      sourceErrors: 0,
      resolved: 0,
      unresolved: 0,
      unavailable: 0
    };
    this.lastError = "";
  }

  async requestJson(params) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    this.stats.httpRequests += 1;
    try {
      const response = await this.fetcher(apiUrl({ ...params, format: "json", origin: "*" }), {
        headers: { Accept: "application/json", "Api-User-Agent": "aolchatroom/0.17 public-fact-grounding" },
        signal: controller?.signal
      });
      if (!response?.ok) throw new Error(`wikidata-http-${Number(response?.status || 0)}`);
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  pruneCache() {
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }

  clear() {
    this.cache.clear();
    this.lastError = "";
  }

  async lookupSource(subject, relation) {
    const key = `${relation.key}:${canonical(subject)}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      this.stats.cacheHits += 1;
      return cached.value;
    }

    this.stats.sourceLookups += 1;
    let result = null;
    try {
      const searchData = await this.requestJson({
        action: "wbsearchentities",
        search: subject,
        language: "en",
        uselang: "en",
        type: "item",
        limit: 8
      });
      const matches = (searchData?.search || [])
        .map((item, index) => ({ item, index, score: searchScore(item, subject) }))
        .filter((item) => item.score > 0 && item.item?.id)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 6);

      if (!matches.length) {
        result = { status: "unresolved", reason: "source-no-exact-entity", subject };
      } else {
        const ids = matches.map((entry) => entry.item.id).join("|");
        const entityData = await this.requestJson({
          action: "wbgetentities",
          ids,
          props: "labels|descriptions|claims",
          languages: "en"
        });
        const entities = responseEntities(entityData);
        let selected = null;
        for (const match of matches) {
          const entity = entities[match.item.id];
          if (!entity || entity.missing !== undefined) continue;
          const raw = extractRawFactValues(entity, relation);
          if (!raw.values.length) continue;
          selected = {
            status: "found",
            subject: clean(entity?.labels?.en?.value || match.item.label || subject, 140),
            entityId: match.item.id,
            description: clean(entity?.descriptions?.en?.value || match.item.description || "", 220),
            propertyId: raw.propertyId,
            values: raw.values,
            availabilityDateKey: entityAvailabilityDate(entity)
          };
          break;
        }
        result = selected || { status: "unresolved", reason: "source-relation-missing", subject };
      }

      if (result?.status === "found" && relation.valueType === "entity") {
        const ids = [...new Set(result.values.map((value) => value.id).filter(Boolean))].slice(0, 16);
        const labelData = ids.length ? await this.requestJson({
          action: "wbgetentities",
          ids: ids.join("|"),
          props: "labels",
          languages: "en"
        }) : { entities: {} };
        const labels = responseEntities(labelData);
        result.values = result.values
          .map((value) => ({ ...value, display: clean(labels?.[value.id]?.labels?.en?.value || "", 120) }))
          .filter((value) => value.display)
          .slice(0, relation.maxValues);
        if (!result.values.length) result = { status: "unresolved", reason: "source-value-label-missing", subject };
      } else if (result?.status === "found") {
        result.values = result.values.slice(0, relation.maxValues);
      }
      this.lastError = "";
    } catch (error) {
      this.stats.sourceErrors += 1;
      this.lastError = clean(error?.message || error, 180);
      result = { status: "unresolved", reason: "source-error", subject, error: this.lastError };
    }

    this.cache.set(key, {
      expiresAt: now + (result?.status === "found" ? this.cacheTtlMs : NEGATIVE_CACHE_TTL_MS),
      value: result
    });
    this.pruneCache();
    return result;
  }

  async resolve(request, eraDateKey = "") {
    if (!request || !RELATION_BY_KEY.has(request.relation)) return null;
    this.stats.resolveRequests += 1;
    const relation = RELATION_BY_KEY.get(request.relation);
    const era = /^\d{4}-\d{2}-\d{2}$/.test(String(eraDateKey || "")) ? String(eraDateKey) : "";
    const candidates = (request.subjectCandidates || []).map(usableSubject).filter(Boolean).slice(0, MAX_SUBJECT_CANDIDATES);

    if (!candidates.length) {
      this.stats.unresolved += 1;
      return unresolvedPublicFactScope(request, era, "subject-unresolved");
    }

    let last = null;
    for (const subject of candidates) {
      const source = await this.lookupSource(subject, relation);
      last = source;
      if (source?.status !== "found") continue;

      const base = {
        type: request.type,
        relation: relation.key,
        relationLabel: relation.label,
        subject: source.subject || subject,
        requestSubject: subject,
        requestSource: request.source || "",
        source: SOURCE_NAME,
        sourceEntityId: source.entityId || "",
        sourcePropertyId: source.propertyId || "",
        sourceDescription: source.description || "",
        eraDateKey: era,
        availabilityDateKey: source.availabilityDateKey || "",
        values: Array.isArray(source.values) ? source.values.map((value) => ({ ...value })) : [],
        trusted: false,
        available: false,
        status: "unresolved",
        reason: ""
      };

      if (!era) {
        this.stats.unresolved += 1;
        return { ...base, reason: "era-date-missing" };
      }
      if (!base.availabilityDateKey) {
        this.stats.unresolved += 1;
        return { ...base, reason: "subject-era-unverified" };
      }
      if (base.availabilityDateKey > era) {
        this.stats.unavailable += 1;
        return { ...base, status: "unavailable", reason: "subject-not-yet-available" };
      }

      let values = base.values;
      if (relation.requiresStatementEra) {
        values = values.filter((value) => value.statementDateKey && value.statementDateKey <= era);
        if (!values.length) {
          this.stats.unresolved += 1;
          return { ...base, values: [], reason: "relation-era-unverified" };
        }
      }
      if (relation.valueType === "time") {
        values = values.filter((value) => value.dateKey && value.dateKey <= era);
        if (!values.length) {
          this.stats.unavailable += 1;
          return { ...base, values: [], status: "unavailable", reason: "fact-not-yet-available" };
        }
      }

      this.stats.resolved += 1;
      return {
        ...base,
        values: values.slice(0, relation.maxValues),
        trusted: true,
        available: true,
        status: "resolved",
        reason: "source-grounded"
      };
    }

    this.stats.unresolved += 1;
    return unresolvedPublicFactScope(request, era, last?.reason || "source-unresolved", candidates[0]);
  }

  snapshot() {
    return {
      source: SOURCE_NAME,
      endpoint: WIKIDATA_API,
      cacheSize: this.cache.size,
      cacheTtlMs: this.cacheTtlMs,
      timeoutMs: this.timeoutMs,
      supportedRelations: RELATIONS.map((relation) => relation.key),
      stats: { ...this.stats },
      lastError: this.lastError
    };
  }
}

export function unresolvedPublicFactScope(request, eraDateKey = "", reason = "source-unresolved", subject = "") {
  if (!request || !RELATION_BY_KEY.has(request.relation)) return null;
  const relation = RELATION_BY_KEY.get(request.relation);
  return {
    type: request.type,
    relation: relation.key,
    relationLabel: relation.label,
    subject: usableSubject(subject || request.subjectCandidates?.[0] || "") || "",
    requestSubject: usableSubject(subject || request.subjectCandidates?.[0] || "") || "",
    requestSource: request.source || "",
    source: SOURCE_NAME,
    sourceEntityId: "",
    sourcePropertyId: "",
    sourceDescription: "",
    eraDateKey: eraDateKey || "",
    availabilityDateKey: "",
    values: [],
    trusted: false,
    available: false,
    status: "unresolved",
    reason
  };
}

function factValues(scope) {
  return (scope?.values || []).map((value) => clean(value?.display, 120)).filter(Boolean);
}

function joinValues(values) {
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function factInstruction(scope) {
  if (!scope) return "";
  if (scope.status !== "resolved" || !scope.trusted || !scope.available || !factValues(scope).length) {
    return `PUBLIC FACT GATE: this is a real-world ${scope.relationLabel || "fact"} question, but the structured fact source did not produce a historically safe verified answer. Do not guess names, dates, places, companies, or substitute a different subject. Respond naturally with uncertainty only.`;
  }
  const values = factValues(scope).join("; ");
  const repair = scope.type === "fact-challenge"
    ? " The human is challenging the previous factual answer. Acknowledge the mistake and correct this exact subject; never claim you meant something else."
    : scope.type === "subject-correction"
      ? " The human corrected the subject. Answer the corrected subject only."
      : "";
  return `VERIFIED PUBLIC FACT: subject=${scope.subject}; relation=${scope.relationLabel}; verified value(s)=${values}.${repair} Use only these fact values; do not add unsupported names, dates, places, companies, or alternate subjects.`;
}

export function planWithPublicFactGrounding(plan, scope) {
  if (!plan || !scope) return plan;
  const instruction = factInstruction(scope);
  if (!instruction) return plan;
  const moves = Array.isArray(plan.moves) ? plan.moves.map((move, index) => index === 0
    ? { ...move, meaning: clean(`${move?.meaning || ""} ${instruction}`, 1800) }
    : { ...move }
  ) : plan.moves;
  return {
    ...plan,
    goal: clean(`${plan.goal || ""} ${instruction}`, 2200),
    moves
  };
}

function safeUncertaintySurface(scope, surface) {
  const text = clean(surface, 700);
  if (!UNCERTAINTY.test(text)) return false;
  const allowed = new Set(UNCERTAINTY_GLUE);
  for (const token of wordTokens(scope?.subject || "")) allowed.add(token);
  return wordTokens(text).every((token) => allowed.has(token));
}

function factValueSatisfied(value, surface) {
  const text = normalize(surface);
  if (value?.type === "entity") return Boolean(value.display && text.includes(normalize(value.display)));
  if (value?.type === "time") {
    const expected = wordTokens(value.display);
    const actual = new Set(wordTokens(surface));
    return expected.length > 0 && expected.every((token) => actual.has(token));
  }
  return false;
}

function resolvedSurfaceSafe(scope, surface) {
  const relation = RELATION_BY_KEY.get(scope?.relation);
  if (!relation) return false;
  const values = scope.values || [];
  const matched = values.filter((value) => factValueSatisfied(value, surface));
  if (matched.length < Math.min(relation.minMatches, values.length || relation.minMatches)) return false;
  if (NEGATION.test(surface)) return false;

  const allowed = new Set(FACT_GLUE);
  for (const token of wordTokens(scope.subject || "")) allowed.add(token);
  for (const token of wordTokens(scope.relationLabel || "")) allowed.add(token);
  for (const value of values) for (const token of wordTokens(value.display || "")) allowed.add(token);
  return wordTokens(surface).every((token) => allowed.has(token));
}

export function evaluatePublicFactSurface(scope, surface = "") {
  if (!scope) return { ok: true, enforced: false, reason: "no-public-fact-scope" };
  const text = clean(surface, 700);
  if (!text) return { ok: false, enforced: true, reason: "public-fact-empty" };

  if (scope.status !== "resolved" || !scope.trusted || !scope.available) {
    return safeUncertaintySurface(scope, text)
      ? { ok: true, enforced: true, reason: "public-fact-unresolved-uncertainty" }
      : { ok: false, enforced: true, reason: "public-fact-unresolved-confident-answer" };
  }

  if (scope.type === "fact-challenge" && BOT_RATIONALIZATION.test(text)) {
    return { ok: false, enforced: true, reason: "public-fact-challenge-rationalization" };
  }
  const grounded = resolvedSurfaceSafe(scope, text);
  if (scope.type === "fact-challenge") {
    if (!CORRECTION.test(text) || !grounded) return { ok: false, enforced: true, reason: "public-fact-correction-ungrounded" };
    return { ok: true, enforced: true, reason: "public-fact-grounded-correction" };
  }
  return grounded
    ? { ok: true, enforced: true, reason: `public-fact-${scope.relation}-grounded` }
    : { ok: false, enforced: true, reason: `public-fact-${scope.relation}-ungrounded` };
}

function deterministicFactText(scope) {
  const values = factValues(scope).map((value) => value.toLowerCase());
  const list = joinValues(values);
  const subject = clean(scope?.subject, 140).toLowerCase();
  switch (scope?.relation) {
    case "cast": return `${list} are in ${subject}`;
    case "director": return `${list} directed ${subject}`;
    case "release_date": return `${subject} came out ${list}`;
    case "performer": return `${subject} is by ${list}`;
    case "writer": return `${list} wrote ${subject}`;
    case "composer": return `${list} composed ${subject}`;
    case "producer": return `${list} produced ${subject}`;
    case "developer": return `${list} developed ${subject}`;
    case "publisher": return `${list} published ${subject}`;
    case "platform": return `${subject} was on ${list}`;
    case "manufacturer": return `${list} made ${subject}`;
    case "creator": return `${list} created ${subject}`;
    case "founder": return `${list} founded ${subject}`;
    case "inception": return `${subject} started ${list}`;
    case "birth_date": return `${subject} was born ${list}`;
    case "birth_place": return `${subject} was born in ${list}`;
    case "winner": return `${list} won ${subject}`;
    case "country_origin": return `${subject} is from ${list}`;
    default: return list;
  }
}

export function deterministicPublicFactLine(scope, { speaker = "", target = "room" } = {}) {
  if (!scope || !speaker) return null;
  let text = scope.status === "resolved" && scope.trusted && scope.available && factValues(scope).length
    ? deterministicFactText(scope)
    : "not sure, i dont wanna make that up";
  if (scope.type === "fact-challenge") {
    text = scope.status === "resolved" && scope.trusted
      ? `yeah you're right, my bad, ${text}`
      : "yeah my bad, not sure, i dont wanna make that up";
  }
  return {
    speaker,
    target: target || "room",
    text,
    intent: scope.type === "fact-challenge" ? "correct" : "answer",
    topic: "public-facts",
    _v41PublicFactGrounded: true
  };
}

export function publicFactPolicySnapshot() {
  return {
    source: SOURCE_NAME,
    endpoint: WIKIDATA_API,
    relations: RELATIONS.map((relation) => ({
      key: relation.key,
      label: relation.label,
      properties: [...relation.properties],
      historicalMode: relation.requiresStatementEra ? "statement-date-required" : "stable-subject-date-gated"
    })),
    unsupportedRelationsFailClosed: true,
    exactEntityMatchRequired: true,
    simulatedDateRequired: true
  };
}
