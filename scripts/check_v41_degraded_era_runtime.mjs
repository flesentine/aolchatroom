import assert from "node:assert/strict";
import { spawn } from "node:child_process";

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
const child = spawn(
  "npx",
  ["--yes", "wrangler@4.127.1", "dev", "--config", "wrangler.degraded-era-contract.jsonc", "--port", String(port)],
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

try {
  await waitForWorker();
  const response = await fetch(`${origin}/contract/degraded-era-fallback`);
  let data = null;
  try { data = await response.json(); } catch {}
  assert.equal(response.ok, true, `degraded-era HTTP failure: ${JSON.stringify(data)}`);
  assert.equal(data?.ok, true, `degraded-era contract failure: ${JSON.stringify(data)}`);
  assert.equal(data?.detail?.text, "what? never heard of that");
  assert.equal(data?.detail?.eraSafe, true);
  console.log("ok - degraded-era-fallback");
  console.log("v41 degraded-provider sealed-era real-Worker contract: 1/1 passed");
} catch (error) {
  console.error(error?.stack || error);
  if (logs.length) console.error("\nwrangler tail:\n" + logs.slice(-50).join("\n"));
  process.exitCode = 1;
} finally {
  await stopWorker();
}
