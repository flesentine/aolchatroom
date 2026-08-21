(() => {
  const NativeWebSocket = window.WebSocket;
  const STORAGE_KEY = "aol96-chat-capture-v2";
  const RESUME_GAP_MS = 10 * 60 * 1000;
  const SERVER_ECHO_WINDOW_MS = 10000;

  let capture = null;
  let persistTimer = null;
  const serverMessageKeys = new Set();

  function now() {
    return Date.now();
  }

  function cleanName(value) {
    return String(value || "Guest").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16) || "Guest";
  }

  function messageKey(item) {
    return [item?.at || "", item?.from || "", item?.kind || "", item?.text || ""].join("|");
  }

  function loadCapture(name) {
    const current = now();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch {}

    const canResume = saved
      && saved.schema === "aol96-chat-capture-v2"
      && saved.screenName === name
      && Array.isArray(saved.events)
      && current - Number(saved.updatedAt || 0) <= RESUME_GAP_MS;

    capture = canResume ? saved : {
      schema: "aol96-chat-capture-v2",
      captureId: `${current}-${Math.random().toString(36).slice(2, 8)}`,
      room: "Town Square",
      screenName: name,
      startedAt: current,
      updatedAt: current,
      simulatedDate: "",
      provider: "",
      pass: null,
      events: []
    };

    serverMessageKeys.clear();
    for (const event of capture.events) {
      if (event.type === "message" && !event.localOnly) serverMessageKeys.add(messageKey(event));
    }

    record({ type: "connection", action: canResume ? "resume" : "sign-on" });
    persist(true);
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persist(), 1000);
  }

  function persist(force = false) {
    if (!capture) return;
    if (force) clearTimeout(persistTimer);
    capture.updatedAt = now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(capture)); } catch {}
  }

  function record(event) {
    if (!capture) return;
    capture.events.push({ receivedAt: now(), ...event });
    capture.updatedAt = now();
    schedulePersist();
  }

  function recordLocalHuman(text) {
    if (!capture || !text) return;
    record({
      type: "message",
      at: now(),
      from: capture.screenName,
      text: String(text),
      kind: "human",
      source: "human-local",
      intent: "human",
      target: "unresolved",
      topic: "",
      threadId: "",
      replayed: false,
      localOnly: true,
      confirmed: false
    });
  }

  function reconcileLocalHuman(item) {
    if (!capture || item?.kind !== "human" || item?.from !== capture.screenName) return false;
    const itemAt = Number(item.at || now());
    for (let i = capture.events.length - 1; i >= 0; i -= 1) {
      const event = capture.events[i];
      if (event.type !== "message" || event.kind !== "human" || !event.localOnly) continue;
      if (event.text !== item.text) continue;
      if (Math.abs(itemAt - Number(event.at || 0)) > SERVER_ECHO_WINDOW_MS) continue;
      Object.assign(event, {
        at: itemAt,
        from: item.from || event.from,
        text: item.text || event.text,
        kind: "human",
        source: item.source || "human",
        intent: item.intent || "human",
        target: item.target || "room",
        topic: item.topic || "general",
        threadId: item.threadId || "",
        replayed: false,
        localOnly: false,
        confirmed: true,
        receivedAt: now()
      });
      serverMessageKeys.add(messageKey(event));
      schedulePersist();
      return true;
    }
    return false;
  }

  function recordServerMessage(item, replayed = false) {
    if (!capture || !item) return;
    if (reconcileLocalHuman(item)) return;
    const key = messageKey(item);
    if (serverMessageKeys.has(key)) return;
    serverMessageKeys.add(key);
    record({
      type: "message",
      at: Number(item.at || now()),
      from: item.from || "",
      text: item.text || "",
      kind: item.kind || "",
      source: item.source || "",
      intent: item.intent || "",
      target: item.target || "room",
      topic: item.topic || "general",
      threadId: item.threadId || "",
      messageId: item.messageId || "",
      replyTo: item.replyTo || "",
      sceneId: item.sceneId || "",
      replayed: Boolean(replayed),
      localOnly: false,
      confirmed: true
    });
  }

  function processIncoming(data) {
    if (!capture || !data || typeof data !== "object") return;

    if (data.type === "hello") {
      capture.simulatedDate = data.simulatedDate || capture.simulatedDate;
      capture.provider = data.provider || capture.provider;
      capture.pass = data.pass ?? capture.pass;
      const floor = capture.startedAt - 10000;
      for (const item of data.history || []) {
        if (Number(item?.at || 0) >= floor) recordServerMessage(item, true);
      }
      record({
        type: "hello",
        simulatedDate: data.simulatedDate || "",
        provider: data.provider || "",
        pass: data.pass ?? null,
        users: data.users || []
      });
      return;
    }

    if (data.type === "message") {
      recordServerMessage(data.message, false);
      return;
    }

    if (data.type === "presence") {
      record({
        type: "presence",
        users: data.users || [],
        count: Number(data.count ?? (data.users || []).length),
        simulatedDate: data.simulatedDate || ""
      });
      return;
    }

    if (data.type === "ai_status") {
      capture.provider = data.status || capture.provider;
      record({ type: "ai_status", status: data.status || "" });
      return;
    }

    if (data.type === "ai_provider") {
      record({
        type: "ai_provider",
        provider: data.provider || "",
        label: data.label || "",
        state: data.state || "",
        model: data.model || "",
        latencyMs: Number(data.latencyMs || 0),
        messageCount: Number(data.messageCount || 0),
        httpStatus: data.httpStatus ?? null,
        cooldownMs: Number(data.cooldownMs || 0),
        detail: data.detail || ""
      });
    }
  }

  function attachCapture(ws, urlValue) {
    let parsed;
    try { parsed = new URL(String(urlValue), location.href); } catch { return ws; }
    if (!/\/ws$/.test(parsed.pathname)) return ws;

    const name = cleanName(parsed.searchParams.get("name"));
    if (!capture || capture.screenName !== name) loadCapture(name);

    const nativeSend = ws.send.bind(ws);
    ws.send = function sendWithCapture(data) {
      if (typeof data === "string") {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData?.type === "chat" && parsedData.text) recordLocalHuman(parsedData.text);
        } catch {}
      }
      return nativeSend(data);
    };

    ws.addEventListener("open", () => record({ type: "connection", action: "open" }));
    ws.addEventListener("close", () => {
      record({ type: "connection", action: "close" });
      persist(true);
    });
    ws.addEventListener("error", () => record({ type: "connection", action: "error" }));
    ws.addEventListener("message", (event) => {
      if (event.data === "pong" || typeof event.data !== "string") return;
      try { processIncoming(JSON.parse(event.data)); } catch {}
    });
    return ws;
  }

  function CapturingWebSocket(url, protocols) {
    const ws = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    return attachCapture(ws, url);
  }

  CapturingWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(CapturingWebSocket, NativeWebSocket);
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    try { Object.defineProperty(CapturingWebSocket, key, { value: NativeWebSocket[key] }); } catch {}
  }
  window.WebSocket = CapturingWebSocket;

  function exportCaptureV2() {
    if (!capture) return;
    persist(true);
    const exportedAt = now();
    const messages = capture.events.filter((event) => event.type === "message");
    const providers = capture.events.filter((event) => event.type === "ai_provider");
    const sourceCounts = {};
    const kindCounts = {};
    const speakerCounts = {};
    const providerCounts = {};

    for (const event of messages) {
      const source = event.source || "unknown";
      const kind = event.kind || "unknown";
      const speaker = event.from || "system";
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      kindCounts[kind] = (kindCounts[kind] || 0) + 1;
      speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
    }
    for (const event of providers) {
      if (event.state !== "success") continue;
      const provider = event.provider || "unknown";
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
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
        exportedAt,
        exportedAtIso: new Date(exportedAt).toISOString(),
        durationSeconds: Math.round((exportedAt - capture.startedAt) / 1000),
        simulatedDate: capture.simulatedDate,
        provider: capture.provider,
        pass: capture.pass
      },
      summary: {
        eventCount: capture.events.length,
        messageCount: messages.length,
        humanMessageCount: messages.filter((event) => event.kind === "human").length,
        botMessageCount: messages.filter((event) => event.kind === "bot").length,
        sourceCounts,
        kindCounts,
        speakerCounts,
        providerSuccessCounts: providerCounts,
        providerFailureCount: providers.filter((event) => event.state === "cooldown").length
      },
      events: capture.events
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const stamp = new Date(capture.startedAt).toISOString().replace(/[:.]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `aol96-town-square-${capture.screenName}-${stamp}-v2.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

    const button = document.querySelector("#exportChat");
    if (button) {
      const old = button.textContent;
      button.textContent = "Saved!";
      setTimeout(() => { button.textContent = old; }, 1400);
    }
  }

  const exportButton = document.querySelector("#exportChat");
  if (exportButton) {
    exportButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportCaptureV2();
    }, true);
  }

  window.addEventListener("beforeunload", () => persist(true));
})();
