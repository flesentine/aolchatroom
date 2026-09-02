import { SceneCoordinator } from "./scene_coordinator_v41.js";
import { V40_MOMENTUM_WINDOW_MS } from "./scene_continuity_v40.js";
import {
  inspectEffectiveOpenQuestion,
  selectSceneAssociationV41D,
  V41D_AMBIGUITY_MARGIN,
  V41D_DIRECT_ASSOCIATION_THRESHOLD,
  V41D_OPEN_QUESTION_WINDOW_MS,
  V41D_ROOM_ASSOCIATION_THRESHOLD
} from "./scene_ownership_policy_v41.js";

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function participantNames(rows = []) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    for (const value of [row?.from || row?.speaker, row?.target]) {
      const name = clean(value);
      if (!name || name === "room" || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export class SceneOwnershipCoordinator extends SceneCoordinator {
  constructor(room) {
    super(room);
    Object.assign(this.stats, {
      staleOpenQuestionAssociationBlocks: 0,
      answeredOpenQuestionAssociationBlocks: 0,
      roomContinuityEligibilityBlocks: 0,
      humanReplanPlansStabilized: 0,
      humanReplanLinesExamined: 0,
      humanReplanDirectReplyAnchors: 0,
      humanReplanSideLinesDetached: 0,
      humanReplanSceneCarriesRetired: 0,
      sideLineSceneCapEvictionBlocks: 0,
      ambientRecentHumanOwnershipBlocks: 0
    });
    this.associationHistory = [];
  }

  associationRecord(args = {}) {
    const result = super.associationRecord(args);
    const row = {
      sceneId: result.sceneId || "",
      reason: result.reason || "",
      score: Number(result.score || 0),
      from: result.from || "",
      target: result.target || "room",
      text: result.text || "",
      candidates: result.candidates || [],
      at: Number(result.at || Date.now())
    };
    this.associationHistory.push(row);
    this.associationHistory = this.associationHistory.slice(-20);
    return result;
  }

  associateScene(message, now = Date.now()) {
    this.stats.associationQueries += 1;
    if (!message) {
      this.stats.associationRejects += 1;
      return this.associationRecord({ message, reason: "no-message", at: now });
    }
    if (message?._v37ForceNewScene) {
      this.stats.forcedNewAssociations += 1;
      return this.associationRecord({ message, reason: "forced-new-scene", at: now });
    }

    if (message.sceneId) {
      const explicit = this.sceneById(message.sceneId);
      if (explicit) {
        this.stats.explicitAssociations += 1;
        return this.associationRecord({ message, scene: explicit, reason: "explicit-scene-id", score: 100, at: now });
      }
      this.stats.associationRejects += 1;
      return this.associationRecord({ message, reason: "explicit-scene-missing", score: 100, at: now });
    }

    const parent = this.room?.messageById?.(message.replyTo) || null;
    if (parent?.sceneId) {
      const replyScene = this.sceneById(parent.sceneId);
      if (replyScene) {
        this.stats.replyToAssociations += 1;
        return this.associationRecord({ message, scene: replyScene, reason: "reply-to", score: 100, at: now });
      }
      this.stats.associationRejects += 1;
      return this.associationRecord({ message, reason: "reply-scene-missing", score: 100, at: now });
    }

    const scenes = typeof this.room?.openScenes === "function" ? this.room.openScenes(now) : [];
    const selected = selectSceneAssociationV41D({ message, scenes, history: this.history(), now });
    const ignoredStale = (selected.candidates || []).some((candidate) => candidate?.features?.staleOpenQuestionIgnored);
    const ignoredAnswered = (selected.candidates || []).some((candidate) => candidate?.features?.answeredOpenQuestionIgnored);
    if (ignoredStale) this.stats.staleOpenQuestionAssociationBlocks += 1;
    if (ignoredAnswered) this.stats.answeredOpenQuestionAssociationBlocks += 1;

    const scene = selected.sceneId ? this.sceneById(selected.sceneId) : null;
    if (!scene) {
      this.stats.associationRejects += 1;
      if (selected.reason === "ambiguous") this.stats.ambiguousAssociationRejects += 1;
      if (selected.reason === "room-continuity-ineligible") this.stats.roomContinuityEligibilityBlocks += 1;
      return this.associationRecord({
        message,
        reason: selected.reason,
        score: selected.score,
        candidates: selected.candidates,
        at: now
      });
    }

    this.stats.scoredAssociations += 1;
    if (selected.reason === "direct-pair" || selected.reason === "open-question") this.stats.directPairAssociations += 1;
    else if (selected.reason === "participant-context" || selected.reason === "participant-continuation") this.stats.participantAssociations += 1;
    else if (selected.reason === "topic-context") this.stats.topicContextAssociations += 1;
    return this.associationRecord({
      message,
      scene,
      reason: selected.reason,
      score: selected.score,
      candidates: selected.candidates,
      at: now
    });
  }

  ambientHumanOwnership(momentum, now = Date.now()) {
    if (!momentum?.sceneId) return { owned: false, reason: "no-scene", human: "" };
    const rows = this.rowsForScene(momentum.sceneId, now, V40_MOMENTUM_WINDOW_MS);
    const humans = this.recentHumanNames(now);
    const exactHuman = [...rows].reverse().find((row) => row?.kind === "human") || null;
    if (exactHuman) {
      this.stats.ambientRecentHumanOwnershipBlocks += 1;
      return { owned: true, reason: "recent-human-in-scene", human: exactHuman.from || "" };
    }
    const participantHuman = participantNames(rows).find((name) => humans.has(name)) || "";
    if (participantHuman) {
      this.stats.ambientRecentHumanOwnershipBlocks += 1;
      return { owned: true, reason: "active-or-recent-human-in-momentum-window", human: participantHuman };
    }
    return { owned: false, reason: "recent-bot-only", human: "" };
  }

  closureHumanOwnership(scene, now = Date.now()) {
    if (!scene?.id) return { protected: false, reason: "no-scene", human: "" };
    const questionState = inspectEffectiveOpenQuestion(scene, this.history(), now);
    const activeHumans = new Set(this.activeHumanNames());
    const openTarget = String(questionState.question?.target || "");
    if (openTarget && activeHumans.has(openTarget)) {
      return { protected: true, reason: "effective-open-question-targets-active-human", human: openTarget };
    }

    const recentHuman = [...this.history()].reverse().find((row) =>
      row?.kind === "human"
      && row.sceneId === scene.id
      && Number(now || 0) - Number(row.at || 0) <= 90000
    ) || null;
    if (recentHuman) return { protected: true, reason: "recent-human-in-exact-scene", human: recentHuman.from || "" };
    return { protected: false, reason: "no-effective-human-closure-protection", human: "" };
  }

  stabilizeHumanReplanPlan(plan, queue = []) {
    if (!plan?.id || plan.reason !== "human-replan") return { examined: 0, detached: 0, anchored: 0, retired: 0 };
    const items = (queue || []).filter((item) => item?._scenePlanId === plan.id);
    if (!items.length) return { examined: 0, detached: 0, anchored: 0, retired: 0 };

    this.stats.humanReplanPlansStabilized += 1;
    this.room?.clearSceneCarryPlan?.(plan.id);
    let detached = 0;
    let anchored = 0;
    let retired = 0;
    for (const item of items) {
      this.stats.humanReplanLinesExamined += 1;
      if (item._continuitySceneId) {
        delete item._continuitySceneId;
        retired += 1;
      }

      const directToHuman = Boolean(plan.triggerFrom && item.target === plan.triggerFrom);
      const alreadyRepliesToHuman = Boolean(plan.triggerMessageId && item.replyTo === plan.triggerMessageId);
      if ((directToHuman || alreadyRepliesToHuman) && plan.triggerMessageId) {
        if (!item.replyTo) item.replyTo = plan.triggerMessageId;
        anchored += 1;
        continue;
      }

      item._v41HumanReplanSideLine = true;
      detached += 1;
    }

    this.stats.humanReplanDirectReplyAnchors += anchored;
    this.stats.humanReplanSideLinesDetached += detached;
    this.stats.humanReplanSceneCarriesRetired += retired;
    return { examined: items.length, detached, anchored, retired };
  }

  isHumanReplanSideMessage(message) {
    if (message?._v41HumanReplanSideLine) return true;
    if (message?.planReason !== "human-replan") return false;
    const plan = this.room?.currentScenePlan || null;
    if (!plan || plan.reason !== "human-replan") return false;
    if (plan.triggerMessageId && message?.replyTo === plan.triggerMessageId) return false;
    if (plan.triggerFrom && message?.target === plan.triggerFrom) return false;
    return true;
  }

  shouldPreventSideLineSceneEviction(message, now = Date.now()) {
    if (!this.isHumanReplanSideMessage(message)) return false;
    const open = typeof this.room?.openScenes === "function" ? this.room.openScenes(now) : [];
    return open.length >= 3;
  }

  noteSideLineSceneCapEvictionBlock() {
    this.stats.sideLineSceneCapEvictionBlocks += 1;
  }

  snapshot(now = Date.now()) {
    const base = super.snapshot(now);
    return {
      ...base,
      associationHistory: [...this.associationHistory],
      policy: {
        ...(base.policy || {}),
        phase: "1D",
        effectiveOpenQuestionWindowMs: V41D_OPEN_QUESTION_WINDOW_MS,
        effectiveOpenQuestionsIgnoreAnsweredRows: true,
        directAssociationThreshold: V41D_DIRECT_ASSOCIATION_THRESHOLD,
        roomAssociationThreshold: V41D_ROOM_ASSOCIATION_THRESHOLD,
        ambiguityMargin: V41D_AMBIGUITY_MARGIN,
        roomParticipantRecencyAloneCannotAssociate: true,
        recentSceneRowsDriveEffectiveSubject: true,
        generalAndGreetingTopicsFallBackToTextEvidence: true,
        legacyHumanReplanBlanketCarryRetired: true,
        detachedHumanReplanSideLinesCannotEvictAtSceneCap: true,
        ambientHumanOwnershipUsesMomentumWindowParticipantsOnly: true
      }
    };
  }
}
