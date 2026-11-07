import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = join(root, "node_modules", "vite", "bin", "vite.js");
const build = spawnSync(
  process.execPath,
  [vite, "build", "--config", "vite.public-game.config.ts", "--mode", "ages-preview"],
  { cwd: root, env: { ...process.env, VITE_RELIQUARY_BROWSER_TEST: "1" }, stdio: "inherit" },
);
if (build.error || build.status !== 0) {
  if (build.error) console.error(build.error.message);
  process.exit(build.status ?? 1);
}
const dir = join(root, "dist", "ages-preview");
copyFileSync(join(dir, "public-game.html"), join(dir, "index.html"));
console.log(JSON.stringify({ status: "PASS", output: dir, entry: "/?ages-preview=1", pwa: false }));
