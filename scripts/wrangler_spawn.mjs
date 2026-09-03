import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const PINNED_WRANGLER_VERSION = "4.127.1";

export function wranglerSpawnSpec(args = []) {
  const local = resolve(process.cwd(), "node_modules", ".bin", "wrangler");

  // CI bootstraps the pinned package once before the aggregate suite. Reuse
  // that binary directly so each real-Worker harness does not independently
  // contact npm. Preserve the historical npx fallback for developer machines
  // where dependencies have not been installed.
  if (process.platform !== "win32" && existsSync(local)) {
    return { command: local, args: [...args], source: "local" };
  }

  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["--yes", `wrangler@${PINNED_WRANGLER_VERSION}`, ...args],
    source: "npx"
  };
}
