import assert from "node:assert/strict";

const NOW = Date.parse("2026-08-31T20:54:00-07:00");
const originalNow = Date.now;
const originalRandom = Math.random;
Date.now = () => NOW;
Math.random = () => 0.23;

globalThis.WebSocketRequestResponsePair = class WebSocketRequestResponsePair {
  constructor(request, response) {
    this.request = request;
    this.response = response;
  }
};

globalThis.WebSocketPair = class WebSocketPair {
  constructor() {
    return { 0: new FakeSocket(), 1: new FakeSocket() };
  }
};

class FakeStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
    this.alarm = null;
  }

  async get(key) {
    if (Array.isArray(key)) {
      const out = new Map();
      for (const item of key) if (this.values.has(item)) out.set(item, this.values.get(item));
      return out;
    }
    return this.values.get(key);
  }

  async put(key, value) {
    if (key && typeof key === "object" && !Array.isArray(key)) {
      for (const [name, item] of Object.entries(key)) this.values.set(name, item);
      return;
    }
    this.values.set(key, value);
  }

  async delete(key) {
    if (Array.isArray(key)) {
      let count = 0;
      for (const item of key) if (this.values.delete(item)) count += 1;
      return count;
    }
    return this.values.delete(key);
  }

  async list() {
    return new Map(this.values);
  }

  async getAlarm() {
    return this.alarm;
  }

  async setAlarm(value) {
    this.alarm = Number(value);
  }

  async deleteAlarm() {
    this.alarm = null;
  }
}

class FakeSocket {
  constructor(attachment = {}) {
    this.attachment = { ...attachment };
    this.sent = [];
    this.closed = null;
  }

  deserializeAttachment() {
    return { ...this.attachment };
  }

  serializeAttachment(value) {
    this.attachment = { ...(value || {}) };
  }

  send(value) {
    this.sent.push(value);
  }

  close(code = 1000, reason = "") {
    this.closed = { code, reason };
  }
}

class FakeCtx {
  constructor({ storage = {}, sockets = [] } = {}) {
    this.storage = new FakeStorage(storage);
    this.webSockets = sockets;
    this.waits = [];
    this.autoResponse = null;
  }

  setWebSocketAutoResponse(value) {
    this.autoResponse = value;
  }

  getWebSockets() {
    return this.webSockets;
  }

  acceptWebSocket(socket) {
    this.webSockets.push(socket);
  }

  waitUntil(promise) {
    this.waits.push(Promise.resolve(promise));
  }
}

const { ChatRoom } = await import("../src/index_v40_scene_continuity.js");
const { ChatRoom: BrainVoiceChatRoom } = await import("../src/index_v22.js");

function bot(from, text, offset, extra = {}) {
  return {
    kind: "bot",
    from,
    target: "room",
    intent: "conversation",
    topic: "gaming",
    sceneId: "s-live",
    messageId: `m-${from}-${Math.abs(offset)}`,
    text,
    at: NOW + offset,
    ...extra
  };
}

function makeRoom({ history = [], bots = [], humans = [], env = {} } = {}) {
  const sockets = humans.map((name, index) => new FakeSocket({
    name,
    joinedAt: NOW - 5000 + index
  }));
  const ctx = new FakeCtx({ sockets });
  const room = new ChatRoom(ctx, env);
  room.loaded = true;
  room.social = null;
  room.history = history.map((row) => ({ ...row }));
  room.activeBotNames = [...bots];
  room.talkerNames = [...bots];
  room.aiQueue = [];
  room.pendingHumans = [];
  room.nextBotAt = NOW;
  room.nextScenePlanAt = 0;
  room.sceneHydrated = true;
  return { room, ctx };
}

function hydrate(room) {
  room.sceneBoard.clear();
  room.sceneHydrated = false;
  room.hydrateScenesFromHistory();
  return room;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const liveBotScene = [
  bot("SegaMan", "saturn pad feels better to me", -8000, { target: "CyberDude" }),
  bot("CyberDude", "nah playstation pad is easier", -3000, { target: "SegaMan", intent: "reply" })
];

test("actual v40 ambient generation uses one provider call and receives the momentum prompt", async () => {
  const { room } = makeRoom({
    history: liveBotScene,
    bots: ["SegaMan", "CyberDude", "MetallicaFan"],
    env: { GEMINI_API_KEY: "test-gemini" }
  });
  hydrate(room);
  room.v37LastLivelyAmbientAiAt = 0;
  const calls = [];
  room.callProvider = async (provider, prompt, maxTokens) => {
    calls.push({ provider, prompt, maxTokens });
    return {
      ok: true,
      status: 200,
      model: "fake-gemini",
      content: JSON.stringify({
        messages: [
          { speaker: "SegaMan", target: "CyberDude", intent: "reply", topic: "gaming", text: "saturn ports still win" },
          { speaker: "CyberDude", target: "SegaMan", intent: "disagree", topic: "gaming", text: "tekken says otherwise" },
          { speaker: "SegaMan", target: "CyberDude", intent: "question", topic: "gaming", text: "ridge racer too?" }
        ]
      })
    };
  };

  const lines = await room.generateBackgroundPlan();
  assert.equal(calls.length, 1, "one ambient generation opportunity should make one provider request");
  assert.equal(calls[0].provider, "gemini");
  assert.match(calls[0].prompt, /V40 SCENE MOMENTUM LOCK/);
  assert.equal(room.v40Stats.momentumPromptLocks, 1);
  assert.equal(lines.length, 3);
});

test("queue pipeline exposes v39 filtering, v38 cooling, v20 planning, and v40 carry in one execution", () => {
  const { room } = makeRoom({
    history: liveBotScene,
    bots: ["SegaMan", "CyberDude", "MetallicaFan"],
    env: { GEMINI_API_KEY: "test-gemini" }
  });
  hydrate(room);
  room.v38TopicCooling.set("metal", NOW + 60000);

  const queued = room.queueScenePlan([
    { speaker: "SegaMan", target: "SegaMan", intent: "reply", topic: "gaming", text: "yeah me too", source: "gemini" },
    { speaker: "MetallicaFan", target: "room", intent: "ambient", topic: "music", text: "metallica anyone", source: "gemini" },
    { speaker: "SegaMan", target: "CyberDude", intent: "reply", topic: "gaming", text: "saturn has better arcade ports", source: "gemini" },
    { speaker: "CyberDude", target: "SegaMan", intent: "disagree", topic: "gaming", text: "tekken still wins though", source: "gemini" }
  ], "background", null, false);

  assert.equal(queued, 2, "one v39 self-target and one v38-cooled topic line should be removed before v20 queues the plan");
  assert.equal(room.v39Stats.selfDialogueLinesBlocked, 1);
  assert.equal(room.v38QualityStats.fatiguedBackgroundLinesBlocked, 1);
  assert.equal(room.currentScenePlan?.plannedTurns, 2);
  const planId = room.currentScenePlan?.id;
  const planItems = room.aiQueue.filter((item) => item._scenePlanId === planId);
  assert.equal(planItems.length, 2);
  assert.ok(planItems.every((item) => item._continuitySceneId === "s-live"), "surviving continuation lines should receive the existing scene id");
  assert.equal(room.v40Stats.backgroundPlansCarried, 1);
  assert.equal(room.v40Stats.backgroundLinesCarried, 2);
});

test("active or recent human participation blocks v40 ambient momentum through the deployed class", () => {
  const history = [
    { kind: "human", from: "Crateman", target: "BostonRob", topic: "general", sceneId: "s-human", messageId: "m-human", text: "so who is the president", at: NOW - 8000 },
    { kind: "bot", from: "BostonRob", target: "Crateman", topic: "general", sceneId: "s-answer", messageId: "m-bot", text: "Bill Clinton. Look it up later", intent: "answer", at: NOW - 3000 }
  ];
  const { room } = makeRoom({ history, bots: ["BostonRob"], humans: ["Crateman"] });
  hydrate(room);
  assert.deepEqual(room.humanNames(), ["Crateman"]);
  assert.equal(room.currentAmbientMomentum(NOW), null);
});

test("closed scenes cannot be rediscovered through the deployed sceneForMessage chain", () => {
  const { room } = makeRoom({ history: liveBotScene, bots: ["SegaMan", "CyberDude"] });
  hydrate(room);
  const scene = room.sceneBoard.get("s-live");
  assert.ok(scene);
  scene.status = "closed";
  scene.closedAt = NOW;
  scene.closeReason = "runtime-contract";

  const found = room.sceneForMessage({
    kind: "bot",
    from: "SegaMan",
    target: "CyberDude",
    topic: "gaming",
    sceneId: "s-live",
    text: "one more thing",
    at: NOW
  }, NOW);
  assert.equal(found, null);
});

test("scene state hydrates from retained message history on a fresh Durable Object instance", async () => {
  const history = [
    bot("SegaMan", "saturn forever", -6000, { sceneId: "s-hydrated", target: "CyberDude" }),
    bot("CyberDude", "playstation wins", -2000, { sceneId: "s-hydrated", target: "SegaMan" })
  ];
  const ctx = new FakeCtx({ storage: { history } });
  const room = new ChatRoom(ctx, {});
  await room.ensureState();
  const scene = room.sceneBoard.get("s-hydrated");
  assert.ok(scene, "v17 scene board should be reconstructed from persisted history");
  assert.equal(scene.turns, 2);
  assert.ok(["forming", "active"].includes(scene.status));
});

test("production turn gate coalesces concurrent tick/alarm requests without concurrent base turns", async () => {
  const { room } = makeRoom();
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  room.runV37BaseProductionTurn = async () => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await blocker;
    active -= 1;
    return calls;
  };

  const first = room.tick(false);
  const second = room.tick(true);
  const third = room.alarm();
  await Promise.resolve();
  assert.ok(room.v37ProductionTurnGate.snapshot().coalesced >= 2);
  release();
  await Promise.all([first, second, third]);
  const snapshot = room.v37ProductionTurnGate.snapshot();
  assert.equal(maxActive, 1);
  assert.equal(snapshot.maxConcurrent, 1);
  assert.equal(calls, 2, "coalesced requests should create one bounded replay rather than parallel turns");
});

test("pre-display world gate blocks GoldenEye N64 but still allows GoldenEye film discussion", () => {
  const blockedRoom = makeRoom({ bots: ["SegaMan"] }).room;
  const blocked = blockedRoom.say("SegaMan", "oh it was goldeneye for the n64", "bot", "gemini", {
    target: "room",
    topic: "gaming",
    intent: "conversation"
  });
  assert.equal(blocked, false);
  assert.equal(blockedRoom.history.length, 0, "blocked future game claim must not enter visible history");

  const allowedRoom = makeRoom({ bots: ["JerseyGirl"] }).room;
  const allowed = allowedRoom.say("JerseyGirl", "goldeneye came out last year lol", "bot", "gemini", {
    target: "room",
    topic: "movies",
    intent: "conversation"
  });
  assert.equal(allowed, true);
  assert.equal(allowedRoom.history.length, 1, "1995 Bond film discussion should remain displayable");
});

test("reconnect grace marks the old socket non-present and suppresses a fake re-enter line", () => {
  const { room, ctx } = makeRoom({ humans: ["Crateman"] });
  const oldSocket = ctx.webSockets[0];
  assert.deepEqual(room.humanNames(), ["Crateman"]);

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    room.webSocketClose(oldSocket, 1006, "network changed", false);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.equal(oldSocket.deserializeAttachment().v39DisconnectPending, true);
  assert.deepEqual(room.humanNames(), [], "pending-close socket must immediately stop counting as room presence");
  assert.equal(room.v39PendingHumanDisconnects.has("Crateman"), true);
  assert.ok(ctx.waits.length >= 1, "disconnect grace should be registered through waitUntil");

  ctx.webSockets.push(new FakeSocket({ name: "Crateman", joinedAt: NOW + 1 }));
  const before = room.history.length;
  const result = room.system("Crateman has entered the room.");
  assert.equal(result, false);
  assert.equal(room.v39PendingHumanDisconnects.has("Crateman"), false);
  assert.equal(room.v39Stats.transientHumanReconnects, 1);
  assert.equal(room.history.length, before, "quick reconnect must not emit a duplicate enter system line");
  assert.deepEqual(room.humanNames(), ["Crateman"]);
});

test("known architectural deficiency: inherited v22 Voice accepts short surface text without semantic-completeness validation", async () => {
  const { room } = makeRoom({ bots: ["MetallicaFan"], env: { GEMINI_API_KEY: "test-gemini" } });
  room.callGroq = async () => [{
    speaker: "MetallicaFan",
    target: "Crateman",
    intent: "answer",
    topic: "gaming",
    text: "nah",
    source: "gemini"
  }];
  const plan = {
    provider: "gemini",
    reason: "v37-human-director",
    subject: "Neo Geo ownership and price",
    goal: "Answer both parts of the human question",
    moves: [{
      speaker: "MetallicaFan",
      target: "Crateman",
      intent: "answer",
      topic: "gaming",
      meaning: "say whether he owns a Neo Geo and answer how much Neo Geo systems cost"
    }]
  };

  const voiced = await BrainVoiceChatRoom.prototype.voiceBrainPlan.call(room, plan, room.activeCharacters(), null);
  assert.equal(voiced.length, 1);
  assert.equal(voiced[0].text, "nah");
  assert.match(voiced[0].brainMeaning, /owns a Neo Geo.*how much/i);
});

let passed = 0;
try {
  for (const { name, fn } of tests) {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  }
  console.log(`v41 runtime characterization: ${passed}/${tests.length} contracts passed`);
} finally {
  Date.now = originalNow;
  Math.random = originalRandom;
}
