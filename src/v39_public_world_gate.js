import { simulatedCutoff } from "./historical_knowledge_v27.js";
import { detectAuditClaim } from "./world_audit.js";
import { groundedPublicEvidence, relativeDateCandidates } from "./world_model.js";

const GOLDENEYE = /\bgolden\s*eye(?:\s*007)?\b/i;
const TONY_HAWK = /\btony\s+hawk(?:'s)?(?:\s+pro\s+skater)?\b/i;
const GAME_MARKER = /\b(?:game|gaming|n64|nintendo\s+64|playstation|psx|snes|saturn|sega|console|cartridge|controller|graphics|polygon|rent(?:ed|ing)?|play(?:ed|ing)?)\b/i;
const RELEASEISH = /\b(?:coming\s+out|release(?:d|s)?|launch(?:ed|es)?|out\s+(?:soon|eventually|next)|ships?|shipping|in\s+stores)\b/i;
const PS1_LABEL = /\bps1\b/gi;

function compact(value, max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function gameContext(text = "", context = "", meta = {}) {
  return GAME_MARKER.test(`${text} ${context} ${meta?.topic || ""}`);
}

export function normalizeEraConsoleLabels(text = "") {
  return String(text || "").replace(PS1_LABEL, (match) => match === match.toUpperCase() ? "PlayStation" : "playstation");
}

export function futureGameProductViolation(text, now = Date.now(), context = "", meta = {}) {
  const value = compact(text, 320);
  if (!value) return null;
  const cutoff = simulatedCutoff(Number(now || Date.now()));

  if (cutoff.dateKey < "1997-08-25" && GOLDENEYE.test(value) && GAME_MARKER.test(value)) {
    return {
      kind: "future-game-product",
      reason: "1996 product boundary blocked GoldenEye 007 for Nintendo 64 before its release",
      product: "GoldenEye 007 (Nintendo 64)",
      notBefore: "1997-08-25",
      cutoff: cutoff.dateKey,
      text: value
    };
  }

  if (
    cutoff.dateKey < "1999-08-31"
    && TONY_HAWK.test(value)
    && RELEASEISH.test(value)
    && gameContext(value, context, meta)
  ) {
    return {
      kind: "future-game-product",
      reason: "1996 product boundary blocked Tony Hawk's Pro Skater before its release",
      product: "Tony Hawk's Pro Skater",
      notBefore: "1999-08-31",
      cutoff: cutoff.dateKey,
      text: value
    };
  }

  return null;
}

export function auditedPublicClaimViolation(text, options = {}) {
  const value = compact(text, 320);
  if (!value) return null;

  const now = Number(options.now || Date.now());
  const context = String(options.context || "");
  const meta = options.meta || {};
  const claim = detectAuditClaim(value, context, meta);
  if (!claim || claim.severity !== "block") return null;

  const dates = relativeDateCandidates(value, options.speaker || {}, now);
  const claimType = claim.type === "event-reference" ? "status" : claim.type;
  const evidence = groundedPublicEvidence(value, options.culture || {}, now, {
    claimType,
    allowedDates: dates,
    allowScheduled: claimType === "schedule"
  });
  if (evidence) return null;

  return {
    kind: "unsupported-audited-public-claim",
    reason: `pre-display world audit blocked unsupported public ${claimType} claim`,
    claimType,
    text: value
  };
}

export function auditFutureGameProductHistory(history = [], floor = 0) {
  const examples = [];
  let checkedBotLines = 0;

  for (let i = 0; i < (history || []).length; i += 1) {
    const row = history[i];
    if (row?.kind !== "bot" || Number(row?.at || 0) < Number(floor || 0)) continue;
    checkedBotLines += 1;
    const context = (history || [])
      .slice(Math.max(0, i - 8), i)
      .map((item) => item?.text || "")
      .join(" ");
    const violation = futureGameProductViolation(
      row?.text || "",
      Number(row?.at || Date.now()),
      context,
      row || {}
    );
    if (!violation) continue;
    examples.push({
      at: row.at,
      from: row.from,
      text: compact(row.text, 220),
      severity: "block",
      reason: violation.reason,
      product: violation.product,
      notBefore: violation.notBefore,
      messageId: row.messageId || ""
    });
  }

  return {
    checkedBotLines,
    violations: examples.length,
    blockers: examples.length,
    examples: examples.slice(-8)
  };
}
