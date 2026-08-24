import { hasLol, moderateVoiceHabits } from "./voice_policy.js";

export { hasLol };

export function moderate1996Lol(text, options = {}) {
  const result = moderateVoiceHabits(text, {
    speaker: options.speaker,
    seed: options.seed,
    configuredHabits: options.configuredLol ? ["lol"] : [],
    ownRecent: options.ownRecent || [],
    roomRecent: options.roomRecent || []
  });
  const lolChange = result.changes.find((change) => change.key === "lol");
  return {
    text: result.text,
    softened: Boolean(lolChange),
    reason: lolChange?.reason || "",
    replacement: lolChange?.replacement || ""
  };
}
