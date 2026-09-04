const signin = document.querySelector("#signin");
const screenName = document.querySelector("#screenName");
const signOn = document.querySelector("#signOn");
const transcript = document.querySelector("#transcript");
const people = document.querySelector("#people");
const count = document.querySelector("#count");
const message = document.querySelector("#message");
const send = document.querySelector("#send");
const status = document.querySelector("#status");
const clock = document.querySelector("#clock");
const profileButton = document.querySelector("#profileButton");
const profileDialog = document.querySelector("#profileDialog");
const profileTitle = document.querySelector("#profileTitle");
const profileBody = document.querySelector("#profileBody");
const closeProfile = document.querySelector("#closeProfile");
const closeProfileBottom = document.querySelector("#closeProfileBottom");
const debugPanel = document.querySelector("#debugPanel");
const exportChat = document.querySelector("#exportChat");

let socket = null;
let pulseTimer;
let reconnectTimer = null;
let reconnectAttempts = 0;
let pageUnloading = false;
let capture = null;
let capturePersistTimer = null;
const captureMessageKeys = new Set();
const renderedMessageKeys = new Set();
const debug = new URLSearchParams(location.search).get("debug") === "1";
const CAPTURE_KEY = "aol96-chat-capture-v1";
const CAPTURE_RESUME_GAP_MS = 10 * 60 * 1000;
const RECONNECT_DELAYS_MS = [750, 1500, 2500, 4000, 6000, 10000];
const RECONNECT_SHOW_SIGNIN_AFTER = 6;

screenName.value = localStorage.getItem("aol96-screen-name") || "";
screenName.focus();
if (debug && debugPanel) debugPanel.classList.remove("hidden");

function cleanName(value) {
  return String(value || "Guest").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16) || "Guest";
}

function captureMessageKey(item) {
  return [item?.at || "", item?.from || "", item?.kind || "", item?.text || ""].join("|");
}

function renderedMessageKey(item) {
  const at = Number(item?.at || 0);
  if (!Number.isFinite(at) || at <= 0) return "";
  return JSON.stringify([
    at,
    item?.from || "",
    item?.kind || "",
    item?.text || "",
    item?.source || "",
    item?.intent || "",
    item?.target || "room",
    item?.topic || "general",
    item?.threadId || ""
  ]);
}

function startOrResumeCapture(name) {
  const now = Date.now();
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(CAPTURE_KEY) || "null");
  } catch {}

  const canResume = saved
    && saved.schema === "aol96-chat-capture-v1"
    && saved.screenName === name
    && Array.isArray(saved.events)
    && now - Number(saved.updatedAt || 0) <= CAPTURE_RESUME_GAP_MS;

  capture = canResume ? saved : {
    schema: "aol96-chat-capture-v1",
    captureId: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    room: "Town Square",
    screenName: name,
    startedAt: now,
    updatedAt: now,
    simulatedDate: "",
    provider: "",
    pass: null,
    events: []
  };

  captureMessageKeys.clear();
  for (const event of capture.events) {
    if (event.type === "message") captureMessageKeys.add(captureMessageKey(event));
  }

  recordCaptureEvent({ type: "connection", action: canResume ? "resume" : "sign-on" });
  persistCapture(true);
}

function recordCaptureEvent(event) {
  if (!capture) return;
  const now = Date.now();
  capture.events.push({ receivedAt: now, ...event });
  capture.updatedAt = now;
  scheduleCapturePersist();
}

function recordCaptureMessage(item, replayed = false) {
  if (!capture || !item) return;
  const key = captureMessageKey(item);
  if (captureMessageKeys.has(key)) return;
  captureMessageKeys.add(key);
  recordCaptureEvent({
    type: "message",
    at: Number(item.at || Date.now()),
    from: item.from || "",
    text: item.text || "",
    kind: item.kind || "",
    source: item.source || "",
    intent: item.intent || "",
    target: item.target || "room",
    topic: item.topic || "general",
    threadId: item.threadId || "",
    replayed: Boolean(replayed)
  });
}

function scheduleCapturePersist() {
  clearTimeout(capturePersistTimer);
  capturePersistTimer = setTimeout(() => persistCapture(), 1200);
}

function persistCapture(force = false) {
  if (!capture) return;
  if (force) clearTimeout(capturePersistTimer);
  try {
    localStorage.setItem(CAPTURE_KEY, JSON.stringify(capture));
  } catch {
    // The in-memory capture continues even if browser storage fills up.
  }
}

function exportCapture() {
  if (!capture) return;
  persistCapture(true);

  const now = Date.now();
  const messageEvents = capture.events.filter((event) => event.type === "message");
  const sourceCounts = {};
  const speakerCounts = {};
  const kindCounts = {};

  for (const event of messageEvents) {
    const source = event.source || "unknown";
    const speaker = event.from || "system";
    const kind = event.kind || "unknown";
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
  }

  const payload = {
    schema: capture.schema,
    purpose: "AOL 1996 chat-room realism analysis",
    session: {
      captureId: capture.captureId,
      room: capture.room,
      screenName: capture.screenName,
      startedAt: capture.startedAt,
      startedAtIso: new Date(capture.startedAt).toISOString(),
      exportedAt: now,
      exportedAtIso: new Date(now).toISOString(),
      durationSeconds: Math.round((now - capture.startedAt) / 1000),
      simulatedDate: capture.simulatedDate,
      provider: capture.provider,
      pass: capture.pass
    },
    summary: {
      eventCount: capture.events.length,
      messageCount: messageEvents.length,
      sourceCounts,
      kindCounts,
      speakerCounts
    },
    events: capture.events
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const stamp = new Date(capture.startedAt).toISOString().replace(/[:.]/g, "-");
  link.href = URL.createObjectURL(blob);
  link.download = `aol96-town-square-${capture.screenName}-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  if (exportChat) {
    const oldLabel = exportChat.textContent;
    exportChat.textContent = "Saved!";
    setTimeout(() => { exportChat.textContent = oldLabel; }, 1400);
  }
}

function addLine(item) {
  const messageKey = renderedMessageKey(item);
  if (messageKey && renderedMessageKeys.has(messageKey)) return false;

  const row = document.createElement("div");
  row.className = `line ${item.kind || ""}`;
  if (item.kind === "system") {
    row.textContent = `*** ${item.text} ***`;
  } else {
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${item.from}: `;
    row.append(name, document.createTextNode(item.text));
    if (debug && item.source) {
      const meta = document.createElement("span");
      meta.className = "debug-meta";
      const target = item.target && item.target !== "room" ? ` → ${item.target}` : "";
      const thread = item.threadId ? ` • ${item.threadId}/${item.topic || "general"}` : item.topic ? ` • ${item.topic}` : "";
      meta.textContent = ` [${item.source}/${item.intent || "chat"}${target}${thread}]`;
      row.append(meta);
    }
  }
  if (messageKey) {
    row.dataset.messageKey = messageKey;
    renderedMessageKeys.add(messageKey);
  }

  transcript.append(row);
  while (transcript.children.length > 220) {
    const oldest = transcript.firstElementChild;
    const oldestKey = oldest?.dataset?.messageKey || "";
    if (oldestKey) renderedMessageKeys.delete(oldestKey);
    oldest?.remove();
  }
  transcript.scrollTop = transcript.scrollHeight;
  return true;
}

function setUsers(users = []) {
  const selected = people.value;
  people.replaceChildren(...users.map((user) => {
    const option = document.createElement("option");
    option.textContent = user;
    option.value = user;
    return option;
  }));
  if ([...people.options].some((option) => option.value === selected)) people.value = selected;
  count.textContent = String(users.length);
}

function socketIsActive(candidate = socket) {
  return Boolean(candidate && (
    candidate.readyState === WebSocket.CONNECTING
    || candidate.readyState === WebSocket.OPEN
  ));
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(name, detail = {}) {
  if (pageUnloading || socketIsActive()) return;
  clearReconnectTimer();

  reconnectAttempts += 1;
  const delayMs = RECONNECT_DELAYS_MS[Math.min(reconnectAttempts - 1, RECONNECT_DELAYS_MS.length - 1)];
  const networkOffline = navigator.onLine === false;
  recordCaptureEvent({
    type: "connection",
    action: "reconnect-scheduled",
    attempt: reconnectAttempts,
    delayMs,
    code: Number(detail.code || 0),
    reason: String(detail.reason || ""),
    wasClean: Boolean(detail.wasClean),
    networkOffline
  });

  if (reconnectAttempts >= RECONNECT_SHOW_SIGNIN_AFTER) {
    signOn.disabled = false;
    signin.classList.remove("hidden");
    status.textContent = networkOffline
      ? "Connection lost · waiting for network"
      : "Still reconnecting · you can also click Sign On";
  } else {
    signOn.disabled = true;
    signin.classList.add("hidden");
    status.textContent = networkOffline
      ? "Connection lost · waiting for network"
      : `Connection lost · reconnecting (${reconnectAttempts})...`;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (pageUnloading || socketIsActive()) return;
    connect({ automatic: true, name });
  }, delayMs);
}

function connect(options = {}) {
  const automatic = Boolean(options?.automatic);
  if (socketIsActive()) return;

  if (!automatic) {
    clearReconnectTimer();
    reconnectAttempts = 0;
  }

  const name = cleanName(options?.name || screenName.value);
  signOn.disabled = true;
  localStorage.setItem("aol96-screen-name", name);
  if (!automatic || !capture) {
    startOrResumeCapture(name);
  } else {
    recordCaptureEvent({ type: "connection", action: "reconnect-attempt", attempt: reconnectAttempts });
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const debugArg = debug ? "&debug=1" : "";
  const url = `${protocol}//${location.host}/ws?room=town-square&name=${encodeURIComponent(name)}${debugArg}`;
  let connection;
  try {
    connection = new WebSocket(url);
  } catch (error) {
    socket = null;
    const detail = String(error?.message || error || "");
    recordCaptureEvent({ type: "connection", action: "error", detail, automatic });
    if (automatic) {
      scheduleReconnect(name, { reason: detail });
    } else {
      signOn.disabled = false;
      status.textContent = "Connection error";
      signin.classList.remove("hidden");
    }
    return;
  }

  socket = connection;
  status.textContent = automatic ? "Reconnecting..." : "Connecting...";

  connection.addEventListener("open", () => {
    if (socket !== connection) return;
    const wasReconnect = automatic || reconnectAttempts > 0;
    clearReconnectTimer();
    reconnectAttempts = 0;
    signin.classList.add("hidden");
    signOn.disabled = false;
    status.textContent = "Connected";
    recordCaptureEvent({ type: "connection", action: wasReconnect ? "reconnected" : "open" });
    clearInterval(pulseTimer);
    pulseTimer = setInterval(() => {
      if (socket === connection && connection.readyState === WebSocket.OPEN) connection.send("pulse");
    }, 1500);
  });

  connection.addEventListener("message", (event) => {
    if (socket !== connection || event.data === "pong") return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    if (data.type === "hello") {
      transcript.replaceChildren();
      renderedMessageKeys.clear();
      const captureFloor = capture ? capture.startedAt - 10000 : Date.now() - 10000;
      for (const item of data.history || []) {
        addLine(item);
        if (Number(item?.at || 0) >= captureFloor) recordCaptureMessage(item, true);
      }
      setUsers(data.users || []);
      clock.textContent = data.simulatedDate || "November 22, 1996";
      status.textContent = `Connected · ${data.provider || "1996 chatter"}`;
      if (capture) {
        capture.simulatedDate = data.simulatedDate || capture.simulatedDate;
        capture.provider = data.provider || capture.provider;
        capture.pass = data.pass ?? capture.pass;
      }
      recordCaptureEvent({
        type: "hello",
        simulatedDate: data.simulatedDate || "",
        provider: data.provider || "",
        pass: data.pass ?? null,
        users: data.users || []
      });
    } else if (data.type === "message") {
      addLine(data.message);
      recordCaptureMessage(data.message);
      if (data.message?.source === "groq") status.textContent = "Connected · Groq active";
    } else if (data.type === "presence") {
      setUsers(data.users || []);
      if (data.simulatedDate) clock.textContent = data.simulatedDate;
      recordCaptureEvent({
        type: "presence",
        users: data.users || [],
        count: Number(data.count ?? (data.users || []).length),
        simulatedDate: data.simulatedDate || ""
      });
    } else if (data.type === "ai_status") {
      status.textContent = `Connected · ${data.status}`;
      if (capture) capture.provider = data.status || capture.provider;
      recordCaptureEvent({ type: "ai_status", status: data.status || "" });
    } else if (data.type === "profile") {
      showProfile(data.profile, data.requestedName);
    } else if (data.type === "social_debug") {
      renderDebug(data.state);
    }
  });

  connection.addEventListener("close", (event) => {
    if (socket !== connection) return;
    clearInterval(pulseTimer);
    pulseTimer = null;
    socket = null;
    recordCaptureEvent({
      type: "connection",
      action: "close",
      code: Number(event.code || 0),
      reason: String(event.reason || ""),
      wasClean: Boolean(event.wasClean)
    });
    persistCapture(true);
    if (pageUnloading) return;
    scheduleReconnect(name, event);
  });

  connection.addEventListener("error", () => {
    if (socket !== connection) return;
    recordCaptureEvent({ type: "connection", action: "error" });
    status.textContent = "Connection problem · waiting to reconnect";
  });
}

function sendMessage() {
  const text = message.value.trim();
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "chat", text }));
  message.value = "";
  message.focus();
}

function requestProfile() {
  const selected = people.value;
  if (!selected || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "profile", name: selected }));
}

function showProfile(profile, requestedName) {
  profileBody.replaceChildren();
  profileTitle.textContent = `Member Profile: ${requestedName || profile?.name || "Unknown"}`;

  if (!profile) {
    const p = document.createElement("p");
    p.textContent = "This member has not shared a profile.";
    profileBody.append(p);
  } else {
    const rows = [
      ["Screen Name", profile.name],
      ["Age / Sex", `${profile.age} / ${profile.sex === "female" ? "F" : profile.sex === "male" ? "M" : profile.sex}`],
      ["Location", profile.location],
      ["Occupation", profile.occupation],
      ["Interests", (profile.interests || []).join(", ")],
      ["About Me", profile.about]
    ];
    if (profile.schedule) rows.push(["Usually Online", profile.schedule]);
    if (profile.connection) rows.push(["You & Member", profile.connection]);

    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "profile-row";
      const strong = document.createElement("strong");
      strong.textContent = `${label}:`;
      const span = document.createElement("span");
      span.textContent = value || "";
      row.append(strong, span);
      profileBody.append(row);
    }
  }

  profileDialog.classList.remove("hidden");
}

function renderDebug(state) {
  if (!debug || !debugPanel || !state) return;
  debugPanel.classList.remove("hidden");
  const threads = (state.threads || []).map((thread) => `${thread.id}:${thread.topic}(${thread.people.join("/")})×${thread.turns}`).join(" | ") || "none";
  const relationships = (state.relationships || []).join(" | ") || "none yet";
  debugPanel.textContent = `PASS ${state.pass || "?"} · ${state.simulated || ""} · bots ${state.roster || 0}\nthreads: ${threads}\nmemory: ${state.memory || "none"}\nrelationships: ${relationships}`;
}

signOn.addEventListener("click", () => connect());
screenName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    connect();
  }
});
send.addEventListener("click", sendMessage);
message.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
profileButton.addEventListener("click", requestProfile);
people.addEventListener("dblclick", requestProfile);
closeProfile.addEventListener("click", () => profileDialog.classList.add("hidden"));
closeProfileBottom.addEventListener("click", () => profileDialog.classList.add("hidden"));
if (exportChat) exportChat.addEventListener("click", exportCapture);

window.addEventListener("offline", () => {
  if (!socketIsActive()) status.textContent = "Connection lost · waiting for network";
});

window.addEventListener("online", () => {
  if (pageUnloading || socketIsActive() || (!reconnectTimer && reconnectAttempts === 0)) return;
  clearReconnectTimer();
  status.textContent = "Network back · reconnecting...";
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!pageUnloading && !socketIsActive()) {
      connect({ automatic: true, name: cleanName(screenName.value) });
    }
  }, 100);
});

window.addEventListener("beforeunload", () => {
  pageUnloading = true;
  clearReconnectTimer();
  persistCapture(true);
});