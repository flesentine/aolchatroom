const PUBLIC_MEDIA = [
  { title: "Toy Story", releaseDate: "1995-11-22", aliases: [/\btoy story\b/i] },
  { title: "Mission: Impossible", releaseDate: "1996-05-22", aliases: [/\bmission:? impossible\b/i] },
  {
    title: "Independence Day",
    releaseDate: "1996-07-03",
    aliases: [/\bindependence day\b/i, /\bid4\b/i],
    cast: ["Will Smith", "Jeff Goldblum", "Bill Pullman"],
    director: "Roland Emmerich",
    releaseAnswer: "july 3, 1996"
  },
  { title: "Escape from L.A.", releaseDate: "1996-08-09", aliases: [/\bescape from l\.?a\.?\b/i] },
  { title: "Tin Cup", releaseDate: "1996-08-16", aliases: [/\btin cup\b/i] },
  { title: "Space Jam", releaseDate: "1996-11-15", aliases: [/\bspace jam\b/i] }
];

const CAST_QUERY = /\b(?:who\s+(?:stars?|starred)(?:\s+in)?|who(?:'s|\s+is|\s+was|\s+are)\s+in|who\s+are\s+the\s+actors?|what\s+actors?\s+(?:are|were)\s+in|actors?\s+(?:in|from)|cast\s+(?:of|for))\b/i;
const DIRECTOR_QUERY = /\b(?:who\s+directed|who(?:'s|\s+is|\s+was)\s+the\s+director|director\s+(?:of|for))\b/i;
const RELEASE_QUERY = /\b(?:when\s+(?:did|does|was|is).{0,70}(?:come\s+out|open|release)|what\s+year.{0,70}(?:come\s+out|open|release)|release\s+date)\b/i;
const ERROR_CHALLENGE = /\b(?:that(?:'s|\s+is)\s+wrong|i\s+think\s+that(?:'s|\s+is)\s+wrong|you(?:'re|\s+are)\s+wrong|are\s+you\s+sure|you\s+sure|not\s+in\s+(?:that|the)\s+movie|not\s+in\s+that|we\s+were\s+talking\s+about|how\s+could\s+you\s+mix|mix(?:ed)?\s+that\s+up|got\s+that\s+wrong|that(?:'s|\s+is)\s+not\s+right)\b/i;
const UNCERTAINTY = /\b(?:idk|i\s+don'?t\s+know|dunno|not\s+sure|no\s+idea|couldn'?t\s+tell\s+ya|dont\s+wanna\s+guess|don'?t\s+wanna\s+guess|don'?t\s+wanna\s+make\s+that\s+up|dont\s+wanna\s+make\s+that\s+up)\b/i;
const CORRECTION = /\b(?:you(?:'re|\s+are)\s+right|my\s+bad|oops|sorry|i\s+got\s+that\s+wrong|i\s+mixed\s+that\s+up|yeah.{0,30}\bwrong)\b/i;
const RATIONALIZATION = /\b(?:i\s+meant|what\s+i\s+meant|meant\s+the|meant\s+another)\b/i;
const PRONOUN_TITLE = /^(?:that|it|this|that\s+one|this\s+one|that\s+movie|this\s+movie|the\s+movie)$/i;
const CAST_GLUE = new Set([
  "a", "actually", "all", "and", "are", "cast", "definitely", "dude", "he", "in", "is", "it", "its", "lol",
  "movie", "my", "oh", "oops", "right", "stars", "starred", "the", "they", "those", "yeah", "yep", "you're",
  "youre", "your", "bad"
]);
const DIRECTOR_GLUE = new Set([
  "a", "actually", "and", "directed", "director", "dude", "he", "is", "it", "its", "lol", "movie", "oh", "the",
  "was", "yeah", "yep"
]);
const RELEASE_GLUE = new Set([
  "actually", "came", "come", "it", "on", "opened", "out", "release", "released", "the", "was", "yeah"
]);

function clean(value, max = 520) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value) {
  return clean(value, 900).toLowerCase().replace(/[’]/g, "'");
}

function wordTokens(value) {
  return normalize(value)
    .replace(/[^a-z0-9']+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokenSet(values = []) {
  const out = new Set();
  for (const value of values) for (const token of wordTokens(value)) out.add(token);
  return out;
}

function tokensAllowed(surface, baseAllowed, extraValues = []) {
  const allowed = new Set(baseAllowed);
  for (const token of tokenSet(extraValues)) allowed.add(token);
  return wordTokens(surface).every((token) => allowed.has(token));
}

function mediaInText(text) {
  const value = clean(text, 1000);
  for (const media of PUBLIC_MEDIA) {
    if ((media.aliases || []).some((alias) => alias.test(value))) return media;
  }
  return null;
}

function questionKind(text) {
  const value = clean(text, 700);
  if (CAST_QUERY.test(value)) return "cast";
  if (DIRECTOR_QUERY.test(value)) return "director";
  if (RELEASE_QUERY.test(value)) return "release";
  return "";
}

function explicitTitle(text, kind) {
  const value = clean(text, 700).replace(/[?!.]+$/g, "").trim();
  const patterns = kind === "cast"
    ? [
        /\bwho\s+(?:stars?|starred)\s+in\s+(.+)$/i,
        /\bwho(?:'s|\s+is|\s+was|\s+are)\s+in\s+(.+)$/i,
        /\bwho\s+are\s+the\s+actors?\s+in\s+(.+)$/i,
        /\bwhat\s+actors?\s+(?:are|were)\s+in\s+(.+)$/i,
        /\bactors?\s+(?:in|from)\s+(.+)$/i,
        /\bcast\s+(?:of|for)\s+(.+)$/i
      ]
    : kind === "director"
      ? [
          /\bwho\s+directed\s+(.+)$/i,
          /\bdirector\s+(?:of|for)\s+(.+)$/i
        ]
      : [
          /\bwhen\s+(?:did|does)\s+(.+?)\s+(?:come\s+out|open|release)$/i,
          /\bwhen\s+was\s+(.+?)\s+released$/i,
          /\bwhat\s+year\s+did\s+(.+?)\s+(?:come\s+out|open|release)$/i
        ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    const title = clean(match?.[1] || "", 120);
    if (title && !PRONOUN_TITLE.test(title)) return title;
  }
  return "";
}

function recentMedia(history = [], maxRows = 14) {
  const rows = Array.isArray(history) ? history : [];
  for (let index = rows.length - 1, seen = 0; index >= 0 && seen < maxRows; index -= 1, seen += 1) {
    const media = mediaInText(rows[index]?.text || "");
    if (media) return media;
  }
  return null;
}

function detailScopeFromQuestion(human, history = [], eraDateKey = "") {
  const kind = questionKind(human?.text || "");
  if (!kind) return null;

  const explicit = explicitTitle(human?.text || "", kind);
  const directMedia = mediaInText(human?.text || "");
  const recent = !explicit && !directMedia ? recentMedia(history, 14) : null;
  const media = directMedia || recent;
  const title = directMedia?.title || explicit || recent?.title || "";
  if (!title) return null;

  const available = !media?.releaseDate || !eraDateKey || media.releaseDate <= eraDateKey;
  return {
    type: "detail-question",
    kind,
    title,
    media: media || null,
    available,
    trusted: Boolean(media && available && trustedAnswer(media, kind)),
    source: directMedia ? "human-title" : explicit ? "explicit-unverified-title" : "recent-chat-title"
  };
}

function sameConversationOwner(currentHuman, priorHuman) {
  const currentFrom = clean(currentHuman?.from, 32);
  const priorFrom = clean(priorHuman?.from, 32);
  if (currentFrom && priorFrom && currentFrom !== priorFrom) return false;

  const currentTarget = clean(currentHuman?.target || "room", 32);
  const priorTarget = clean(priorHuman?.target || "room", 32);
  if (currentTarget !== "room" && priorTarget !== "room" && currentTarget !== priorTarget) return false;
  return true;
}

function recentDetailQuestion(history = [], eraDateKey = "", currentHuman = null, maxRows = 12) {
  const rows = Array.isArray(history) ? history : [];
  for (let index = rows.length - 1, seen = 0; index >= 0 && seen < maxRows; index -= 1, seen += 1) {
    const row = rows[index];
    if (row?.kind !== "human" || !sameConversationOwner(currentHuman, row)) continue;
    const prior = rows.slice(Math.max(0, index - 14), index);
    const scope = detailScopeFromQuestion(row, prior, eraDateKey);
    if (scope) return scope;
  }
  return null;
}

function trustedAnswer(media, kind) {
  if (!media) return "";
  if (kind === "cast" && Array.isArray(media.cast) && media.cast.length) return media.cast.join(", ");
  if (kind === "director" && media.director) return media.director;
  if (kind === "release" && media.releaseAnswer) return media.releaseAnswer;
  return "";
}

export function publicMediaFactScope({ human = null, history = [], eraDateKey = "" } = {}) {
  if (!human) return null;
  const detail = detailScopeFromQuestion(human, history, eraDateKey);
  if (detail) return detail;

  if (!ERROR_CHALLENGE.test(clean(human?.text, 700))) return null;
  const previous = recentDetailQuestion(history, eraDateKey, human, 12);
  if (!previous) return null;

  const currentMedia = mediaInText(human?.text || "");
  const media = currentMedia || previous.media || null;
  const title = currentMedia?.title || previous.title;
  if (!title) return null;

  const available = !media?.releaseDate || !eraDateKey || media.releaseDate <= eraDateKey;
  return {
    ...previous,
    type: "fact-challenge",
    title,
    media: media || previous.media || null,
    available,
    trusted: Boolean(media && available && trustedAnswer(media, previous.kind)),
    source: currentMedia ? "challenge-title" : "recent-detail-question"
  };
}

export function publicMediaGroundingInstruction(scope) {
  if (!scope) return "";
  const answer = trustedAnswer(scope.media, scope.kind);
  if (!scope.available) {
    return `PUBLIC MEDIA FACT GATE: ${scope.title} is not available as established public knowledge at this simulated date. Do not provide cast/director/release details. Respond naturally with uncertainty or lack of knowledge.`;
  }
  if (!answer) {
    return `PUBLIC MEDIA FACT GATE: the human is asking for a factual ${scope.kind} detail about ${scope.title}, but this runtime has no trusted ${scope.kind} fact for it. Do not guess names, dates, or substitute another title. Respond naturally that you are not sure.`;
  }
  const fact = scope.kind === "cast"
    ? `${scope.title} principal cast: ${answer}.`
    : scope.kind === "director"
      ? `${scope.title} director: ${answer}.`
      : `${scope.title} release/opening: ${answer}.`;
  const repair = scope.type === "fact-challenge"
    ? " The human is correcting a factual mistake. Acknowledge the mistake and correct it from this fact; do not claim you meant another movie."
    : " Answer from this fact only; do not add unverified names or substitute another movie.";
  return `PUBLIC MEDIA FACT GROUNDING (authoritative): ${fact}${repair}`;
}

export function planWithPublicMediaGrounding(plan, scope) {
  if (!plan || !scope) return plan;
  const instruction = publicMediaGroundingInstruction(scope);
  if (!instruction) return plan;
  const moves = Array.isArray(plan.moves) ? plan.moves.map((move, index) => index === 0
    ? { ...move, meaning: clean(`${move?.meaning || ""} ${instruction}`, 1200) }
    : { ...move }
  ) : plan.moves;
  return {
    ...plan,
    goal: clean(`${plan.goal || ""} ${instruction}`, 1600),
    moves
  };
}

function castAnswerSatisfied(scope, surface) {
  const cast = Array.isArray(scope?.media?.cast) ? scope.media.cast : [];
  if (cast.length < 2) return false;
  const normalized = normalize(surface);
  const matched = cast.filter((name) => normalized.includes(normalize(name)));
  if (matched.length < Math.min(2, cast.length)) return false;
  return tokensAllowed(surface, CAST_GLUE, [...cast, scope.title]);
}

function directorAnswerSatisfied(scope, surface) {
  const director = clean(scope?.media?.director, 120);
  if (!director || !normalize(surface).includes(normalize(director))) return false;
  return tokensAllowed(surface, DIRECTOR_GLUE, [director, scope.title]);
}

function releaseAnswerSatisfied(scope, surface) {
  const expected = clean(scope?.media?.releaseAnswer, 120);
  if (!expected) return false;
  const normalized = normalize(surface);
  const expectedTokens = wordTokens(expected);
  if (!expectedTokens.length || !expectedTokens.every((token) => normalized.includes(token))) return false;
  return tokensAllowed(surface, RELEASE_GLUE, [expected, scope.title]);
}

function trustedAnswerSatisfied(scope, surface) {
  if (!scope?.media || !scope.available) return false;
  if (scope.kind === "cast") return castAnswerSatisfied(scope, surface);
  if (scope.kind === "director") return directorAnswerSatisfied(scope, surface);
  if (scope.kind === "release") return releaseAnswerSatisfied(scope, surface);
  return false;
}

export function evaluatePublicMediaSurface(scope, surface = "") {
  if (!scope) return { ok: true, enforced: false, reason: "no-public-media-scope" };
  const text = clean(surface, 700);
  if (!text) return { ok: false, enforced: true, reason: "public-media-empty" };

  if (!scope.available || !scope.trusted) {
    return UNCERTAINTY.test(text)
      ? { ok: true, enforced: true, reason: "public-media-unverified-uncertainty" }
      : { ok: false, enforced: true, reason: "public-media-unverified-confident-answer" };
  }

  const grounded = trustedAnswerSatisfied(scope, text);
  if (scope.type === "fact-challenge") {
    if (RATIONALIZATION.test(text)) {
      return { ok: false, enforced: true, reason: "public-media-challenge-rationalization" };
    }
    const repaired = CORRECTION.test(text) && grounded;
    return repaired
      ? { ok: true, enforced: true, reason: "public-media-grounded-correction" }
      : { ok: false, enforced: true, reason: "public-media-correction-ungrounded" };
  }

  return grounded
    ? { ok: true, enforced: true, reason: `public-media-${scope.kind}-grounded` }
    : { ok: false, enforced: true, reason: `public-media-${scope.kind}-ungrounded` };
}

export function deterministicPublicMediaLine(scope, { speaker = "", target = "room" } = {}) {
  if (!scope || !speaker) return null;
  let text = "not sure, i dont wanna make that up";
  if (scope.trusted && scope.available) {
    if (scope.kind === "cast") {
      const names = (scope.media?.cast || []).map((name) => name.toLowerCase());
      const list = names.length <= 1 ? (names[0] || "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
      text = scope.type === "fact-challenge"
        ? `yeah you're right, my bad, ${list} are in ${scope.title.toLowerCase()}`
        : list;
    } else if (scope.kind === "director") {
      const director = String(scope.media?.director || "").toLowerCase();
      text = scope.type === "fact-challenge"
        ? `yeah you're right, my bad, ${director} directed ${scope.title.toLowerCase()}`
        : `${director} directed it`;
    } else if (scope.kind === "release") {
      const release = String(scope.media?.releaseAnswer || "").toLowerCase();
      text = scope.type === "fact-challenge"
        ? `yeah you're right, my bad, it opened ${release}`
        : `it opened ${release}`;
    }
  }
  return {
    speaker,
    target: target || "room",
    text,
    intent: scope.type === "fact-challenge" ? "correct" : "answer",
    topic: "movies",
    _v41PublicMediaGrounded: true
  };
}

export function publicMediaCatalogSnapshot() {
  return PUBLIC_MEDIA.map((media) => ({
    title: media.title,
    releaseDate: media.releaseDate,
    trustedCast: Array.isArray(media.cast) ? [...media.cast] : [],
    trustedDirector: media.director || "",
    trustedRelease: media.releaseAnswer || ""
  }));
}
