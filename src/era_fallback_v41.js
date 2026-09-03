import { eraWorldViolation } from "./era_world.js";

export function periodSafeHumanFallbackLines(lines, human, eraDateKey) {
  const rows = Array.isArray(lines) ? lines : [];
  const violation = eraDateKey && human
    ? eraWorldViolation(human.text || "", eraDateKey)
    : null;
  if (!violation || violation === "empty") return rows;

  // Preserve the inherited fallback's routing/source metadata. Only replace
  // built-in text when the human premise itself cannot exist in the sealed
  // 1996 world; provider Voice has already been handled by Phase 2A.
  return rows.map((line) => {
    if (String(line?.source || "") !== "built-in") return line;
    return {
      ...line,
      text: "what? never heard of that",
      topic: "general",
      _v41EraSafeFallback: true
    };
  });
}
