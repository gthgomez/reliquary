import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_RELIQUARY_PUBLIC: "1", ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Same as build:web but enables browser-regression economy probes in the client bundle. */
run(process.execPath, [join(root, "scripts/build-web.mjs")], {
  VITE_RELIQUARY_BROWSER_TEST: "1",
});

console.log("[build:web:test] browser-test probes enabled");
