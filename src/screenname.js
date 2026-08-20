const FEMALE_CUES = [
  /(?:^|[^a-z])(girl|grrl|chick|lady|miss|ms|babygirl|babe|princess|queen)(?:[^a-z]|$)/i,
  /(girl|grrl|chick|babygirl|princess)$/i
];

const MALE_CUES = [
  /(?:^|[^a-z])(guy|dude|boy|man|mr|bro)(?:[^a-z]|$)/i,
  /(guy|dude|boy|man)$/i
];

function probableSex(name) {
  const value = String(name || "");
  if (FEMALE_CUES.some((re) => re.test(value))) return { value: "female", confidence: "fairly strong" };
  if (MALE_CUES.some((re) => re.test(value))) return { value: "male", confidence: "fairly strong" };
  return null;
}

function probableAge(name) {
  const value = String(name || "");
  const explicit = value.match(/(?:age)?(1[3-9]|2\d|3[0-9])$/i);
  if (!explicit) return null;
  const age = Number(explicit[1]);
  if (age < 13 || age > 39) return null;
  return { value: age, confidence: "possible" };
}

export function screenNameSignals(name) {
  const sex = probableSex(name);
  const age = probableAge(name);
  return { name: String(name || ""), sex, age };
}

export function screenNameSignalLine(name) {
  const signal = screenNameSignals(name);
  const bits = [];
  if (signal.sex) bits.push(`screen name suggests ${signal.sex.value}`);
  if (signal.age) bits.push(`ending number could mean about age ${signal.age.value}`);
  return bits.length ? `${signal.name}: ${bits.join("; ")}. These are guesses, not facts.` : `${signal.name}: no useful age/sex cue from the screen name.`;
}

export function screenNameEraPrompt(humanNames = []) {
  const lines = (humanNames || []).filter(Boolean).map(screenNameSignalLine);
  return `1990s SCREEN-NAME SOCIAL CUES:\n- Unlike a modern anonymous handle, an AOL screen name often invited guesses. Words like Grrl/Girl/Chick/Lady/BabyGirl often suggested female; Guy/Dude/Boy/Man often suggested male. A trailing number like Jen19 or Mike23 could plausibly be an age.\n- Treat those as SOCIAL GUESSES, not hard facts. A chatter may casually assume, flirt, tease, or ask \"asl?\" to confirm. Do not write biographical facts from a guess.\n- Fixed character profiles and anything a human explicitly said always override the handle.\n- Do NOT infer species, occupation, location, race, or personality from a handle. A member named dog is still a person unless they actually say otherwise.\n- Do not over-analyze every name. Most handles should simply pass without comment.\n${lines.length ? `CURRENT HUMAN HANDLE CUES:\n${lines.map((x) => `- ${x}`).join("\n")}` : "No human handle cues needed right now."}`;
}
