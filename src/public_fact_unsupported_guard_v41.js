const UNSUPPORTED_FACT_PATTERNS = [
  /\bwho\s+(?:is|was)\s+(?:the\s+)?(?:current\s+)?(?:ceo|president|chair(?:man|woman|person)?|owner|manager|coach|governor|mayor|prime\s+minister|leader|editor|host)\b/i,
  /\bhow\s+old\s+(?:is|was)\b/i,
  /\bwhat\s+(?:is|was)\s+(?:the\s+)?(?:age|population|runtime|length|budget|box\s+office|gross|price|cost|genre)\s+(?:of|for)\b/i,
  /\bwhat\s+(?:did|does|was|is).{0,80}\b(?:cost|gross|earn|sell\s+for)\b/i,
  /\bwhat\s+(?:is|was)\s+(?:the\s+)?capital\s+of\b/i,
  /\bwhere\s+(?:is|was)\s+.+?\s+(?:located|based|headquartered)\b/i,
  /\bhow\s+many\s+(?:oscars?|grammys?|awards?|copies|albums?|records?|tickets?|units?)\b/i,
  /\bwhat\s+year\s+was\s+.+?\s+born\b/i,
  /\bwhat\s+(?:team|company|label|studio|network)\s+(?:is|was)\s+.+?\s+(?:on|with|for)\b/i
];

const CHALLENGE = /\b(?:that(?:'s|\s+is)\s+wrong|i\s+think\s+that(?:'s|\s+is)\s+wrong|you(?:'re|\s+are)\s+wrong|are\s+you\s+sure|you\s+sure|not\s+right|got\s+that\s+wrong)\b/i;

function clean(value, max = 520) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function recognizedUnsupportedPublicFact(text = "") {
  const value = clean(text, 800);
  return UNSUPPORTED_FACT_PATTERNS.some((pattern) => pattern.test(value));
}

export function unsupportedPublicFactScope({ human = null, eraDateKey = "", previousScope = null } = {}) {
  if (!human) return null;
  const text = clean(human.text, 800);
  if (!recognizedUnsupportedPublicFact(text)) {
    if (!previousScope || previousScope.relation !== "unsupported" || !CHALLENGE.test(text)) return null;
    if (clean(human.from, 32) !== clean(previousScope.humanFrom, 32)) return null;
  }

  return {
    type: recognizedUnsupportedPublicFact(text) ? "fact-question" : "fact-challenge",
    relation: "unsupported",
    relationLabel: "public fact",
    subject: "",
    requestSubject: "",
    requestSource: "recognized-unsupported-fact",
    source: "policy",
    sourceEntityId: "",
    sourcePropertyId: "",
    sourceDescription: "",
    eraDateKey: eraDateKey || "",
    availabilityDateKey: "",
    values: [],
    trusted: false,
    available: false,
    status: "unresolved",
    reason: "unsupported-or-historically-unsafe-relation"
  };
}

export function unsupportedPublicFactPolicySnapshot() {
  return {
    recognizedUnsupportedFactsFailClosed: true,
    currentRoleFactsFailClosed: true,
    pricesAndMutableMetricsFailClosed: true,
    unsupportedFactChallengesStayUncertain: true
  };
}
