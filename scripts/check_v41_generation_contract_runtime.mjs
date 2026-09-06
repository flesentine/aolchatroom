import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { wranglerSpawnSpec } from "./wrangler_spawn.mjs";

const port = 10100 + (process.pid % 300);
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
  while (logs.length > 180) logs.shift();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const groupKillSupported = process.platform !== "win32";
const wrangler = wranglerSpawnSpec([
  "dev",
  "--config",
  "wrangler.generation-contract.jsonc",
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
        if (data?.ok && data?.runtime === "workerd" && data?.phase === "2B") return;
      }
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await sleep(100);
  }
  throw new Error([
    `v41 Phase 2B Worker did not become ready${lastError ? `: ${lastError}` : ""}`,
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
  assert.equal(data?.contract, name);
  console.log(`ok - ${name}`);
}

const contracts = [
  "semantic-reject",
  "semantic-scoped-reject",
  "semantic-polarity-scope-reject",
  "semantic-pass",
  "human-fallback",
  "era-primary-reject",
  "era-fallback-safe",
  "human-tail-fail-closed",
  "human-answer-first-pass",
  "human-bad-fallback-reject",
  "clarification-reject",
  "background-untouched",
  "v37-stack-characterization",
  "wrapper-retirement-v37-lively",
  "wrapper-retirement-v37-human-director",
  "wrapper-retirement-v37-free-providers",
  "wrapper-retirement-v37-human-only",
  "wrapper-retirement-v38-quality",
  "wrapper-retirement-v39-coherence",
  "wrapper-retirement-v39-presence",
  "wrapper-retirement-v39-world",
  "bot-roster-cooldown-filtering",
  "bot-roster-leave-bookkeeping",
  "bot-roster-blocked-reentry",
  "world-date-guard-order",
  "world-date-console-normalization",
  "world-date-historical-audit",
  "coherence-target-repair",
  "coherence-voice-lock",
  "explicit-error-challenge-repair",
  "reconnect-authority-quick",
  "reconnect-same-name-replacement",
  "reconnect-committed-close",
  "status"
];

try {
  await waitForWorker();
  for (const name of contracts) await runContract(name);
  console.log(`v41 Phase 2 real-Worker generation contracts: ${contracts.length}/${contracts.length} passed`);
} catch (error) {
  console.error(error?.stack || error);
  if (logs.length) console.error("\nwrangler tail:\n" + logs.slice(-55).join("\n"));
  process.exitCode = 1;
} finally {
  await stopWorker();
}
