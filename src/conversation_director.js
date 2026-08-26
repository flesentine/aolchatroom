import { conversationMessageId, snapshotConversationState } from "./conversation_state.js";

export const DIRECTOR_MOVE_TYPES = Object.freeze(["answer", "clarify", "respond", "continue", "pivot", "start"]);
export const DIRECTOR_SCENE_ACTIONS = Object.freeze(["continue", "replace", "revive"]);
export const DIRECTOR_FAILURE_CATEGORIES = Object.freeze(["context/state", "director", "voice", "provider", "validator"]);

const QUESTION_CUE = /\?|^\s*(?:who|what|when|where|why|how|which|whose|can|could|would|should|do|does|did|is|are|was|were)\b/i;
const CLARIFY_CUE = /\b(?:what do you mean|what d(?:o|id) u mean|what tags?|which tags?|which one|who is (?:he|she|that)|who's (?:he|she|that)|who are you talking about|you mean who|what does that mean|huh)\b/i;
const PIVOT_CUE = /\b(?:change the subject|talk about something else|enough about|still talking about|keep talking about|love talking about|back to .* again|move on|new topic)\b/i;

function compact(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanName(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24);
}

function uniqueRows(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row) continue;
    const id = row.messageId || row.id || `${row.at || 0}|${row.from || ""}|${row.text || ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function packetLine(row, index = 0) {
  if (!row) return null;
  return {
    messageId: conversationMessageId(row, index),
    at: Number(row.at || 0),
    from: cleanName(row.from),
    target: cleanName(row.target || "room") || "room",
    kind: compact(row.kind || "", 20),
    text: compact(row.text, 240),
    replyTo: compact(row.replyTo || "", 120),
    subject: compact(row.conversationSubject || row.subject || "", 160),
    sceneId: compact(row.sceneId || "", 80),
    threadId: compact(row.threadId || "", 80),
    topic: compact(row.topic || "", 40)
  };
}

export function deterministicHumanObligation(triggerRow, onlineBots = []) {
  if (triggerRow?.kind !== "human") return null;
  const target = cleanName(triggerRow.target || "room");
  if (!target || target === "room" || !(onlineBots || []).includes(target)) return null;
  const from = cleanName(triggerRow.from);
  if (!from) return null;
  return {
    speaker: target,
    target: from,
    replyTo: conversationMessageId(triggerRow),
    locked: true,
    reason: "direct-human-target"
  };
}

export function buildContextPacket({ history = [], state = null, triggerRow = null, onlineBots = [], maxRelevant = 10 } = {}) {
  const rows = Array.isArray(history) ? history : [];
  const trigger = triggerRow || rows[rows.length - 1] || null;
  const triggerId = trigger ? conversationMessageId(trigger, rows.length - 1) : "";
  const snapshot = snapshotConversationState(state);
  const obligation = deterministicHumanObligation(trigger, onlineBots);
  const wantedReplyTo = compact(trigger?.replyTo || snapshot.openHumanQuestion?.messageId || "", 120);
  const exactReplyTo = wantedReplyTo
    ? rows.find((row, index) => conversationMessageId(row, index) === wantedReplyTo || String(row?.messageId || row?.id || "") === wantedReplyTo) || null
    : null;

  const recent = rows.filter((row) => row?.kind !== "system").slice(-Math.max(1, Number(maxRelevant || 10)));
  const selected = uniqueRows([exactReplyTo, ...recent, trigger]);
  const lines = selected.map((row, index) => packetLine(row, index)).filter(Boolean);

  return {
    version: 1,
    builtAt: Date.now(),
    triggerMessageId: triggerId,
    trigger: packetLine(trigger, rows.length - 1),
    exactReplyTo: packetLine(exactReplyTo, 0),
    openHumanQuestion: snapshot.openHumanQuestion,
    activeScene: snapshot.activeScene,
    previousScene: snapshot.previousScene,
    recentReferents: snapshot.recentReferents,
    onlineBots: [...(onlineBots || [])],
    obligation,
    lines
  };
}

export function packetContainsRequiredContext(packet, requirement = {}) {
  if (!packet) return false;
  if (requirement.replyToId) {
    const id = String(requirement.replyToId);
    const exact = String(packet.exactReplyTo?.messageId || "") === id;
    const visible = (packet.lines || []).some((row) => String(row.messageId || "") === id);
    if (!exact && !visible) return false;
  }
  if (requirement.openHumanQuestion) {
    if (!packet.openHumanQuestion?.messageId) return false;
  }
  if (requirement.referentText) {
    const needle = compact(requirement.referentText, 160).toLowerCase();
    const present = (packet.lines || []).some((row) => String(row.text || "").toLowerCase().includes(needle));
    if (!present) return false;
  }
  return true;
}

export function inferHumanMoveType(text) {
  const value = String(text || "");
  if (PIVOT_CUE.test(value)) return "pivot";
  if (CLARIFY_CUE.test(value)) return "clarify";
  if (QUESTION_CUE.test(value)) return "answer";
  return "respond";
}

export function structuralShadowMove(packet) {
  const trigger = packet?.trigger;
  if (!trigger || trigger.kind !== "human") return null;
  const obligation = packet.obligation;
  const moveType = inferHumanMoveType(trigger.text);
  const sceneAction = moveType === "pivot" ? "replace" : "continue";
  if (!obligation) {
    return {
      complete: false,
      needsSpeakerSelection: true,
      target: trigger.from || "room",
      replyTo: trigger.messageId || packet.triggerMessageId || "",
      subject: compact(packet.activeScene?.subject || trigger.text, 140),
      moveType,
      goal: moveType === "pivot"
        ? `Acknowledge that ${trigger.from || "the human"} wants to move away from the current subject and choose a genuinely different subject.`
        : `Respond naturally to ${trigger.from || "the human"}'s latest message using the compact context packet.`,
      sceneAction
    };
  }

  return {
    complete: true,
    speaker: obligation.speaker,
    target: obligation.target,
    replyTo: obligation.replyTo,
    subject: compact(packet.activeScene?.subject || trigger.text, 140),
    moveType,
    goal: moveType === "clarify"
      ? `Answer ${trigger.from}'s clarification request using the exact preceding context; explain the referenced thing rather than starting a new topic.`
      : moveType === "pivot"
        ? `Briefly acknowledge ${trigger.from}'s topic fatigue and move away from the current subject.`
        : `Directly answer ${trigger.from}'s latest message before changing subject.`,
    sceneAction
  };
}

export function directorPrompt(packet, constraints = {}) {
  const locked = packet?.obligation;
  const lockText = locked
    ? `LOCKED ROUTING: speaker=${locked.speaker}, target=${locked.target}, replyTo=${locked.replyTo}. Do not change these fields.`
    : "No speaker is structurally locked. Choose one currently-online bot only.";
  const lines = (packet?.lines || []).map((row) => `${row.from}${row.target && row.target !== "room" ? ` -> ${row.target}` : ""}: ${row.text}`).join("\n");
  return `You are the Conversation Director for a live 1996 AOL-style public room. Decide ONE next social move only. Do not write dialogue. Do not plan future turns.\n\n${lockText}\n\nCURRENT STATE:\nactive subject: ${packet?.activeScene?.subject || "unknown"}\nprevious subject: ${packet?.previousScene?.subject || "none"}\nopen human question: ${packet?.openHumanQuestion ? `${packet.openHumanQuestion.from} -> ${packet.openHumanQuestion.target}: ${packet.openHumanQuestion.text}` : "none"}\nrecent referents: ${(packet?.recentReferents || []).map((r) => r.value).join(", ") || "none"}\n\nRECENT RELEVANT LINES:\n${lines || "none"}\n\nReturn JSON only with exactly these fields:\n{"speaker":"...","target":"...","replyTo":"...","subject":"...","moveType":"answer|clarify|respond|continue|pivot|start","goal":"...","sceneAction":"continue|replace|revive"}\n\nRules:\n- The goal describes meaning/purpose, not wording.\n- A direct unresolved human question outranks ambient chatter.\n- If a local reference is obvious, resolve it. If genuinely ambiguous, make the goal ask/confirm naturally.\n- A human asking to move on must not be answered by deepening the rejected subject.\n- Subject continuity matters more than broad topic labels.\n- Only one move. No second speaker, no scripted sequence.\n- Do not invent public or private facts; downstream Character State and World Model own facts.\n${constraints.extra || ""}`;
}

function parseJsonObject(raw) {
  if (raw && typeof raw === "object") return raw;
  let text = String(raw || "").trim();
  if (!text) return null;
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export function parseDirectorMove(raw, context = {}) {
  const parsed = parseJsonObject(raw);
  const move = parsed?.move && typeof parsed.move === "object" ? parsed.move : parsed;
  if (!move || typeof move !== "object") return { ok: false, error: "invalid-json", move: null };

  const speaker = cleanName(move.speaker);
  const target = cleanName(move.target || "room") || "room";
  const replyTo = compact(move.replyTo || "", 120);
  const subject = compact(move.subject, 160);
  const moveType = compact(move.moveType, 20);
  const goal = compact(move.goal, 420);
  const sceneAction = compact(move.sceneAction, 20);
  const onlineBots = new Set(context.onlineBots || []);
  const validTargets = new Set(["room", ...(context.onlineBots || []), ...(context.humans || [])]);

  if (!speaker || !onlineBots.has(speaker)) return { ok: false, error: "invalid-speaker", move: null };
  if (!validTargets.has(target)) return { ok: false, error: "invalid-target", move: null };
  if (!DIRECTOR_MOVE_TYPES.includes(moveType)) return { ok: false, error: "invalid-move-type", move: null };
  if (!DIRECTOR_SCENE_ACTIONS.includes(sceneAction)) return { ok: false, error: "invalid-scene-action", move: null };
  if (!subject || !goal) return { ok: false, error: "missing-subject-or-goal", move: null };

  if (context.obligation) {
    if (speaker !== context.obligation.speaker || target !== context.obligation.target) {
      return { ok: false, error: "violates-routing-lock", move: null };
    }
    if (context.obligation.replyTo && replyTo !== context.obligation.replyTo) {
      return { ok: false, error: "violates-replyto-lock", move: null };
    }
  }

  return { ok: true, error: "", move: { speaker, target, replyTo, subject, moveType, goal, sceneAction } };
}

export function attributeDirectorFailure({ providerError = false, packetOk = true, parsedOk = true, decisionOk = true, voiceOk = true, validatorOk = true } = {}) {
  if (providerError) return "provider";
  if (!packetOk) return "context/state";
  if (!parsedOk || !decisionOk) return "director";
  if (!voiceOk) return "voice";
  if (!validatorOk) return "validator";
  return "";
}
