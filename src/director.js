const MOODS = [
  { id: "chatty", note: "people are talkative and willing to tell little stories" },
  { id: "goofy", note: "people joke, tease, misunderstand, and pile onto dumb topics" },
  { id: "nosy", note: "people ask follow-up questions and get into each other's business" },
  { id: "argumentative", note: "small disagreements can become playful arguments" },
  { id: "scattered", note: "several conversations overlap and people interrupt each other" },
  { id: "late-night", note: "conversation is looser, stranger, and a little more personal" }
];

const SCENE_TYPES = [
  {
    id: "mundane-story",
    instruction: "One person tells a specific mundane thing that happened today. Others ask one real follow-up, tease them, disagree about what they should have done, or tell a related story."
  },
  {
    id: "petty-argument",
    instruction: "Start from a harmless opinion and let two people disagree for several turns. A third person may take a side or make fun of both of them."
  },
  {
    id: "room-question",
    instruction: "Someone asks the room a specific question that can produce different answers. People answer differently and react to each other's answers instead of replying in isolation."
  },
  {
    id: "gossip-chain",
    instruction: "Someone mentions something weird, annoying, funny, or embarrassing involving a coworker, roommate, neighbor, customer, friend, or date. Others get curious and ask for details."
  },
  {
    id: "help-me-decide",
    instruction: "Someone needs a small real-life decision. Other people give conflicting advice, ask for missing details, or challenge bad advice."
  },
  {
    id: "memory-callback",
    instruction: "Use a recent conversation, known relationship, or witnessed human preference as a callback. Do not invent memory. Let the callback lead somewhere new instead of merely repeating it."
  },
  {
    id: "weird-question",
    instruction: "Someone throws out a weird but believable question, hypothetical, rumor, or observation. Let the room run with it for several turns."
  },
  {
    id: "two-thread-crosstalk",
    instruction: "Keep one existing conversation going while another person starts or revives a different subject. Allow believable cross-talk and occasional confusion about who is answering whom."
  },
  {
    id: "friendly-roast",
    instruction: "Two people who know each other tease each other about a harmless habit or opinion. It should feel familiar rather than cruel, unless their relationship is already bad."
  },
  {
    id: "mini-confession",
    instruction: "Someone admits a small embarrassing, lazy, cheap, impulsive, or dumb thing they did. Others react with curiosity, jokes, or their own similar admissions."
  }
];

const PREMISES = [
  "a coworker keeps stealing food from the break room fridge",
  "someone rented a movie and forgot to rewind it before returning it",
  "a friend borrowed a CD and returned it scratched",
  "someone got a wrong-number call and ended up talking to the stranger",
  "a boss made a ridiculous new rule at work",
  "someone spent way too much money at the mall and is hiding the receipt",
  "someone's car made a horrible noise and they are pretending it is fine",
  "a roommate or family member taped over something important on VHS",
  "someone got disconnected near the end of a long download",
  "someone is trying to decide whether to call a person they like",
  "a neighbor is doing something weird and nobody agrees whether it is actually weird",
  "someone heard a song on the radio and cannot figure out what it was",
  "someone's friend claims they met a celebrity but the story sounds fake",
  "someone has a terrible haircut and insists it looks fine",
  "someone bought something cheap that broke immediately",
  "a customer at work said something completely bizarre",
  "someone is avoiding homework or paperwork and wants validation",
  "someone has a pager number written down and cannot remember who it belongs to",
  "someone accidentally called the same person twice and now feels awkward",
  "someone's family keeps picking up the phone and killing the modem connection",
  "someone has two plans tonight and wants the room to choose which one",
  "someone is convinced their friend is lying about where they were last night",
  "someone found cash on the floor and people disagree about what to do with it",
  "someone got into a pointless argument with a cashier or customer",
  "someone wants to know the cheapest meal people actually enjoy",
  "someone has a friend who copies everything they buy or wear",
  "someone is hiding from relatives by staying online",
  "someone thinks their roommate is reading their mail",
  "someone keeps getting prank calls",
  "someone's alarm clock failed and they were absurdly late",
  "someone saw a person wearing something ridiculous and cannot stop thinking about it",
  "someone is trying to sell an old stereo or game system and got a terrible offer",
  "someone's friend bailed on plans at the last second",
  "someone got charged a ridiculous late fee",
  "someone is convinced a local restaurant changed its food and nobody believes them",
  "someone heard a rumor about a store or place nearby closing",
  "someone is debating whether a concert ticket is worth the money",
  "someone wants to know the dumbest thing everyone has bought recently",
  "someone's friend keeps calling during their favorite TV show",
  "someone has been awake too long and is making questionable decisions"
];

const FALLBACK_SCENES = [
  [
    "my coworker keeps stealing my soda from the fridge",
    "write ur name on it lol",
    "i DID",
    "then theyre doing it on purpose",
    "put something gross in one and wait",
    "thats evil. do it"
  ],
  [
    "my friend returned my cd scratched to hell",
    "which cd",
    "doesnt matter thats a crime",
    "lol u people are dramatic",
    "nah cds are expensive",
    "make them buy u another one"
  ],
  [
    "would u call someone after one date or wait",
    "call them",
    "no way wait",
    "why play games if u like them",
    "because looking desperate is real lol",
    "this room gives terrible advice"
  ],
  [
    "somebody at work said they met a famous person today",
    "who",
    "they wont say which is why i think its fake",
    "lol definitely fake",
    "maybe theyre not allowed to say",
    "thats exactly what a liar says"
  ],
  [
    "i found 20 bucks in a parking lot",
    "keep it",
    "what if somebody comes back looking for it",
    "for twenty dollars??",
    "id wait like five minutes then its mine",
    "very ethical system u got there"
  ],
  [
    "my roommate taped over something i hadnt watched yet",
    "oh thats war",
    "did they know it was urs",
    "yes the label was RIGHT THERE",
    "lol ok then war",
    "hide all the blank tapes"
  ],
  [
    "what is the dumbest thing u bought this month",
    "a cd i already owned",
    "how do u even do that",
    "forgot i had it lol",
    "i bought shoes that hurt too much to wear",
    "we are all bad with money apparently"
  ],
  [
    "my car is making a sound i am choosing to ignore",
    "what kind of sound",
    "like metal arguing with other metal",
    "LOL take it in",
    "nah turn the radio up",
    "this is why nobody should take advice here"
  ],
  [
    "somebody keeps prank calling my house",
    "same person every time?",
    "i think so they just breathe and hang up",
    "thats creepy not funny",
    "answer and dont say anything",
    "great now two weirdos breathing on the phone"
  ],
  [
    "i got a huge late fee on a movie i didnt even like",
    "what movie",
    "the late fee is worse than the movie now",
    "thats why i return stuff the same night",
    "no normal person does that",
    "apparently normal people pay late fees"
  ],
  [
    "would u tell a friend if their haircut looked terrible",
    "yes",
    "absolutely not",
    "theyre gonna find out eventually lol",
    "not from me",
    "cowards all of u"
  ],
  [
    "my family keeps picking up the phone and killing my connection",
    "put a sign on the phone",
    "they ignore it",
    "unplug every other phone lol",
    "then theyll just yell at me",
    "still worth it"
  ]
];

function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function roomMood(now = Date.now()) {
  const block = Math.floor(now / (4 * 60 * 1000));
  return MOODS[hashString(`mood:${block}`) % MOODS.length];
}

export function chooseSceneSpec({ now = Date.now(), hasThreads = false, hasHumans = false } = {}) {
  let pool = SCENE_TYPES;
  if (!hasThreads) pool = pool.filter((scene) => scene.id !== "memory-callback");
  if (!hasHumans) pool = pool.filter((scene) => scene.id !== "memory-callback");
  const scene = randomOf(pool);
  return {
    ...scene,
    premise: randomOf(PREMISES),
    mood: roomMood(now)
  };
}

function relationshipFlavor(score) {
  if (score <= -35) return "rivals";
  if (score <= -10) return "friction";
  if (score >= 35) return "friends";
  if (score >= 12) return "familiar";
  return "neutral";
}

export function pickSceneParticipants(characters, relationshipScore, recentSpeakers = [], max = 5) {
  const available = shuffled(characters || []);
  if (available.length <= max) return available;
  const recent = new Set((recentSpeakers || []).slice(-5));
  available.sort((a, b) => Number(recent.has(a.name)) - Number(recent.has(b.name)));
  const first = available[0];
  const rest = available.slice(1).map((character) => ({
    character,
    score: Math.abs(Number(relationshipScore?.(first.name, character.name) || 0)) + Math.random() * 25
  })).sort((a, b) => b.score - a.score);
  return [first, ...rest.slice(0, max - 1).map((row) => row.character)];
}

export function sceneRelationshipSummary(participants, relationshipScore) {
  const rows = [];
  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) {
      const a = participants[i].name;
      const b = participants[j].name;
      const score = Math.round(Number(relationshipScore?.(a, b) || 0));
      if (Math.abs(score) < 8) continue;
      rows.push(`${a}/${b}: ${relationshipFlavor(score)} (${score >= 0 ? "+" : ""}${score})`);
    }
  }
  return rows.slice(0, 8).join("; ") || "mostly neutral or not close yet";
}

export function sceneDirectorPrompt(spec) {
  return `SCENE MODE: ${spec.id}. Room mood: ${spec.mood.id} (${spec.mood.note}). Seed: ${spec.premise}. ${spec.instruction}`;
}

export function buildFallbackScene(characters, relationshipScore, sceneSeq = 1) {
  const participants = pickSceneParticipants(characters, relationshipScore, [], 4);
  if (participants.length < 2) return [];
  const script = randomOf(FALLBACK_SCENES);
  const lines = [];
  let lastSpeaker = "";
  for (let i = 0; i < script.length; i += 1) {
    let candidates = participants.filter((c) => c.name !== lastSpeaker);
    if (!candidates.length) candidates = participants;
    const speaker = i === 0 ? participants[0] : randomOf(candidates);
    const target = i === 0 ? "room" : lastSpeaker;
    lines.push({
      speaker: speaker.name,
      text: script[i],
      source: "built-in",
      intent: i === 0 ? "scene-start" : "scene-reply",
      target,
      topic: "general",
      sceneId: `s${sceneSeq}`,
      beat: i + 1
    });
    lastSpeaker = speaker.name;
  }
  return lines;
}

export function pacingDelay(queueLength = 0, intent = "") {
  if (queueLength > 0 || /scene|reply|thread/.test(intent)) {
    return 1200 + Math.floor(Math.random() * 2600);
  }
  return 2600 + Math.floor(Math.random() * 5200);
}

export function recentSpeakerNames(history, limit = 8) {
  return (history || [])
    .filter((row) => row?.kind === "bot" && row.from)
    .slice(-limit)
    .map((row) => row.from);
}
