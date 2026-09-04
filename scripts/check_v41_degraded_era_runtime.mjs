import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { wranglerSpawnSpec } from "./wrangler_spawn.mjs";

const port = 10400 + (process.pid % 300);
const origin = `http://127.0.0.1:${port}`;
const logs = [];
let exited = false;
let exitCode = null;

function pushLog(prefix, chunk) {
  const text = String(chunk || "");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    logs.push(`${prefix}${line}`);
  }
  while (logs.length > 140) logs.shift();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const groupKillSupported = process.platform !== "win32";
const wrangler = wranglerSpawnSpec([
  "dev",
  "--config",
  "wrangler.degraded-era-contract.jsonc",
  "--port",
  String(port)
]);
const child = spawn(
  wrangler.command,
  wrangler.args,
  {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: groupKillSupported
  }
);

child.stdout.on("data", (chunk) => pushLog("wrangler: ", chunk));
child.stderr.on("data", (chunk) => pushLog("wrangler! ", chunk));
child.on("exit", (code) => { exited = true; exitCode = code; });
child.on("error", (error) => pushLog("spawn! ", error?.stack || error?.message || String(error)));

function signalWorker(signal) {
  try {
    if (groupKillSupported && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {}
}

async function stopWorker() {
  if (exited) return;
  signalWorker("SIGTERM");
  for (let i = 0; i < 30 && !exited; i += 1) await sleep(50);
  if (!exited) signalWorker("SIGKILL");
}

async function waitForWorker() {
  let lastError = "";
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (exited) break;
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) {
        const data = await response.json();
        if (data?.ok && data?.runtime === "workerd" && data?.contract === "degraded-era") return;
      }
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await sleep(100);
  }
  throw new Error([
    `v41 degraded-era Worker did not become ready${lastError ? `: ${lastError}` : ""}`,
    `wrangler exit code: ${exitCode}`,
    ...logs.slice(-35)
  ].join("\n"));
}

async function runContract(name) {
  const response = await fetch(`${origin}/contract/${encodeURIComponent(name)}`);
  let data = null;
  try { data = await response.json(); } catch {}
  assert.equal(response.ok, true, `${name} HTTP failure: ${JSON.stringify(data)}`);
  assert.equal(data?.ok, true, `${name} contract failure: ${JSON.stringify(data)}`);
  console.log(`ok - ${name}`);
  return data?.detail || {};
}

try {
  await waitForWorker();
  const era = await runContract("degraded-era-fallback");
  assert.equal(era.text, "what? never heard of that");
  assert.equal(era.eraSafe, true);

  const longScope = await runContract("long-current-scope");
  assert.equal(longScope.trusted, true);
  assert.ok(Number(longScope.textLength || 0) > 180);

  const responder = await runContract("degraded-responder-fail-closed");
  assert.equal(responder.failClosed, true);
  assert.equal(responder.reason, "required-responder-not-first");

  console.log("v41 degraded-provider/identity real-Worker contracts: 3/3 passed");
} catch (error) {
  console.error(error?.stack || error);
  if (logs.length) console.error("\nwrangler tail:\n" + logs.slice(-50).join("\n"));
  process.exitCode = 1;
} finally {
  await stopWorker();
}
