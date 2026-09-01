import {
  V40_MAX_SCENE_TURNS,
  V40_MOMENTUM_WINDOW_MS,
  V40_RECENT_HUMAN_SCENE_MS,
  V40_TARGET_SCENE_TURNS,
  inferSceneMomentumCandidate
} from "./scene_continuity_v40.js";
import { canonicalRoomTopic } from "./quality_guard_v38.js";

export const V41_FATIGUE_WARN_TURNS = 8;
export const V41_FATIGUE_STRONG_TURNS = 12;
export const V41_FATIGUE_CLOSE_TURNS = 15;
export const V41_LEGACY_TOPIC_COOLDOWN_MS = 2 * 60 * 1000;

function sceneIdOf(row = {}) {
  return String(row.sceneId || row._continuitySceneId || row.scenePlanId || row.threadId || "");
}

function conversational(row) {
  return row?.kind === "bot" || row?.kind === "human" || Boolean(row?.speaker && row?.text);
}

function uniqueNames(rows = [], seed = []) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const name = String(value || "").trim();
    if (!name || name === "room" || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };
  for (const value of seed || []) add(value);
  for (const row of rows || []) {
    add(row?.from || row?.speaker);
    add(row?.target);
  }
  return out;
}

function closed(scene) {
  return Boolean(scene?.closedAt || scene?.status === "closed");
}

function fatiguePhase(turns) {
  const count = Number(turns || 0);
  if (count >= V41_FATIGUE_CLOSE_TURNS) return "exhausted";
  if (count >= V41_FATIGUE_STRONG_TURNS) return "strong";
  if (count >= V41_FATIGUE_WARN_TURNS) return "aging";
  return "fresh";
}

export class SceneCoordinator {
  constructor(room) {
    this.room = room;
    this.stats = {
      momentumQueries: 0,
      momentumEligible: 0,
      ambientHumanOwnershipBlocks: 0,
      fatigueQueries: 0,
      continuationQueries: 0,
      continuationBlocks: 0,
      closureQueries: 0,
      humanProtectedClosures: 0,
      scenesClosed: 0,
      ambientExhaustionCloses: 0,
      legacyFinishCloses: 0,
      roomTopicFatigueCloses: 0,
      humanPivotCloses: 0
    };
    this.lastDecision = null;
    this.lastClose = null;
  }

  history() {
    return this.room?.history || [];
  }

  activeHumanNames() {
    return this.room?.humanNames?.() || [];
  }

  recentHumanNames(now = Date.now()) {
    const names = new Set(this.activeHumanNames().map((name) => String(name || "").trim()).filter(Boolean));
    for (const row of this.history()) {
      if (row?.kind !== "human") continue;
      const at = Number(row.at || 0);
      if (!at || Number(now || 0) - at > V40_RECENT_HUMAN_SCENE_MS) continue;
      const name = String(row.from || "").trim();
      if (name) names.add(name);
    }
    return names;
  }

  rowsForScene(sceneId, now = Date.now(), windowMs = Infinity) {
    if (!sceneId) return [];
    return this.history().filter((row) => {
      if (!conversational(row) || sceneIdOf(row) !== sceneId) return false;
      if (!Number.isFinite(windowMs)) return true;
      return Number(now || 0) - Number(row.at || 0) <= windowMs;
    });
  }

  ambientHumanOwnership(momentum, now = Date.now()) {
    if (!momentum?.sceneId) return { owned: false, reason: "no-scene", human: "" };
    const rows = this.rowsForScene(momentum.sceneId, now, V40_MOMENTUM_WINDOW_MS);
    const humans = this.recentHumanNames(now);
    const exactHuman = [...rows].reverse().find((row) =>
      row?.kind === "human"
      && Number(now || 0) - Number(row.at || 0) <= V40_RECENT_HUMAN_SCENE_MS
    ) || null;
    if (exactHuman) return { owned: true, reason: "recent-human-in-scene", human: exactHuman.from || "" };

    const scene = this.room?.sceneBoard?.get?.(momentum.sceneId) || null;
    const participants = uniqueNames(rows, scene?.participants || []);
    const participantHuman = participants.find((name) => humans.has(name)) || "";
    if (participantHuman) return { owned: true, reason: "active-or-recent-human-participant", human: participantHuman };
    return { owned: false, reason: "bot-only", human: "" };
  }

  closureHumanOwnership(scene, now = Date.now()) {
    if (!scene?.id) return { protected: false, reason: "no-scene", human: "" };
    const activeHumans = new Set(this.activeHumanNames());
    const openTarget = String(scene?.openQuestion?.target || "");
    if (openTarget && activeHumans.has(openTarget)) {
      return { protected: true, reason: "open-question-targets-active-human", human: openTarget };
    }

    const recentHuman = [...this.history()].reverse().find((row) =>
      row?.kind === "human"
      && row.sceneId === scene.id
      && Number(now || 0) - Number(row.at || 0) <= V40_RECENT_HUMAN_SCENE_MS
    ) || null;
    if (recentHuman) return { protected: true, reason: "recent-human-in-exact-scene", human: recentHuman.from || "" };
    return { protected: false, reason: "no-human-closure-protection", human: "" };
  }

  ambientMomentum(now = Date.now(), { record = true } = {}) {
    if (record) this.stats.momentumQueries += 1;
    const candidate = inferSceneMomentumCandidate(this.history(), now);
    if (!candidate) {
      if (record) this.lastDecision = { kind: "ambient-momentum", action: "none", reason: "no-candidate", at: now };
      return null;
    }

    const ownership = this.ambientHumanOwnership(candidate, now);
    if (ownership.owned) {
      if (record) {
        this.stats.ambientHumanOwnershipBlocks += 1;
        this.lastDecision = {
          kind: "ambient-momentum",
          action: "block",
          reason: ownership.reason,
          sceneId: candidate.sceneId,
          human: ownership.human,
          at: now
        };
      }
      return null;
    }

    if (record) {
      this.stats.momentumEligible += 1;
      this.lastDecision = {
        kind: "ambient-momentum",
        action: "continue",
        reason: candidate.phase,
        sceneId: candidate.sceneId,
        turns: candidate.turns,
        at: now
      };
    }
    return candidate;
  }

  fatigueForScene(scene, now = Date.now(), { record = true } = {}) {
    if (record) this.stats.fatigueQueries += 1;
    if (!scene) return { phase: "none", turns: 0, canClose: false, humanProtection: null };
    const turns = Number(scene.turns || 0);
    const humanProtection = this.closureHumanOwnership(scene, now);
    return {
      sceneId: scene.id || "",
      turns,
      phase: fatiguePhase(turns),
      canClose: turns >= V41_FATIGUE_CLOSE_TURNS && !humanProtection.protected,
      humanProtection
    };
  }

  fatiguedScene(now = Date.now()) {
    const scenes = typeof this.room?.openScenes === "function" ? this.room.openScenes(now) : [];
    const scene = [...(scenes || [])]
      .filter((item) => Number(item?.turns || 0) >= V41_FATIGUE_WARN_TURNS)
      .sort((a, b) => Number(b?.turns || 0) - Number(a?.turns || 0))[0] || null;
    if (scene) this.fatigueForScene(scene, now);
    return scene;
  }

  continuationDecision(scene, message = null, now = Date.now()) {
    this.stats.continuationQueries += 1;
    if (!scene) {
      this.stats.continuationBlocks += 1;
      this.lastDecision = { kind: "scene-continuation", action: "block", reason: "no-scene", at: now };
      return { allow: false, reason: "no-scene" };
    }
    if (closed(scene)) {
      this.stats.continuationBlocks += 1;
      this.lastDecision = { kind: "scene-continuation", action: "block", reason: "scene-closed", sceneId: scene.id || "", at: now };
      return { allow: false, reason: "scene-closed" };
    }
    this.lastDecision = {
      kind: "scene-continuation",
      action: "allow",
      reason: message?._v37ForceNewScene ? "lower-layer-force-new-already-resolved" : "scene-open",
      sceneId: scene.id || "",
      at: now
    };
    return { allow: true, reason: "scene-open" };
  }

  closeScene(scene, { source = "scene-coordinator", reason = "closed", now = Date.now() } = {}) {
    this.stats.closureQueries += 1;
    if (!scene || closed(scene)) return null;
    scene.status = "closed";
    scene.closedAt = now;
    scene.closeReason = reason;
    if (this.room?.sceneStats) this.room.sceneStats.closed = Number(this.room.sceneStats.closed || 0) + 1;

    this.stats.scenesClosed += 1;
    if (source === "v37-ambient-exhaustion") this.stats.ambientExhaustionCloses += 1;
    else if (source === "v26-finish-plan") this.stats.legacyFinishCloses += 1;
    else if (source === "v38-room-topic-fatigue") this.stats.roomTopicFatigueCloses += 1;
    else if (source === "v37-human-pivot") this.stats.humanPivotCloses += 1;

    const record = {
      sceneId: scene.id || "",
      topic: scene.topic || "general",
      turns: Number(scene.turns || 0),
      source,
      reason,
      at: now
    };
    this.lastClose = record;
    this.lastDecision = { kind: "scene-close", action: "close", ...record };
    return record;
  }

  closeExhaustedScenes({ source, reason, now = Date.now(), minTurns = V41_FATIGUE_CLOSE_TURNS } = {}) {
    const scenes = typeof this.room?.openScenes === "function" ? this.room.openScenes(now) : [];
    const closedRows = [];
    for (const scene of scenes || []) {
      if (Number(scene?.turns || 0) < Number(minTurns || V41_FATIGUE_CLOSE_TURNS)) continue;
      this.stats.closureQueries += 1;
      const ownership = this.closureHumanOwnership(scene, now);
      if (ownership.protected) {
        this.stats.humanProtectedClosures += 1;
        this.lastDecision = {
          kind: "scene-close",
          action: "protect",
          reason: ownership.reason,
          sceneId: scene.id || "",
          human: ownership.human,
          source,
          at: now
        };
        continue;
      }
      // closeScene owns the actual mutation; discount the query increment above so
      // one examined eligible scene remains one closure query in diagnostics.
      this.stats.closureQueries -= 1;
      const record = this.closeScene(scene, { source, reason, now });
      if (record) closedRows.push(record);
    }
    return closedRows;
  }

  closeTopicFatigueScenes(topics = [], now = Date.now()) {
    const cooling = new Set((topics || []).map((item) => typeof item === "string" ? item : item?.topic).filter(Boolean));
    if (!cooling.size) return [];
    const scenes = typeof this.room?.openScenes === "function" ? this.room.openScenes(now) : [];
    const closedRows = [];

    for (const scene of scenes || []) {
      if (closed(scene)) continue;
      const topic = canonicalRoomTopic({ topic: scene?.topic, text: scene?.lastText || "" });
      if (!topic || !cooling.has(topic)) continue;
      this.stats.closureQueries += 1;
      const ownership = this.closureHumanOwnership(scene, now);
      if (ownership.protected) {
        this.stats.humanProtectedClosures += 1;
        this.lastDecision = {
          kind: "scene-close",
          action: "protect",
          reason: ownership.reason,
          sceneId: scene.id || "",
          human: ownership.human,
          source: "v38-room-topic-fatigue",
          at: now
        };
        continue;
      }
      this.stats.closureQueries -= 1;
      const record = this.closeScene(scene, {
        source: "v38-room-topic-fatigue",
        reason: "v38 room-wide topic fatigue",
        now
      });
      if (record) closedRows.push({ ...record, topic });
    }
    return closedRows;
  }

  closeHumanPivotScene(sceneId, now = Date.now()) {
    if (!sceneId || typeof this.room?.openScenes !== "function") return null;
    const scene = (this.room.openScenes(now) || []).find((item) => item?.id === sceneId) || null;
    if (!scene || closed(scene)) return null;
    return this.closeScene(scene, {
      source: "v37-human-pivot",
      reason: "v37 human pivot",
      now
    });
  }

  snapshot(now = Date.now()) {
    return {
      stats: { ...this.stats },
      currentMomentum: this.ambientMomentum(now, { record: false }),
      lastDecision: this.lastDecision,
      lastClose: this.lastClose,
      policy: {
        preservesV17SceneIds: true,
        ambientMomentumWindowMs: V40_MOMENTUM_WINDOW_MS,
        ambientTargetTurns: V40_TARGET_SCENE_TURNS,
        ambientCarryStopsAtTurns: V40_MAX_SCENE_TURNS,
        recentHumanProtectionMs: V40_RECENT_HUMAN_SCENE_MS,
        fatigueWarnTurns: V41_FATIGUE_WARN_TURNS,
        fatigueStrongTurns: V41_FATIGUE_STRONG_TURNS,
        fatigueCloseTurns: V41_FATIGUE_CLOSE_TURNS,
        v17AgeAndStorageLifecycleRemainBaseOwnedIn1A: true,
        noProviderCalls: true
      }
    };
  }
}
