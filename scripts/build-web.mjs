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

run(process.execPath, [join(root, "scripts/generate-reliquary-icons.mjs")]);
run(process.execPath, [join(root, "scripts/tint-new-sprites.mjs")]);

const staticDir = join(root, ".vercel/output/static");
mkdirSync(staticDir, { recursive: true });
copyFileSync(join(root, "public/manifest.webmanifest"), join(staticDir, "manifest.webmanifest"));

run(process.execPath, [
  join(root, "scripts/with-app-env.mjs"),
  "vite",
  "build",
  "--config",
  "vite.public-game.config.ts",
]);

const gameShell = join(staticDir, "public-game.html");
const indexShell = join(staticDir, "index.html");
if (!existsSync(gameShell)) {
  console.error("[build:web] public-game.html missing after client build");
  process.exit(1);
}
copyFileSync(gameShell, indexShell);

run(process.execPath, [join(root, "scripts/build-pwa.mjs")]);

if (!existsSync(indexShell)) {
  console.error("[build:web] index.html shell missing");
  process.exit(1);
}

console.log("[build:web] complete");
