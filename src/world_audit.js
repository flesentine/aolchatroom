import { groundedPublicEvidence, relativeDateCandidates } from "./world_model.js";

const RELATIVE = /\b(?:today|tonight|tomorrow|yesterday|last night|this weekend|next week)\b/i;
const SCHEDULE = /\b(?:episode|finale|premiere|concert|festival|game|match|show|movie|release|launch|tour|broadcast|special|debate|election)\b/i;
const TV_STATUS = /\b(?:reruns?|syndicat(?:ed|ion)|off the air|cancelled|canceled|renewed|new episodes?|still on|on every day|every day on|back next season)\b/i;
const EVENT_REFERENCE = /\b(?:finale|premiere)\b/i;
const SPORTS_DETAIL = /\b(?:innings?|bottom of (?:the )?\w+|top of (?:the )?\w+|bullpen|pitching changes?|walk[- ]off|no[- ]hitter|shutout|overtime)\b/i;
const PUBLIC_RESULT = /\b(?:won|beat|defeated|clinched|swept|final score|score was)\b/i;
const PATCH_DETAIL = /\b(?:patch|update|version|driver)\b.{0,100}\b(?:fix|fixed|fixes|add|added|adds|netcode|lag|framerate|music|audio|performance|glitch|feature)\b/i;
const NOVELTY = /\b(?:new|latest|just released|just launched|out now)\b/i;
const VERSIONISH = /\b(?:[a-z]{2,}\d+[a-z0-9.-]*|\d+[a-z]{2,}[a-z0-9.-]*)\b/i;
const PUBLIC_NOUN = /\b(?:browser|software|hardware|console|game|album|movie|show|episode|product|release|tutorials?|patch|update|version)\b/i;
const PURE_QUERY = /^\s*(?:is|are|when|what|does|do you know|does anyone know|anyone know)\b/i;
const PRESUPPOSES = /\b(?:watch|catch|tape|record|go to|going to|gonna|hear about|heard about)\b/i;

function compact(value, max = 180) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, max); }

export function detectAuditClaim(text, context = "", meta = {}) {
  const value = String(text || "");
  const joined = `${value} ${context} ${meta?.topic || ""}`;
  const pureQuery = PURE_QUERY.test(value) && !PRESUPPOSES.test(value);
  if (RELATIVE.test(value) && SCHEDULE.test(value) && !pureQuery) return { type: "schedule", severity: "block" };
  if (TV_STATUS.test(value) && !pureQuery) return { type: "status", severity: "block" };
  if (SPORTS_DETAIL.test(value) && /\b(?:game|baseball|mlb|nba|nfl|nhl|mets|dodgers|yankees|sox|inning)\b/i.test(joined)) return { type: "sports-detail", severity: "block" };
  if (PUBLIC_RESULT.test(value) && /\b(?:game|match|series|team|finals|championship|election|race|poll)\b/i.test(joined)) return { type: "result", severity: "block" };
  if (PATCH_DETAIL.test(value)) return { type: "patch-detail", severity: "block" };
  if (NOVELTY.test(value) && (VERSIONISH.test(value) || PUBLIC_NOUN.test(value))) return { type: "novelty", severity: "block" };
  if (EVENT_REFERENCE.test(value) && /\b(?:was|is|epic|classic|great|terrible|watched|saw|missed)\b/i.test(value)) return { type: "event-reference", severity: "review" };
  return null;
}

export function auditWorldHistory(history = [], culture = {}, floor = 0, speakerResolver = null) {
  const checked = history.filter((row) => row?.kind === "bot" && Number(row.at || 0) >= floor);
  const blockers = [];
  const reviews = [];
  for (let i = 0; i < history.length; i += 1) {
    const row = history[i];
    if (row?.kind !== "bot" || Number(row.at || 0) < floor) continue;
    const context = history.slice(Math.max(0, i - 8), i).map((r) => r?.text || "").join(" ");
    const claim = detectAuditClaim(row.text, context, row);
    if (!claim) continue;
    const speaker = typeof speakerResolver === "function" ? (speakerResolver(row.from) || {}) : {};
    const dates = RELATIVE.test(String(row.text || "")) ? relativeDateCandidates(row.text, speaker, Number(row.at || Date.now())) : [];
    const evidence = groundedPublicEvidence(row.text, culture, Number(row.at || Date.now()), {
      claimType: claim.type === "event-reference" ? "status" : claim.type,
      allowedDates: dates,
      allowScheduled: claim.type === "schedule"
    });
    if (evidence) continue;
    const item = {
      at: row.at,
      from: row.from,
      text: compact(row.text),
      claimType: claim.type,
      severity: claim.severity,
      reason: "independent audit found a public-looking claim without matching world evidence"
    };
    if (claim.severity === "block") blockers.push(item); else reviews.push(item);
  }
  return {
    checkedBotLines: checked.length,
    violations: blockers.length,
    blockers: blockers.length,
    needsReview: reviews.length,
    examples: blockers.slice(-8),
    reviewExamples: reviews.slice(-8)
  };
}
