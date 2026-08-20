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

let socket;
let pulseTimer;
const debug = new URLSearchParams(location.search).get("debug") === "1";

screenName.value = localStorage.getItem("aol96-screen-name") || "";
screenName.focus();

function cleanName(value) {
  return String(value || "Guest").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16) || "Guest";
}

function addLine(item) {
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
      meta.textContent = ` [${item.source}/${item.intent || "chat"}${target}]`;
      row.append(meta);
    }
  }
  transcript.append(row);
  while (transcript.children.length > 180) transcript.firstElementChild.remove();
  transcript.scrollTop = transcript.scrollHeight;
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

function connect() {
  const name = cleanName(screenName.value);
  localStorage.setItem("aol96-screen-name", name);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${location.host}/ws?room=town-square&name=${encodeURIComponent(name)}`;
  socket = new WebSocket(url);
  status.textContent = "Connecting...";

  socket.addEventListener("open", () => {
    signin.classList.add("hidden");
    status.textContent = "Connected";
    clearInterval(pulseTimer);
    pulseTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("pulse");
    }, 1500);
  });

  socket.addEventListener("message", (event) => {
    if (event.data === "pong") return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    if (data.type === "hello") {
      transcript.replaceChildren();
      for (const item of data.history || []) addLine(item);
      setUsers(data.users || []);
      clock.textContent = data.simulatedDate || "November 22, 1996";
      status.textContent = `Connected · ${data.provider || "1996 chatter"}`;
    } else if (data.type === "message") {
      addLine(data.message);
      if (data.message?.source === "groq") status.textContent = "Connected · Groq active";
    } else if (data.type === "presence") {
      setUsers(data.users || []);
    } else if (data.type === "ai_status") {
      status.textContent = `Connected · ${data.status}`;
    } else if (data.type === "profile") {
      showProfile(data.profile, data.requestedName);
    }
  });

  socket.addEventListener("close", () => {
    clearInterval(pulseTimer);
    status.textContent = "Disconnected - click Sign On to reconnect";
    signin.classList.remove("hidden");
  });

  socket.addEventListener("error", () => {
    status.textContent = "Connection error";
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

signOn.addEventListener("click", connect);
screenName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connect();
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
