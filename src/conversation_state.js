export const CONVERSATION_STATE_VERSION = 1;
export const RECENT_REFERENT_LIMIT = 5;

const QUESTION_CUE = /\?|^\s*(?:who|what|when|where|why|how|which|whose|can|could|would|should|do|does|did|is|are|was|were)\b|\b(?:what do you mean|what d(?:o|id) u mean|who is (?:he|she|that)|who's (?:he|she|that)|which one|which tags?)\b/i;

function compact(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unique(values, max = 12) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const key = String(value || "").trim();
    if (!key || key === "room" || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

export function conversationMessageId(row, index = 0) {
  if (row?.messageId) return String(row.messageId);
  if (row?.id) return String(row.id);
  const seed = `${Number(row?.at || 0)}|${row?.from || ""}|${row?.kind || ""}|${compact(row?.text, 160)}|${index}`;
  return `v37-${hashString(seed).toString(36)}`;
}

export function createConversationState(now = Date.now()) {
  return {
    version: CONVERSATION_STATE_VERSION,
    activeScene: null,
    previousScene: null,
    openHumanQuestion: null,
    recentReferents: [],
    lastObservedMessageId: "",
    updatedAt: Number(now || 0)
  };
}

export function isDirectHumanQuestion(row) {
  if (row?.kind !== "human") return false;
  const target = String(row?.target || "room");
  if (!target || target === "room") return false;
  return QUESTION_CUE.test(String(row?.text || ""));
}

function normalizeReferent(ref, now = Date.now()) {
  if (!ref) return null;
  if (typeof ref === "string") {
    const value = compact(ref, 120);
    return value ? { value, type: "unknown", at: now } : null;
  }
  const value = compact(ref.value || ref.name || ref.text, 120);
  if (!value) return null;
  return {
    value,
    type: compact(ref.type || "unknown", 30) || "unknown",
    at: Number(ref.at || now)
  };
}

export function recordReferents(state, referents = [], now = Date.now()) {
  const next = { ...(state || createConversationState(now)) };
  const merged = [];
  const seen = new Set();
  const candidates = [...(referents || []), ...(next.recentReferents || [])];
  for (const raw of candidates) {
    const ref = normalizeReferent(raw, now);
    if (!ref) continue;
    const key = `${ref.type.toLowerCase()}|${ref.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
    if (merged.length >= RECENT_REFERENT_LIMIT) break;
  }
  next.recentReferents = merged;
  next.updatedAt = now;
  return next;
}

export function applySceneObservation(state, observation = {}) {
  const now = Number(observation.now || Date.now());
  const next = { ...(state || createConversationState(now)) };
  const action = String(observation.sceneAction || "");
  const subject = compact(observation.subject, 160);
  const participants = unique(observation.participants || []);
  const lastMessageId = compact(observation.lastMessageId, 120);

  if (!subject || !["continue", "replace", "revive"].includes(action)) return next;

  if (action === "replace") {
    if (next.activeScene) next.previousScene = { ...next.activeScene };
    next.activeScene = {
      id: compact(observation.sceneId || `scene-${now}`, 80),
      subject,
      participants,
      lastMessageId,
      lastActivityAt: now
    };
    next.recentReferents = [];
  } else if (action === "revive") {
    const revived = next.previousScene && compact(next.previousScene.subject, 160) === subject
      ? { ...next.previousScene }
      : null;
    if (next.activeScene) next.previousScene = { ...next.activeScene };
    next.activeScene = {
      id: compact(revived?.id || observation.sceneId || `scene-${now}`, 80),
      subject,
      participants: unique([...(revived?.participants || []), ...participants]),
      lastMessageId,
      lastActivityAt: now
    };
    next.recentReferents = [];
  } else {
    const current = next.activeScene || {
      id: compact(observation.sceneId || `scene-${now}`, 80),
      subject,
      participants: [],
      lastMessageId: "",
      lastActivityAt: now
    };
    next.activeScene = {
      ...current,
      subject,
      participants: unique([...(current.participants || []), ...participants]),
      lastMessageId: lastMessageId || current.lastMessageId || "",
      lastActivityAt: now
    };
  }

  next.updatedAt = now;
  return next;
}

export function observeConversationMessage(state, row, options = {}) {
  const now = Number(row?.at || options.now || Date.now());
  let next = { ...(state || createConversationState(now)) };
  if (!row || typeof row !== "object") return next;

  const id = conversationMessageId(row, options.index || 0);
  const target = String(row.target || "room");
  next.lastObservedMessageId = id;
  next.updatedAt = now;

  if (isDirectHumanQuestion(row)) {
    next.openHumanQuestion = {
      messageId: id,
      from: compact(row.from, 40),
      target: compact(target, 40),
      text: compact(row.text, 220),
      at: now
    };
  } else if (next.openHumanQuestion && row.kind === "bot") {
    const open = next.openHumanQuestion;
    const replyToMatches = String(row.replyTo || "") === String(open.messageId || "");
    const pairMatches = String(row.from || "") === String(open.target || "")
      && String(target || "") === String(open.from || "");
    if (replyToMatches || pairMatches) next.openHumanQuestion = null;
  }

  const subject = compact(options.subject || row.conversationSubject || row.subject, 160);
  const sceneAction = String(options.sceneAction || row.sceneAction || "");
  if (subject && ["continue", "replace", "revive"].includes(sceneAction)) {
    next = applySceneObservation(next, {
      subject,
      sceneAction,
      sceneId: options.sceneId || row.sceneId,
      participants: [row.from, target],
      lastMessageId: id,
      now
    });
  } else if (next.activeScene) {
    next.activeScene = {
      ...next.activeScene,
      participants: unique([...(next.activeScene.participants || []), row.from, target]),
      lastMessageId: id,
      lastActivityAt: now
    };
  }

  const referents = options.referents || row.referents || [];
  if (Array.isArray(referents) && referents.length) next = recordReferents(next, referents, now);
  return next;
}

export function reconstructConversationState(history = [], options = {}) {
  const rows = Array.isArray(history) ? history.slice(-Math.max(1, Number(options.maxRows || 40))) : [];
  let state = createConversationState(Number(rows[0]?.at || options.now || Date.now()));
  rows.forEach((row, index) => {
    state = observeConversationMessage(state, row, { index });
  });
  return state;
}

export function snapshotConversationState(state) {
  const value = state || createConversationState();
  return {
    version: value.version || CONVERSATION_STATE_VERSION,
    activeScene: value.activeScene ? { ...value.activeScene } : null,
    previousScene: value.previousScene ? { ...value.previousScene } : null,
    openHumanQuestion: value.openHumanQuestion ? { ...value.openHumanQuestion } : null,
    recentReferents: (value.recentReferents || []).map((row) => ({ ...row })),
    lastObservedMessageId: value.lastObservedMessageId || "",
    updatedAt: Number(value.updatedAt || 0)
  };
}
