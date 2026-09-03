import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 8900 + (process.pid % 500);
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
  while (logs.length > 120) logs.shift();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The historical CI workflows intentionally run npm scripts without npm install.
// Bootstrap a pinned Wrangler only for this contract process so Phase 0 executes
// inside a workerd build new enough for production's 2026-08-19 compatibility date.
// On POSIX, detach the process group so cleanup can terminate Wrangler, esbuild,
// and workerd together instead of leaving grandchildren alive after the tests pass.
const groupKillSupported = process.platform !== "win32";
const child = spawn(
  "npx",
  [
    "--yes",
    "wrangler@4.127.1",
    "dev",
    "--config",
    "wrangler.runtime-contract.jsonc",
    "--port",
    String(port)
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: groupKillSupported
  }
);

child.stdout.on("data", (chunk) => pushLog("wrangler: ", chunk));
child.stderr.on("data", (chunk) => pushLog("wrangler! ", chunk));
child.on("exit", (code) => {
  exited = true;
  exitCode = code;
});
child.on("error", (error) => {
  pushLog("spawn! ", error?.stack || error?.message || String(error));
});

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
  if (!exited) {
    signalWorker("SIGKILL");
    for (let i = 0; i < 10 && !exited; i += 1) await sleep(25);
  }
}

async function waitForWorker() {
  let lastError = "";
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (exited) break;
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) {
        const data = await response.json();
        if (data?.ok && data?.runtime === "workerd") return data;
      }
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await sleep(100);
  }
  throw new Error([
    `runtime-contract Worker did not become ready${lastError ? `: ${lastError}` : ""}`,
    `wrangler exit code: ${exitCode}`,
    ...logs.slice(-30)
  ].join("\n"));
}

async function runContract(name) {
  const response = await fetch(`${origin}/contract/${encodeURIComponent(name)}`);
  let data = null;
  try { data = await response.json(); } catch {}
  assert.equal(response.ok, true, `${name} HTTP failure: ${JSON.stringify(data)}`);
  assert.equal(data?.ok, true, `${name} contract failure: ${JSON.stringify(data)}`);
  assert.equal(data?.contract, name);
  console.log(`ok - ${name}`);
  return data.detail;
}

const contracts = [
  "ambient-generation",
  "queue-pipeline",
  "human-scene-exclusion",
  "closed-scene",
  "hydration",
  "singleflight",
  "world-gate",
  "reconnect",
  "explicit-target",
  "human-interrupt",
  "semantic-gap"
];

try {
  await waitForWorker();
  for (const name of contracts) await runContract(name);
  console.log(`v41 real-Worker runtime characterization: ${contracts.length}/${contracts.length} contracts passed`);
} catch (error) {
  console.error(error?.stack || error);
  if (logs.length) {
    console.error("\nwrangler tail:\n" + logs.slice(-40).join("\n"));
  }
  process.exitCode = 1;
} finally {
  await stopWorker();
}
