const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "before", "both", "but", "by", "can", "could",
  "did", "do", "does", "for", "from", "had", "has", "have", "he", "her", "him", "his", "how", "i", "if",
  "in", "is", "it", "its", "latest", "me", "message", "move", "my", "of", "on", "or", "our", "say", "says",
  "she", "so", "subject", "that", "the", "their", "them", "then", "they", "this", "to", "u", "was", "we",
  "were", "what", "when", "where", "which", "who", "why", "with", "would", "you", "your", "answer", "answers",
  "directly", "human", "question", "respond", "response", "reply", "explain", "acknowledge", "using", "exact"
]);

const POLARITY_QUESTION = /^\s*(?:do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)\b/i;
const POLARITY_RESPONSE = /\b(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|dont|don't|doesnt|doesn't|didnt|didn't|cant|can't|couldnt|couldn't|wouldnt|wouldn't|maybe|probably|i do|i don't|i dont|i did|i didn't|i didnt|i have|i haven't|i havent|i own|i don't own|i dont own|i got|i don't have|i dont have|got one|have one|own one)\b/i;
const HARD_POLARITY_RESPONSE = /\b(?:yes|yeah|yea|yep|yup|sure|definitely|absolutely|no|nah|nope|not really|never|i do|i don't|i dont|i did|i didn't|i didnt|i own|i don't own|i dont own|i don't have|i dont have|i haven't got|i havent got|got one|have one|own one|i (?:own|have|got) (?:one|it|a|an|the))\b/i;
const OPINION_RESPONSE = /\b(?:love|like|hate|prefer|favorite|fave|rules?|rocks?|sucks?|awesome|cool|great|terrible|awful|best|worst)\b/i;
const PRICE_REQUIREMENT = /\b(?:costs?|price|priced|pricing|worth|paid|paying|pay for|dollars?|bucks?|how much|go(?:es)? for)\b/i;
const PRICE_CONTEXT = /\b(?:price|priced|costs?|cost|paid|pay|worth|go(?:es)? for|went for|sell(?:s|ing)? for)\b/i;
const PRICE_QUALITATIVE = /\b(?:cheap|cheaper|expensive|pricey|too much)\b/i;
const PRICE_LOOSE_QUALITATIVE = /\ba lot\b/i;
const PRICE_AMOUNT_WORD = /\b(?:hundred|thousand|grand)\b/i;
const PRICE_CURRENCY_NUMBER = /(?:\$\s*\d+(?:\.\d{1,2})?)|\b\d+(?:\.\d{1,2})?\s*(?:bucks?|dollars?)\b/i;
const APPROX_PRICE_NUMBER = /\b(?:about|around|like|roughly|approx(?:imately)?|maybe|probably)\s+\$?\d+(?:\.\d{1,2})?\b/i;
const QUANTITY_REQUIREMENT = /\b(?:how many|number of|quantity|count of)\b/i;
const QUANTITY_RESPONSE = /\b(?:zero|none|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|couple|few|several|many|tons?)\b/i;
const QUANTITY_NUMERIC_CONTEXT = /\b(?:have|has|had|own|owns|owned|got|there(?:'s| is| are)|count(?:ed)?|number(?:ed)?)\s+\d{1,3}\b|\b\d{1,3}\s+(?:copies|units|systems?|consoles?|games?|ones?)\b/i;
const TIME_REQUIREMENT = /\b(?:when|what time|what year|what date|how long)\b/i;
const TIME_RESPONSE = /\b(?:today|tomorrow|tonight|yesterday|morning|afternoon|evening|night|week|month|year|hour|minute|soon|later|ago|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,4}(?::\d{2})?(?:\s*[ap]m)?\b/i;
const UNCERTAINTY_RESPONSE = /\b(?:idk|i dont know|i don't know|dunno|not sure|no idea|couldnt tell ya|couldn't tell ya)\b/i;
const PRICE_UNCERTAINTY_SCOPE = /\b(?:how much|price|what (?:it|they|that|this|i|we) (?:costs?|cost|went for|paid)|go(?:es)? for|went for|worth)\b/i;
const QUANTITY_UNCERTAINTY_SCOPE = /\b(?:how many|number|quantity|count|copies|units)\b/i;
const TIME_UNCERTAINTY_SCOPE = /\b(?:when|time|year|date|how long)\b/i;
const REPAIR_CUE = /\b(?:i mean|i meant|what i meant|meant that|was talking about|i was saying|my bad|sorry|oops|lemme explain|let me explain|to clarify)\b/i;
const CLARIFY_INTENT = /^(?:clarify|clarification|challenge|correct|repair)$/i;
const CLARIFY_HUMAN = /\b(?:what do you mean|what are you talking about|doesn'?t make sense|makes? no sense|why (?:are|r) (?:you|u) saying|who me|had what|what'?s that have to do with)\b/i;
const MULTIPART_CUE = /\bboth\b|\band\s+(?:how|what|where|when|why|who|do|does|did|is|are|was|were|can|could|would|should|have|has|had|will)\b/i;

function clean(value, max = 520) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeToken(token) {
  const value = String(token || "").toLowerCase();
  if (/^owns?$|^owned$|^ownership$/.test(value)) return "own";
  if (/^costs?$|^costing$|^priced?$|^prices$|^pricing$/.test(value)) return "price";
  if (/^systems?$|^consoles?$/.test(value)) return "system";
  if (/^games?$|^gaming$/.test(value)) return "game";
  return value;
}

function tokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9'$ ]+/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/^'+|'+$/g, ""))
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
      .map(normalizeToken)
      .filter(Boolean)
  );
}

function overlapCount(a, b) {
  if (!a.size || !b.size) return 0;
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function addUnique(array, value) {
  if (value && !array.includes(value)) array.push(value);
}

function rowById(history = [], id = "") {
  if (!id) return null;
  return [...(history || [])].reverse().find((row) => String(row?.messageId || row?.id || "") === String(id)) || null;
}

function numericValues(text) {
  return [...clean(text).matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) => Number(match[0])).filter(Number.isFinite);
}

function looksLikeYear(value) {
  return Number.isInteger(value) && value >= 1800 && value <= 2199;
}

function hasNonYearNumber(text) {
  return numericValues(text).some((value) => !looksLikeYear(value));
}

function hasQuantityNumber(text) {
  return numericValues(text).some((value) => Number.isInteger(value) && !looksLikeYear(value) && value >= 0 && value <= 999);
}

function requirementKinds(humanText, meaning, goal) {
  const source = `${humanText} ${meaning} ${goal}`;
  const required = [];
  if (PRICE_REQUIREMENT.test(source)) addUnique(required, "price");
  if (QUANTITY_REQUIREMENT.test(source)) addUnique(required, "quantity");
  if (TIME_REQUIREMENT.test(source)) addUnique(required, "time");
  if (POLARITY_QUESTION.test(humanText) || /\bwhether\b/i.test(source) || /\b(?:confirm|deny)\b/i.test(meaning)) {
    addUnique(required, "polarity");
  }
  return required;
}

function polarityUncertaintyScope(contract, text) {
  const source = `${contract?.human?.text || ""} ${contract?.move?.meaning || ""} ${contract?.goal || ""}`;
  if (/\b(?:own|ownership|have|has|got)\b/i.test(source)) return /\b(?:own|owns|owned|have|has|had|got)\b/i.test(text);
  if (/\b(?:like|love|hate|prefer|favorite|fave)\b/i.test(source)) return /\b(?:like|love|hate|prefer|favorite|fave)\b/i.test(text);
  if (/\b(?:can|could|able|ability)\b/i.test(source)) return /\b(?:can|could|able)\b/i.test(text);
  return /\b(?:if|whether)\b/i.test(text);
}

function scopedUncertaintySatisfied(kind, text, multiPart, contract) {
  if (!UNCERTAINTY_RESPONSE.test(text)) return false;
  if (!multiPart) return true;
  if (kind === "price") return PRICE_UNCERTAINTY_SCOPE.test(text);
  if (kind === "quantity") return QUANTITY_UNCERTAINTY_SCOPE.test(text);
  if (kind === "time") return TIME_UNCERTAINTY_SCOPE.test(text);
  if (kind === "polarity") return polarityUncertaintyScope(contract, text);
  return false;
}

function hardPolaritySatisfied(text, contract) {
  const explicit = clean(text).replace(UNCERTAINTY_RESPONSE, " ");
  if (HARD_POLARITY_RESPONSE.test(explicit)) return true;
  if (/\b(?:maybe|probably)\b/i.test(explicit) && polarityUncertaintyScope(contract, explicit)) return true;
  return false;
}

function priceSatisfied(text, multiPart) {
  if (PRICE_CURRENCY_NUMBER.test(text) || PRICE_QUALITATIVE.test(text)) return true;
  if (PRICE_LOOSE_QUALITATIVE.test(text) && (!multiPart || PRICE_CONTEXT.test(text))) return true;
  if (PRICE_AMOUNT_WORD.test(text) && (PRICE_CONTEXT.test(text) || !multiPart)) return true;
  if (PRICE_CONTEXT.test(text) && hasNonYearNumber(text)) return true;
  if (APPROX_PRICE_NUMBER.test(text)) {
    const values = numericValues(text);
    return values.some((value) => !looksLikeYear(value));
  }
  return !multiPart && hasNonYearNumber(text);
}

function quantitySatisfied(text, multiPart) {
  if (QUANTITY_RESPONSE.test(text)) return true;
  if (!hasQuantityNumber(text)) return false;
  if (!multiPart) return true;
  if (QUANTITY_NUMERIC_CONTEXT.test(text)) return true;
  return /^\s*\d{1,3}\b/.test(text) && numericValues(text).some((value) => Number.isInteger(value) && value >= 0 && value <= 99);
}

function requirementSatisfied(kind, text, contextOverlap = 0, hard = false, multiPart = false, contract = null) {
  if (scopedUncertaintySatisfied(kind, text, multiPart, contract)) return true;
  if (kind === "price") return priceSatisfied(text, multiPart);
  if (kind === "quantity") return quantitySatisfied(text, multiPart);
  if (kind === "time") return TIME_RESPONSE.test(text);
  if (kind === "polarity") {
    if (hard) return hardPolaritySatisfied(text, contract);
    if (POLARITY_RESPONSE.test(text)) return true;
    return OPINION_RESPONSE.test(text) || contextOverlap > 0;
  }
  return true;
}

export function humanReplanPrimaryObligation({ human = null, history = [] } = {}) {
  const humanFrom = clean(human?.from, 32);
  if (!humanFrom) return { enforced: false, reason: "no-human" };

  const directTarget = clean(human?.target || "room", 32);
  if (directTarget && directTarget !== "room") {
    return {
      enforced: true,
      reason: "direct-human-target",
      speaker: directTarget,
      target: humanFrom,
      replyTo: clean(human?.messageId, 80)
    };
  }

  const parent = rowById(history, human?.replyTo || "");
  if (parent?.kind === "bot") {
    const speaker = clean(parent?.from || parent?.speaker, 32);
    if (speaker) {
      return {
        enforced: true,
        reason: "reply-to-bot-anchor",
        speaker,
        target: humanFrom,
        replyTo: clean(human?.messageId, 80),
        parentMessageId: clean(parent?.messageId || parent?.id, 80)
      };
    }
  }

  return { enforced: false, reason: "no-required-primary-response" };
}

export function evaluateHumanReplanPrimaryResponse({ lines = [], human = null, history = [] } = {}) {
  const obligation = humanReplanPrimaryObligation({ human, history });
  if (!obligation.enforced) return { ok: true, enforced: false, reason: obligation.reason, obligation };

  const first = Array.isArray(lines) ? lines[0] : null;
  if (!first || !clean(first?.text, 520)) {
    return { ok: false, enforced: true, reason: "missing-required-primary-response", obligation };
  }
  if (clean(first?.speaker, 32) !== obligation.speaker) {
    return { ok: false, enforced: true, reason: "required-responder-not-first", obligation };
  }
  if (clean(first?.target || "room", 32) !== obligation.target) {
    return { ok: false, enforced: true, reason: "required-human-target-not-first", obligation };
  }

  return {
    ok: true,
    enforced: true,
    reason: "required-primary-response-first",
    obligation,
    surface: clean(first.text, 180)
  };
}

export function buildPrimaryHumanVoiceContract({ plan = null, human = null, history = [] } = {}) {
  const move = plan?.moves?.[0] || null;
  const humanText = clean(human?.text, 420);
  const meaning = clean(move?.meaning || "", 520);
  const goal = clean(plan?.goal || "", 520);
  const intent = clean(move?.intent, 40).toLowerCase();
  const authoritative = Boolean(human && plan?.reason === "v37-human-director" && move);
  const anchor = rowById(history, human?.replyTo || "");
  const clarification = authoritative && (CLARIFY_INTENT.test(intent) || CLARIFY_HUMAN.test(humanText));
  const pivot = authoritative && intent === "pivot";
  const requirements = pivot ? [] : requirementKinds(humanText, meaning, goal);
  const questionMarks = (humanText.match(/\?/g) || []).length;
  const multiPart = Boolean(requirements.length > 1 || questionMarks > 1 || MULTIPART_CUE.test(`${humanText} ${meaning} ${goal}`));
  const contextTokens = tokens(`${humanText} ${meaning} ${goal}`);
  const anchorTokens = tokens(anchor?.text || "");

  return {
    enforced: authoritative,
    reason: authoritative ? "authoritative-direct-human" : "not-authoritative-direct-human",
    move: move ? {
      speaker: clean(move.speaker, 32),
      target: clean(move.target || "room", 32) || "room",
      intent,
      meaning
    } : null,
    human: human ? {
      from: clean(human.from, 32),
      target: clean(human.target || "room", 32) || "room",
      text: humanText,
      replyTo: clean(human.replyTo, 80)
    } : null,
    goal,
    pivot,
    clarification,
    multiPart,
    requirements,
    contextTokens: [...contextTokens],
    anchor: anchor ? {
      messageId: clean(anchor.messageId || anchor.id, 80),
      from: clean(anchor.from || anchor.speaker, 32),
      text: clean(anchor.text, 320)
    } : null,
    anchorTokens: [...anchorTokens]
  };
}

export function evaluatePrimaryHumanVoice({ plan = null, lines = [], human = null, history = [] } = {}) {
  const contract = buildPrimaryHumanVoiceContract({ plan, human, history });
  if (!contract.enforced) {
    return { ok: true, enforced: false, reason: contract.reason, contract };
  }

  const line = Array.isArray(lines) ? lines[0] : null;
  const text = clean(line?.text, 520);
  if (!line || !text) {
    return { ok: false, enforced: true, reason: "missing-primary-line", contract, coverage: [] };
  }

  if (contract.move?.speaker && clean(line.speaker, 32) !== contract.move.speaker) {
    return { ok: false, enforced: true, reason: "primary-speaker-mismatch", contract, coverage: [] };
  }
  if (contract.move?.target && clean(line.target || "room", 32) !== contract.move.target) {
    return { ok: false, enforced: true, reason: "primary-target-mismatch", contract, coverage: [] };
  }

  if (contract.pivot) {
    return { ok: true, enforced: true, reason: "pivot-semantic-shift-allowed", contract, coverage: [] };
  }

  const outputTokens = tokens(text);
  const contextOverlap = overlapCount(outputTokens, new Set(contract.contextTokens || []));
  const anchorOverlap = overlapCount(outputTokens, new Set(contract.anchorTokens || []));

  if (contract.clarification) {
    const grounded = anchorOverlap > 0 || contextOverlap > 0 || REPAIR_CUE.test(text) || UNCERTAINTY_RESPONSE.test(text);
    if (!grounded) {
      return {
        ok: false,
        enforced: true,
        reason: "clarification-ungrounded",
        contract,
        coverage: [],
        evidence: { contextOverlap, anchorOverlap, outputTokens: [...outputTokens] }
      };
    }
  }

  const coverage = (contract.requirements || []).map((kind) => {
    const hard = kind === "price" || kind === "quantity" || (kind === "polarity" && contract.multiPart);
    return { kind, hard, satisfied: requirementSatisfied(kind, text, contextOverlap, hard, contract.multiPart, contract) };
  });
  const missing = coverage.filter((row) => row.hard && !row.satisfied).map((row) => row.kind);
  if (missing.length) {
    return {
      ok: false,
      enforced: true,
      reason: `missing-${missing.join("+")}`,
      contract,
      coverage,
      evidence: { contextOverlap, anchorOverlap, outputTokens: [...outputTokens] }
    };
  }

  return {
    ok: true,
    enforced: true,
    reason: coverage.some((row) => row.hard) ? "recognized-obligations-covered" : contract.clarification ? "clarification-grounded" : "no-provable-semantic-omission",
    contract,
    coverage,
    evidence: { contextOverlap, anchorOverlap, outputTokens: [...outputTokens] }
  };
}
