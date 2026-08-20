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

let socket;
let pulseTimer;

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
  }
  transcript.append(row);
  while (transcript.children.length > 120) transcript.firstElementChild.remove();
  transcript.scrollTop = transcript.scrollHeight;
}

function setUsers(users = []) {
  people.replaceChildren(...users.map((user) => {
    const option = document.createElement("option");
    option.textContent = user;
    return option;
  }));
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
